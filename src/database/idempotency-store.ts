import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  canonicalJson,
  PersistenceInvariantError,
  requireOne,
  type JsonValue,
} from './persistence-values.js';

export interface IdempotencyIdentity {
  cuentaId: string;
  sesionId: string;
  metodo: 'POST';
  /** Includes resource UUIDs; never a query string, credential or personal filter. */
  ruta: string;
  clave: string;
}

export type IdempotencyClaim =
  | { kind: 'NEW'; id: string }
  | { kind: 'REPLAY'; codigoHttp: number; respuesta: JsonValue }
  | { kind: 'IN_PROGRESS' }
  | { kind: 'MISMATCH' };

interface StoredControl {
  id: string;
  huella_solicitud: Buffer;
  estado: 'EN_PROCESO' | 'CONFIRMADO';
  respuesta_cifrada: Buffer | null;
  codigo_http: number | null;
  expira_en: Date;
}

export function idempotencyFromEnvironment(
  env: Record<string, unknown>,
): IdempotencyStore {
  const decode = (name: string): Buffer => {
    const value = env[name];
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
      throw new Error(`Configuración inválida: ${name}.`);
    }
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32 || key.toString('base64') !== value)
      throw new Error(`Configuración inválida: ${name}.`);
    return key;
  };
  return new IdempotencyStore(
    decode('IDEMPOTENCY_HMAC_KEY_BASE64'),
    decode('IDEMPOTENCY_ENCRYPTION_KEY_BASE64'),
  );
}

/** Technical provider: composition supplies independent 32-byte keys from secrets. */
export class IdempotencyStore {
  private readonly hmacKey: Buffer;
  private readonly encryptionKey: Buffer;

  constructor(hmacKey: Buffer, encryptionKey: Buffer) {
    if (
      hmacKey.length !== 32 ||
      encryptionKey.length !== 32 ||
      hmacKey.equals(encryptionKey)
    ) {
      throw new Error(
        'Idempotencia requiere dos claves independientes de 32 bytes.',
      );
    }
    this.hmacKey = Buffer.from(hmacKey);
    this.encryptionKey = Buffer.from(encryptionKey);
  }

  /** Also used by game answers without writing controles_idempotencia. */
  fingerprint(
    identity: Omit<IdempotencyIdentity, 'clave'>,
    body: unknown,
  ): Buffer {
    return this.hash('request', { ...identity, body });
  }

  async claim(
    client: PoolClient,
    identity: IdempotencyIdentity,
    body: unknown,
    now: Date,
  ): Promise<IdempotencyClaim> {
    const scope = this.hash('scope', {
      cuentaId: identity.cuentaId,
      sesionId: identity.sesionId,
    });
    const { clave: _key, ...request } = identity;
    const fingerprint = this.fingerprint(request, body);
    const values = [scope, identity.metodo, identity.ruta, identity.clave];
    const previous = await client.query<StoredControl>(
      `SELECT id, huella_solicitud, estado, respuesta_cifrada, codigo_http, expira_en
       FROM criterika.controles_idempotencia
       WHERE ambito_hash=$1 AND metodo=$2 AND ruta_normalizada=$3 AND clave=$4
       FOR UPDATE`,
      values,
    );
    if (previous.rows[0] && previous.rows[0].expira_en <= now) {
      await client.query(
        'DELETE FROM criterika.controles_idempotencia WHERE id=$1',
        [previous.rows[0].id],
      );
    } else if (previous.rows[0]) {
      return this.recover(previous.rows[0], fingerprint);
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO criterika.controles_idempotencia
       (ambito_hash, metodo, ruta_normalizada, clave, cuenta_id, sesion_id,
        huella_solicitud, estado, creado_en, expira_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'EN_PROCESO',$8,$9)
       ON CONFLICT (ambito_hash,metodo,ruta_normalizada,clave) DO NOTHING RETURNING id`,
      [
        ...values,
        identity.cuentaId,
        identity.sesionId,
        fingerprint,
        now,
        new Date(now.getTime() + 86_400_000),
      ],
    );
    if (inserted.rows[0]) return { kind: 'NEW', id: inserted.rows[0].id };
    // A concurrent owner may have confirmed while INSERT waited on its unique key.
    const concurrent = await client.query<StoredControl>(
      `SELECT id, huella_solicitud, estado, respuesta_cifrada, codigo_http, expira_en
       FROM criterika.controles_idempotencia
       WHERE ambito_hash=$1 AND metodo=$2 AND ruta_normalizada=$3 AND clave=$4 FOR UPDATE`,
      values,
    );
    if (!concurrent.rows[0]) throw new PersistenceInvariantError();
    return this.recover(concurrent.rows[0], fingerprint);
  }

  async confirm(
    client: PoolClient,
    id: string,
    codigoHttp: number,
    respuesta: JsonValue,
  ): Promise<void> {
    if (!Number.isInteger(codigoHttp) || codigoHttp < 100 || codigoHttp > 599)
      throw new PersistenceInvariantError();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(id));
    const encrypted = Buffer.concat([
      cipher.update(canonicalJson(respuesta), 'utf8'),
      cipher.final(),
    ]);
    const envelope = Buffer.concat([
      Buffer.from([1]),
      iv,
      cipher.getAuthTag(),
      encrypted,
    ]);
    const result = await client.query(
      `UPDATE criterika.controles_idempotencia
       SET estado='CONFIRMADO', codigo_http=$2, respuesta_cifrada=$3
       WHERE id=$1 AND estado='EN_PROCESO'`,
      [id, codigoHttp, envelope],
    );
    requireOne(result.rowCount);
  }

  private hash(domain: string, value: unknown): Buffer {
    return createHmac('sha256', this.hmacKey)
      .update(domain + '\0')
      .update(canonicalJson(value))
      .digest();
  }

  private recover(row: StoredControl, fingerprint: Buffer): IdempotencyClaim {
    if (
      row.huella_solicitud.length !== fingerprint.length ||
      !timingSafeEqual(row.huella_solicitud, fingerprint)
    ) {
      return { kind: 'MISMATCH' };
    }
    if (row.estado === 'EN_PROCESO') return { kind: 'IN_PROGRESS' };
    const envelope = row.respuesta_cifrada;
    if (
      !envelope ||
      envelope.length < 30 ||
      envelope[0] !== 1 ||
      row.codigo_http === null
    ) {
      throw new PersistenceInvariantError(
        'Respuesta idempotente no recuperable.',
      );
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        envelope.subarray(1, 13),
      );
      decipher.setAAD(Buffer.from(row.id));
      decipher.setAuthTag(envelope.subarray(13, 29));
      const text = Buffer.concat([
        decipher.update(envelope.subarray(29)),
        decipher.final(),
      ]).toString('utf8');
      return {
        kind: 'REPLAY',
        codigoHttp: row.codigo_http,
        respuesta: JSON.parse(text) as JsonValue,
      };
    } catch {
      throw new PersistenceInvariantError(
        'Respuesta idempotente no recuperable.',
      );
    }
  }
}
