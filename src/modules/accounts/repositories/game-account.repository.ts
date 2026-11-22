import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

export interface LockedPlayerAccount {
  id: string;
  situacionOperativa: 'HABILITADA' | 'CANCELACION_EN_PROCESO';
  fechaNacimiento: string;
}

/** Persistence for Uzzi's public accounts capability; this does not authorize play. */
@Injectable()
export class GameAccountRepository {
  async lockPlayerAccount(
    client: PoolClient,
    cuentaId: string,
  ): Promise<LockedPlayerAccount | null> {
    const result = await client.query<LockedPlayerAccount>(
      `SELECT id,situacion_operativa AS "situacionOperativa",fecha_nacimiento::text AS "fechaNacimiento"
       FROM criterika.cuentas WHERE id=$1 AND rol='JUGADOR' FOR UPDATE`,
      [cuentaId],
    );
    return result.rows[0] ?? null;
  }
}
