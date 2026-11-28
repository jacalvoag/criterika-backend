import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from './persistence-values.js';
export function boundedLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new PersistenceInvariantError('Límite de página inválido.');
  return limit;
}
export function serverInstant(clock: () => Date = () => new Date()): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new PersistenceInvariantError('Instante de servidor inválido.');
  return new Date(value.getTime());
}
export function protectedVerifier(value: Uint8Array): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32)
    throw new PersistenceInvariantError('Verificador protegido inválido.');
  return Buffer.from(value);
}
/** Trusted transaction context is defense in depth; session/JWT authorization remains in security. */
export async function requireHumanContext(
  tx: PoolClient,
  id: string,
  playerOnly = false,
): Promise<void> {
  const { rows } = await tx.query<{ allowed: boolean }>(
    `SELECT current_setting('criterika.actor_tipo',true) IN ('JUGADOR','ADMINISTRADOR')
 AND NULLIF(current_setting('criterika.actor_id',true),'')::uuid=$1::uuid
 AND (NOT $2::boolean OR current_setting('criterika.actor_tipo',true)='JUGADOR') AS allowed`,
    [id, playerOnly],
  );
  if (rows[0]?.allowed !== true)
    throw new PersistenceInvariantError('Contexto del titular requerido.');
}
export async function requireSystemContext(tx: PoolClient): Promise<void> {
  const { rows } = await tx.query<{ allowed: boolean }>(
    "SELECT current_setting('criterika.actor_tipo',true)='SISTEMA' AS allowed",
  );
  if (rows[0]?.allowed !== true)
    throw new PersistenceInvariantError('Contexto técnico requerido.');
}
