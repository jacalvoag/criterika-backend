import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  PersistenceInvariantError,
  requireOne,
} from '../../../database/persistence-values.js';

// The ten-minute lifetime is part of the password-reset contract.
const RECOVERY_TTL_MS = 10 * 60 * 1000;
export interface RecoveryLinkInput {
  challengeId: string;
  accountId: string;
  verifierHash: Uint8Array;
  encryptedMail: Uint8Array;
}
function verifier(value: Uint8Array): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32)
    throw new PersistenceInvariantError(
      'Verificador de recuperación inválido.',
    );
  return Buffer.from(value);
}
function passwordHash(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    !/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]{22,}\$[A-Za-z0-9+/]{43,}$/.test(
      value,
    )
  )
    throw new PersistenceInvariantError(
      'Se requiere un hash Argon2id protegido.',
    );
  return value;
}
function instant(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new PersistenceInvariantError('Instante de contraseña inválido.');
  return new Date(value.getTime());
}

/** SQL only. Plain passwords/tokens, Argon2 comparison, mail and HTTP belong to auth/accounts. */
@Injectable()
export class PostgresPasswordRepository {
  /** Internal credential only: never return through HTTP or log it. Authenticate the ID first. */
  async findOwnedCredential(
    tx: PoolClient,
    authenticatedPlayerId: string,
  ): Promise<string | null> {
    const { rows } = await tx.query<{ hash: string }>(
      `SELECT contrasena_hash AS hash FROM criterika.cuentas WHERE id=$1 AND rol='JUGADOR'`,
      [authenticatedPlayerId],
    );
    return rows[0]?.hash ?? null;
  }

  private async requireContext(tx: PoolClient, playerId?: string) {
    const { rows } = await tx.query<{ allowed: boolean }>(
      `SELECT CASE WHEN $1::uuid IS NULL THEN current_setting('criterika.actor_tipo',true)='SISTEMA'
       ELSE current_setting('criterika.actor_tipo',true)='JUGADOR'
         AND NULLIF(current_setting('criterika.actor_id',true),'')::uuid=$1 END AS allowed`,
      [playerId ?? null],
    );
    if (rows[0]?.allowed !== true)
      throw new PersistenceInvariantError(
        'Contexto de contraseña no autorizado.',
      );
  }

  private async lockAccount(tx: PoolClient, accountId: string) {
    const { rows } = await tx.query<{
      rol: 'JUGADOR' | 'ADMINISTRADOR';
      passwordHash: string;
      correo: string;
      situacion: string;
      confirmedAt: Date | null;
    }>(
      `SELECT rol,contrasena_hash AS "passwordHash",correo_presentacion AS correo,
       situacion_operativa AS situacion,correo_confirmado_en AS "confirmedAt"
       FROM criterika.cuentas WHERE id=$1 FOR UPDATE`,
      [accountId],
    );
    return rows[0] ?? null;
  }

  /** Account ID comes from a trusted lookup; do not expose the boolean through public email requests. */
  async createRecovery(
    tx: PoolClient,
    input: RecoveryLinkInput,
    clock: () => Date = () => new Date(),
  ) {
    const hash = verifier(input.verifierHash);
    if (
      !(input.encryptedMail instanceof Uint8Array) ||
      !input.encryptedMail.byteLength
    )
      throw new PersistenceInvariantError(
        'Se requiere un mensaje de recuperación cifrado.',
      );
    const mail = Buffer.from(input.encryptedMail);
    await this.requireContext(tx);
    const account = await this.lockAccount(tx, input.accountId);
    if (!account || account.situacion !== 'HABILITADA' || !account.confirmedAt)
      return false;
    const at = instant(clock());
    await tx.query(
      `INSERT INTO criterika.desafios_verificacion
       (id,clase,finalidad,cuenta_id,correo_destino,verificador_hash,mensaje_envio_cifrado,creado_en,expira_en)
       VALUES($1,'ENLACE_RECUPERACION','RECUPERACION',$2,$3,$4,$5,$6,$7)`,
      [
        input.challengeId,
        input.accountId,
        account.correo,
        hash,
        mail,
        at,
        new Date(at.getTime() + RECOVERY_TTL_MS),
      ],
    );
    return true;
  }

