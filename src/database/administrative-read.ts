import type { PoolClient } from 'pg';

export class AdministrativeReadForbiddenError extends Error {
  constructor() {
    super('La consulta requiere contexto administrativo válido.');
  }
}

/** Defense in depth, not authentication: security must verify session and permission first. */
export async function requireAdministrativeRead(tx: PoolClient): Promise<void> {
  const { rowCount } = await tx.query(`SELECT id FROM criterika.cuentas
    WHERE nullif(current_setting('criterika.actor_tipo',true),'')='ADMINISTRADOR'
      AND id=nullif(current_setting('criterika.actor_id',true),'')::uuid
      AND rol='ADMINISTRADOR' AND situacion_operativa='HABILITADA'
    FOR SHARE`);
  if (rowCount !== 1) throw new AdministrativeReadForbiddenError();
}
