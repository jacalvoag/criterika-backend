import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

export type AccountRole = 'JUGADOR' | 'ADMINISTRADOR';
export interface LoginAccount {
  id: string;
  rol: AccountRole;
  contrasenaHash: string;
  nombre: string;
  correo: string;
  fechaNacimiento: string | null;
  correoConfirmadoEn: Date | null;
  situacionOperativa: 'HABILITADA' | 'CANCELACION_EN_PROCESO';
}

/** Internal credential projection, never a DTO or a log payload. */
@Injectable()
export class PostgresLoginAccountRepository {
  async findByNormalizedEmail(
    tx: PoolClient,
    email: string,
    role: AccountRole,
  ): Promise<LoginAccount | null> {
    const { rows } = await tx.query<LoginAccount>(
      `SELECT id,rol,contrasena_hash AS "contrasenaHash",
      nombre,correo_presentacion AS correo,fecha_nacimiento::text AS "fechaNacimiento",
      correo_confirmado_en AS "correoConfirmadoEn",situacion_operativa AS "situacionOperativa"
      FROM criterika.cuentas WHERE correo_normalizado=$1 AND rol=$2`,
      [email, role],
    );
    return rows[0] ?? null;
  }
}