  /** Opaque public token must be decoded/verified by auth into handle + protected verifier. */
  async reset(
    tx: PoolClient,
    challengeId: string,
    verifierHash: Uint8Array,
    newPasswordHash: string,
    clock: () => Date = () => new Date(),
  ): Promise<boolean> {
    const hash = verifier(verifierHash),
      next = passwordHash(newPasswordHash);
    await this.requireContext(tx);
    // Discovery does not lock the challenge before its account.
    const candidate = await tx.query<{ accountId: string }>(
      `SELECT cuenta_id AS "accountId" FROM criterika.desafios_verificacion
       WHERE id=$1 AND clase='ENLACE_RECUPERACION' AND finalidad='RECUPERACION' AND cuenta_id IS NOT NULL`,
      [challengeId],
    );
    const accountId = candidate.rows[0]?.accountId;
    if (!accountId) return false;
    const account = await this.lockAccount(tx, accountId);
    if (!account || account.situacion !== 'HABILITADA' || !account.confirmedAt)
      return false;
    await tx.query(
      'SELECT id FROM criterika.desafios_verificacion WHERE id=$1 FOR UPDATE',
      [challengeId],
    );
    const at = instant(clock());
    const used = await tx.query(
      `UPDATE criterika.desafios_verificacion SET usado_en=$4,mensaje_envio_cifrado=NULL
       WHERE id=$1 AND cuenta_id=$2 AND verificador_hash=$3
         AND clase='ENLACE_RECUPERACION' AND finalidad='RECUPERACION'
         AND usado_en IS NULL AND creado_en<=$4 AND expira_en>$4`,
      [challengeId, accountId, hash, at],
    );
    if (!used.rowCount) return false;
    await this.replaceAndInvalidate(tx, accountId, next, at);
    return true;
  }

  /** Caller verifies current plaintext and non-reuse before supplying its observed stored hash. */
  async changeOwned(
    tx: PoolClient,
    accountId: string,
    expectedPasswordHash: string,
    newPasswordHash: string,
    clock: () => Date = () => new Date(),
  ): Promise<'changed' | 'credential_conflict' | 'unavailable'> {
    const next = passwordHash(newPasswordHash);
    if (
      typeof expectedPasswordHash !== 'string' ||
      !expectedPasswordHash ||
      next === expectedPasswordHash
    )
      throw new PersistenceInvariantError('Cambio de credencial inválido.');
    await this.requireContext(tx, accountId);
    const account = await this.lockAccount(tx, accountId);
    if (
      !account ||
      account.rol !== 'JUGADOR' ||
      account.situacion !== 'HABILITADA'
    )
      return 'unavailable';
    if (account.passwordHash !== expectedPasswordHash)
      return 'credential_conflict';
    await this.replaceAndInvalidate(tx, accountId, next, instant(clock()));
    return 'changed';
  }

  private async replaceAndInvalidate(
    tx: PoolClient,
    accountId: string,
    next: string,
    at: Date,
  ) {
    const changed = await tx.query(
      'UPDATE criterika.cuentas SET contrasena_hash=$2,version=version+1 WHERE id=$1',
      [accountId, next],
    );
    requireOne(changed.rowCount);
    // Revoke every unrevoked session, including expired or anomalously future-dated rows.
    await tx.query(
      `UPDATE criterika.sesiones SET revocada_en=$2,identidad_confirmada_en=NULL
      WHERE cuenta_id=$1 AND revocada_en IS NULL`,
      [accountId, at],
    );
    await tx.query(
      `UPDATE criterika.desafios_verificacion
      SET usado_en=COALESCE(usado_en,$2),mensaje_envio_cifrado=NULL
      WHERE cuenta_id=$1 AND finalidad='RECUPERACION'`,
      [accountId, at],
    );
  }
}
