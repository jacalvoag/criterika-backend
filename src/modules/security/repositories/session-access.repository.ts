import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';

export interface SessionIdentity {
  id: string;
  cuentaId: string;
  rol: 'JUGADOR' | 'ADMINISTRADOR';
  creadaEn: Date;
  expiraEn: Date;
  identidadConfirmadaEn: Date | null;
}
const IDENTITY = `s.id,s.cuenta_id AS "cuentaId",c.rol,s.creada_en AS "creadaEn",
  s.expira_en AS "expiraEn",s.identidad_confirmada_en AS "identidadConfirmadaEn"`;
const ACTIVE = `s.revocada_en IS NULL AND s.creada_en<=$3 AND s.expira_en>$3
  AND c.situacion_operativa='HABILITADA'`;
function hash(value: Uint8Array) {
  if (value.byteLength !== 32)
    throw new PersistenceInvariantError('Verificador de sesión inválido.');
  return Buffer.from(value);
}
function time(at: Date) {
  if (!Number.isFinite(at.getTime()))
    throw new PersistenceInvariantError('Instante de sesión inválido.');
  return at;
}

/** SQL only. JWT, credential comparison, authorization and replay policy belong to security/auth. */
@Injectable()
export class PostgresSessionAccessRepository {
  async findActive(
    tx: PoolClient,
    accountId: string,
    sessionId: string,
    role: SessionIdentity['rol'],
    at: Date,
  ): Promise<SessionIdentity | null> {
    const { rows } = await tx.query<SessionIdentity>(
      `SELECT ${IDENTITY}
      FROM criterika.sesiones s JOIN criterika.cuentas c ON c.id=s.cuenta_id
      WHERE s.id=$1 AND c.id=$2 AND ${ACTIVE} AND c.rol=$4`,
      [sessionId, accountId, time(at), role],
    );
    return rows[0] ?? null;
  }

  /** Include revoked/expired candidates so the coordinator can classify without reviving them. */
  async findRefreshCandidate(tx: PoolClient, refreshHash: Uint8Array) {
    const { rows } = await tx.query<{
      id: string;
      cuentaId: string;
      coincidencia: 'ACTUAL' | 'ANTERIOR';
    }>(
      `
      SELECT id,cuenta_id AS "cuentaId",
        CASE WHEN refresh_hash=$1 THEN 'ACTUAL' ELSE 'ANTERIOR' END AS coincidencia
      FROM criterika.sesiones WHERE refresh_hash=$1 OR refresh_anterior_hash=$1 LIMIT 2`,
      [hash(refreshHash)],
    );
    if (rows.length > 1)
      throw new PersistenceInvariantError('Verificador de sesión ambiguo.');
    return rows[0] ?? null;
  }

  /** All writers serialize account -> session, including revocation of all sessions. */
  private async lockOwned(
    tx: PoolClient,
    accountId: string,
    sessionId?: string,
  ) {
    const account = await tx.query(
      'SELECT id FROM criterika.cuentas WHERE id=$1 FOR UPDATE',
      [accountId],
    );
    if (!account.rowCount) return false;
    if (sessionId === undefined) return true;
    const session = await tx.query(
      'SELECT id FROM criterika.sesiones WHERE id=$1 AND cuenta_id=$2 FOR UPDATE',
      [sessionId, accountId],
    );
    return session.rowCount === 1;
  }

  /** Compare-and-swap: a stale hash cannot rotate twice. The absolute expiry is preserved. */
  async rotateRefresh(
    tx: PoolClient,
    accountId: string,
    sessionId: string,
    expected: Uint8Array,
    next: Uint8Array,
    clock: () => Date = () => new Date(),
  ) {
    const previous = hash(expected),
      replacement = hash(next);
    if (previous.equals(replacement))
      throw new PersistenceInvariantError(
        'La rotación requiere un nuevo verificador.',
      );
    if (!(await this.lockOwned(tx, accountId, sessionId))) return false;
    const at = time(clock());
    const { rowCount } = await tx.query(
      `UPDATE criterika.sesiones s
      SET refresh_anterior_hash=s.refresh_hash,refresh_hash=$5
      FROM criterika.cuentas c WHERE s.id=$1 AND c.id=$2 AND s.cuenta_id=c.id
      AND ${ACTIVE} AND s.refresh_hash=$4`,
      [sessionId, accountId, at, previous, replacement],
    );
    return rowCount === 1;
  }

  async revokeOwned(
    tx: PoolClient,
    accountId: string,
    sessionId: string,
    clock: () => Date = () => new Date(),
  ) {
    if (!(await this.lockOwned(tx, accountId, sessionId))) return false;
    const { rowCount } = await tx.query(
      `UPDATE criterika.sesiones SET revocada_en=$3,
      identidad_confirmada_en=NULL WHERE id=$1 AND cuenta_id=$2 AND revocada_en IS NULL AND creada_en<=$3`,
      [sessionId, accountId, time(clock())],
    );
    return rowCount === 1;
  }

  async revokeAll(
    tx: PoolClient,
    accountId: string,
    clock: () => Date = () => new Date(),
  ) {
    if (!(await this.lockOwned(tx, accountId))) return 0;
    const { rowCount } = await tx.query(
      `UPDATE criterika.sesiones SET revocada_en=$2,
      identidad_confirmada_en=NULL WHERE cuenta_id=$1 AND revocada_en IS NULL AND creada_en<=$2`,
      [accountId, time(clock())],
    );
    return rowCount ?? 0;
  }
}
