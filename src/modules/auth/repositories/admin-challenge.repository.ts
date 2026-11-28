import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  protectedVerifier,
  requireSystemContext,
  serverInstant,
} from '../../../database/persistence-checks.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
interface Secret {
  verifier: Uint8Array;
  encryptedMail: Uint8Array;
}
function secret(input: Secret) {
  const hash = protectedVerifier(input.verifier);
  if (
    !(input.encryptedMail instanceof Uint8Array) ||
    !input.encryptedMail.byteLength
  )
    throw new PersistenceInvariantError(
      'Mensaje administrativo cifrado requerido.',
    );
  return { hash, mail: Buffer.from(input.encryptedMail) };
}
@Injectable()
export class PostgresAdminChallengeRepository {
  /** Candidate discovery must never substitute for password verification by auth. */
  async create(
    tx: PoolClient,
    accountId: string,
    observedPasswordHash: string,
    id: string,
    value: Secret,
    clock: () => Date = () => new Date(),
  ) {
    const s = secret(value);
    await requireSystemContext(tx);
    const { rows } = await tx.query<{ correo: string }>(
      `SELECT correo_presentacion AS correo FROM criterika.cuentas WHERE id=$1
      AND rol='ADMINISTRADOR' AND situacion_operativa='HABILITADA' AND correo_confirmado_en IS NOT NULL
      AND contrasena_hash=$2 AND (SELECT count(*) FROM criterika.cuentas WHERE rol='ADMINISTRADOR')=3 FOR UPDATE`,
      [accountId, observedPasswordHash],
    );
    if (!rows[0]) return false;
    const now = serverInstant(clock);
    await tx.query(
      `UPDATE criterika.desafios_verificacion SET usado_en=COALESCE(usado_en,$2),mensaje_envio_cifrado=NULL
      WHERE cuenta_id=$1 AND finalidad='LOGIN_ADMIN'`,
      [accountId, now],
    );
    await tx.query(
      `INSERT INTO criterika.desafios_verificacion(id,cuenta_id,clase,finalidad,correo_destino,verificador_hash,mensaje_envio_cifrado,creado_en,expira_en,reenvio_disponible_en)
      VALUES($1,$2,'CODIGO','LOGIN_ADMIN',$3,$4,$5,$6,$7,$8)`,
      [
        id,
        accountId,
        rows[0].correo,
        s.hash,
        s.mail,
        now,
        new Date(now.getTime() + 600000),
        new Date(now.getTime() + 60000),
      ],
    );
    return true;
  }
  private async lock(tx: PoolClient, id: string) {
    await requireSystemContext(tx);
    const candidate = await tx.query<{ accountId: string }>(
      `SELECT cuenta_id AS "accountId" FROM criterika.desafios_verificacion WHERE id=$1 AND clase='CODIGO' AND finalidad='LOGIN_ADMIN'`,
      [id],
    );
    const accountId = candidate.rows[0]?.accountId;
    if (!accountId) return null;
    const account = await tx.query(
      `SELECT id FROM criterika.cuentas WHERE id=$1 AND rol='ADMINISTRADOR'
      AND situacion_operativa='HABILITADA' AND correo_confirmado_en IS NOT NULL
      AND (SELECT count(*) FROM criterika.cuentas WHERE rol='ADMINISTRADOR')=3 FOR UPDATE`,
      [accountId],
    );
    if (!account.rowCount) return null;
    const { rows } = await tx.query<{
      accountId: string;
      hash: Buffer;
      created: Date;
      expires: Date;
      used: Date | null;
      available: Date;
      failures: number;
    }>(
      `SELECT cuenta_id AS "accountId",verificador_hash AS hash,creado_en AS created,expira_en AS expires,usado_en AS used,reenvio_disponible_en AS available,intentos_fallidos AS failures
       FROM criterika.desafios_verificacion WHERE id=$1 AND cuenta_id=$2 AND clase='CODIGO' AND finalidad='LOGIN_ADMIN' FOR UPDATE`,
      [id, accountId],
    );
    return rows[0] ?? null;
  }
  async resend(
    tx: PoolClient,
    id: string,
    value: Secret,
    clock: () => Date = () => new Date(),
  ) {
    const s = secret(value),
      row = await this.lock(tx, id);
    if (!row) return false;
    const now = serverInstant(clock);
    if (
      row.used ||
      row.failures >= 5 ||
      row.created > now ||
      row.expires <= now ||
      row.available > now
    )
      return false;
    await tx.query(
      `UPDATE criterika.desafios_verificacion SET verificador_hash=$2,mensaje_envio_cifrado=$3,
      creado_en=$4,expira_en=$5,reenvio_disponible_en=$6,intentos_fallidos=0,estado_envio='PENDIENTE' WHERE id=$1`,
      [
        id,
        s.hash,
        s.mail,
        now,
        new Date(now.getTime() + 600000),
        new Date(now.getTime() + 60000),
      ],
    );
    return true;
  }
  async consume(
    tx: PoolClient,
    id: string,
    value: Uint8Array,
    clock: () => Date = () => new Date(),
  ): Promise<{ kind: 'verified'; accountId: string } | { kind: 'invalid' }> {
    const hash = protectedVerifier(value),
      row = await this.lock(tx, id);
    if (!row) return { kind: 'invalid' };
    const now = serverInstant(clock);
    if (
      row.used ||
      row.failures >= 5 ||
      row.created > now ||
      row.expires <= now
    )
      return { kind: 'invalid' };
    if (!row.hash.equals(hash)) {
      await tx.query(
        `UPDATE criterika.desafios_verificacion SET intentos_fallidos=intentos_fallidos+1,
       usado_en=CASE WHEN intentos_fallidos=4 THEN $2 ELSE usado_en END,
       mensaje_envio_cifrado=CASE WHEN intentos_fallidos=4 THEN NULL ELSE mensaje_envio_cifrado END WHERE id=$1`,
        [id, now],
      );
      return { kind: 'invalid' };
    }
    await tx.query(
      'UPDATE criterika.desafios_verificacion SET usado_en=$2,mensaje_envio_cifrado=NULL WHERE id=$1',
      [id, now],
    );
    return { kind: 'verified', accountId: row.accountId };
  }
}
