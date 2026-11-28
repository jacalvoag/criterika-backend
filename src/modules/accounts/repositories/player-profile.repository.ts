import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';

/** Internal snapshot. Accounts must project moderation/privacy state before returning UserProfile. */
export interface PlayerProfileSnapshot {
  id: string;
  nombre: string;
  apellidos: string;
  fechaNacimiento: string;
  correo: string;
  avatarMediaId: string | null;
  situacionOperativa: 'HABILITADA' | 'CANCELACION_EN_PROCESO';
  creadaEn: Date;
  version: bigint;
}
export interface PlayerProfileChanges {
  nombre?: string;
  apellidos?: string;
}
export type ProfileUpdateResult =
  | { kind: 'updated'; profile: PlayerProfileSnapshot }
  | { kind: 'not_found' }
  | { kind: 'version_conflict' };
export class ProfileOwnershipError extends Error {
  constructor() {
    super('La edición requiere el contexto del jugador titular.');
    this.name = 'ProfileOwnershipError';
  }
}
type ProfileRow = Omit<PlayerProfileSnapshot, 'version'> & { version: string };
const FIELDS = `id,nombre,apellidos,fecha_nacimiento::text AS "fechaNacimiento",
  correo_presentacion AS correo,avatar_archivo_id AS "avatarMediaId",
  situacion_operativa AS "situacionOperativa",creada_en AS "creadaEn",version::text`;
const MAX_VERSION = 9223372036854775807n;

function validateChanges(changes: PlayerProfileChanges): void {
  if (
    !changes ||
    typeof changes !== 'object' ||
    Array.isArray(changes) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(changes))
  )
    throw new PersistenceInvariantError('Edición de perfil inválida.');
  const entries = Object.entries(changes);
  if (
    !entries.length ||
    entries.some(
      ([key, value]) =>
        !['nombre', 'apellidos'].includes(key) ||
        typeof value !== 'string' ||
        Array.from(value).length < 1 ||
        Array.from(value).length > 120 ||
        value.includes('\0'),
    )
  )
    throw new PersistenceInvariantError(
      'Solo se admiten nombre y apellidos de 1 a 120 caracteres.',
    );
}
function project(row: ProfileRow): PlayerProfileSnapshot {
  return { ...row, version: BigInt(row.version) };
}

/** SQL only; identity comes from the authenticated session, never a body/path account selector. */
@Injectable()
export class PostgresPlayerProfileRepository {
  /** Run inside TransactionRunner.read; this does not authenticate or authorize the caller. */
  async getOwned(
    tx: PoolClient,
    authenticatedPlayerId: string,
  ): Promise<PlayerProfileSnapshot | null> {
    const { rows } = await tx.query<ProfileRow>(
      `SELECT ${FIELDS} FROM criterika.cuentas WHERE id=$1 AND rol='JUGADOR'`,
      [authenticatedPlayerId],
    );
    return rows[0] ? project(rows[0]) : null;
  }

  /** Call through TransactionRunner.run with trusted JUGADOR context; commits belong to the caller. */
  async updateOwned(
    tx: PoolClient,
    authenticatedPlayerId: string,
    expectedVersion: bigint,
    changes: PlayerProfileChanges,
  ): Promise<ProfileUpdateResult> {
    validateChanges(changes);
    const { nombre, apellidos } = changes;
    if (
      typeof expectedVersion !== 'bigint' ||
      expectedVersion < 1n ||
      expectedVersion > MAX_VERSION
    )
      throw new PersistenceInvariantError('Versión de perfil inválida.');
    const context = await tx.query<{ owned: boolean }>(
      `SELECT current_setting('criterika.actor_tipo',true)='JUGADOR'
        AND NULLIF(current_setting('criterika.actor_id',true),'')::uuid=$1::uuid AS owned`,
      [authenticatedPlayerId],
    );
    if (context.rows[0]?.owned !== true) throw new ProfileOwnershipError();
    const locked = await tx.query<{ version: string }>(
      `SELECT version::text FROM criterika.cuentas WHERE id=$1 AND rol='JUGADOR' FOR UPDATE`,
      [authenticatedPlayerId],
    );
    if (!locked.rows[0]) return { kind: 'not_found' };
    if (BigInt(locked.rows[0].version) !== expectedVersion)
      return { kind: 'version_conflict' };
    if (expectedVersion === MAX_VERSION)
      throw new PersistenceInvariantError('Se agotó la versión del perfil.');
    const { rows } = await tx.query<ProfileRow>(
      `UPDATE criterika.cuentas SET nombre=COALESCE($2,nombre),apellidos=COALESCE($3,apellidos),
        version=version+1 WHERE id=$1 AND rol='JUGADOR' AND version=$4::bigint RETURNING ${FIELDS}`,
      [
        authenticatedPlayerId,
        nombre ?? null,
        apellidos ?? null,
        expectedVersion.toString(),
      ],
    );
    if (!rows[0])
      throw new PersistenceInvariantError('Se perdió el bloqueo del perfil.');
    return { kind: 'updated', profile: project(rows[0]) };
  }
}
