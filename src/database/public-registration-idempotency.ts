import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  canonicalJson,
  requireOne,
  PersistenceInvariantError,
  type JsonValue,
} from './persistence-values.js';
import { ProtectedPayloadCipher } from './protected-payload.js';

export interface PublicRegistrationIntention {
  /** Random UUID from Idempotency-Key, never derived from email or IP. */
  key: string;
  route: string;
}
interface Control {
  id: string;
  huella_solicitud: Buffer;
  estado: string;
  respuesta_cifrada: Buffer | null;
  codigo_http: number | null;
  expira_en: Date;
  cuenta_id: string | null;
  sesion_id: string | null;
}
export type PublicRegistrationClaim =
  | { kind: 'NEW'; id: string }
  | { kind: 'MISMATCH' | 'IN_PROGRESS' | 'EXPIRED' | 'REPLAY_DENIED' }
  | { kind: 'REPLAY'; status: number; body: JsonValue };

export class PublicRegistrationIdempotency {
  private readonly box: ProtectedPayloadCipher;
  private readonly key: Buffer;
  constructor(hmacKey: Uint8Array, encryptionKey: Uint8Array) {
    if (
      hmacKey.length !== 32 ||
      encryptionKey.length !== 32 ||
      Buffer.from(hmacKey).equals(Buffer.from(encryptionKey))
    )
      throw new Error('Claves de idempotencia inválidas.');
    this.key = Buffer.from(hmacKey);
    this.box = new ProtectedPayloadCipher(encryptionKey);
  }
  fingerprint(i: PublicRegistrationIntention, normalizedBody: unknown): Buffer {
    return this.hash('request', { route: i.route, body: normalizedBody });
  }
  /** Invoke from the internal cleanup task; tombstones remain for historical duplicate prevention. */
  async pruneExpiredResponses(
    tx: PoolClient,
    at: Date,
    limit = 100,
  ): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError('Límite de depuración inválido.');
    const result = await tx.query(
      `WITH expired AS (
      SELECT id FROM criterika.controles_idempotencia WHERE ruta_normalizada LIKE '/api/v1/auth/registrations%'
      AND expira_en<=$1 AND respuesta_cifrada IS NOT NULL ORDER BY expira_en,id LIMIT $2 FOR UPDATE SKIP LOCKED)
      UPDATE criterika.controles_idempotencia c SET respuesta_cifrada=NULL FROM expired e WHERE c.id=e.id`,
      [at, limit],
    );
    return result.rowCount ?? 0;
  }
  private hash(domain: string, value: unknown): Buffer {
    return createHmac('sha256', this.key)
      .update('criterika:public-registration:v1:' + domain + '\0')
      .update(canonicalJson(value))
      .digest();
  }
  async claim(
    tx: PoolClient,
    i: PublicRegistrationIntention,
    fingerprint: Buffer,
    clock: () => Date,
    authorize: (account: string, session: string, at: Date) => Promise<boolean>,
  ): Promise<PublicRegistrationClaim> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        i.key,
      ) ||
      !/^\/api\/v1\/auth\/registrations(?:\/[0-9a-f-]{36}\/(?:resend|verify))?$/.test(
        i.route,
      ) ||
      fingerprint.length !== 32
    )
      throw new PersistenceInvariantError();
    const scope = this.hash('scope', {
      key: i.key.toLowerCase(),
      route: i.route,
    });
    // The uniqueness wait serializes the same intention before any functional lock.
    const created = clock();
    const ins = await tx.query<{ id: string }>(
      `INSERT INTO criterika.controles_idempotencia
    (ambito_hash,metodo,ruta_normalizada,clave,huella_solicitud,estado,creado_en,expira_en)
    VALUES ($1,'POST',$2,$3,$4,'EN_PROCESO',$5,$6)
    ON CONFLICT (ambito_hash,metodo,ruta_normalizada,clave) DO NOTHING RETURNING id`,
      [
        scope,
        i.route,
        i.key,
        fingerprint,
        created,
        new Date(created.getTime() + 86400000),
      ],
    );
    if (ins.rows[0]) return { kind: 'NEW', id: ins.rows[0].id };
    const { rows } = await tx.query<Control>(
      `SELECT * FROM criterika.controles_idempotencia
    WHERE ambito_hash=$1 AND metodo='POST' AND ruta_normalizada=$2 AND clave=$3 FOR UPDATE`,
      [scope, i.route, i.key],
    );
    const r = rows[0];
    if (!r) throw new PersistenceInvariantError();
    if (
      r.huella_solicitud.length !== fingerprint.length ||
      !timingSafeEqual(r.huella_solicitud, fingerprint)
    )
      return { kind: 'MISMATCH' };
    if (r.expira_en <= clock()) {
      await tx.query(
        'UPDATE criterika.controles_idempotencia SET respuesta_cifrada=NULL WHERE id=$1',
        [r.id],
      );
      return { kind: 'EXPIRED' }; // Keep the tombstone: expiry never creates another session/effect.
    }
    if (r.estado !== 'CONFIRMADO') return { kind: 'IN_PROGRESS' };
    if (r.cuenta_id || r.sesion_id) {
      if (
        !r.cuenta_id ||
        !r.sesion_id ||
        !(await authorize(r.cuenta_id, r.sesion_id, clock()))
      )
        return { kind: 'REPLAY_DENIED' };
    }
    if (r.expira_en <= clock()) {
      await tx.query(
        'UPDATE criterika.controles_idempotencia SET respuesta_cifrada=NULL WHERE id=$1',
        [r.id],
      );
      return { kind: 'EXPIRED' };
    }
    if (!r.respuesta_cifrada || r.codigo_http === null)
      throw new PersistenceInvariantError();
    return {
      kind: 'REPLAY',
      status: r.codigo_http,
      body: JSON.parse(
        this.box.open(r.respuesta_cifrada, 'registration-response:' + r.id),
      ) as JsonValue,
    };
  }
  async confirm(
    tx: PoolClient,
    id: string,
    status: number,
    body: JsonValue,
    at: Date,
    binding?: { accountId: string; sessionId: string },
  ): Promise<void> {
    if (!Number.isInteger(status) || status < 200 || status > 599)
      throw new PersistenceInvariantError();
    const sensitive = (v: JsonValue): boolean => {
      if (v === null || typeof v !== 'object') return false;
      if (Array.isArray(v)) return v.some(sensitive);
      return (
        Object.hasOwn(v, 'accessToken') ||
        Object.hasOwn(v, 'refreshToken') ||
        Object.values(v).some(sensitive)
      );
    };
    if (sensitive(body) && !binding)
      throw new PersistenceInvariantError(
        'Respuesta sensible sin vinculación.',
      );
    if (binding) {
      if (
        body === null ||
        Array.isArray(body) ||
        typeof body !== 'object' ||
        status !== 201 ||
        body.sessionId !== binding.sessionId ||
        body.usuario === null ||
        typeof body.usuario !== 'object' ||
        Array.isArray(body.usuario) ||
        body.usuario.id !== binding.accountId
      ) {
        throw new PersistenceInvariantError(
          'Vinculación de respuesta no válida.',
        );
      }
    }
    const encrypted = this.box.seal(
      canonicalJson(body),
      'registration-response:' + id,
    );
    const r = await tx.query(
      `UPDATE criterika.controles_idempotencia SET estado='CONFIRMADO',codigo_http=$2,
    respuesta_cifrada=$3,cuenta_id=$4,sesion_id=$5,
    expira_en=CASE WHEN $4::uuid IS NOT NULL THEN LEAST(creado_en+interval '24 hours',$6::timestamptz+interval '5 minutes') ELSE expira_en END
    WHERE id=$1 AND estado='EN_PROCESO'`,
      [
        id,
        status,
        encrypted,
        binding?.accountId ?? null,
        binding?.sessionId ?? null,
        at,
      ],
    );
    requireOne(r.rowCount);
  }
}
