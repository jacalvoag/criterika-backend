import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { requireAdministrativeRead } from '../../../database/administrative-read.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';

export const MAINTENANCE_TASKS = [
  'INTENTOS',
  'DEPURACION',
  'INCONSISTENCIAS',
  'INACTIVIDAD',
  'ELIMINACIONES',
] as const;
const SAFE_ERROR_CODES = new Set([
  'TASK_FAILED',
  'TASK_NOT_CONFIGURED',
  'DATABASE_UNAVAILABLE',
  'SMTP_UNAVAILABLE',
  'RETENTION_FAILED',
  'ATTEMPT_MONITOR_FAILED',
  'INCONSISTENCY_CHECK_FAILED',
  'INACTIVITY_CHECK_FAILED',
  'ELIMINATION_FAILED',
  'EXTERNAL_DEPENDENCY_UNAVAILABLE',
]);
type TaskName = (typeof MAINTENANCE_TASKS)[number];
interface TaskRow {
  nombre: TaskName;
  ultimaEjecucionEn: Date | null;
  ultimoExitoEn: Date | null;
  estado: 'OK' | 'PENDIENTE' | 'ERROR';
  pendientes: number;
  codigoError: string | null;
}
@Injectable()
export class PostgresMaintenanceReadRepository {
  async get(tx: PoolClient) {
    await requireAdministrativeRead(tx);
    const { rows } = await tx.query<TaskRow>(
      `SELECT nombre,
      ultima_ejecucion_en AS "ultimaEjecucionEn",ultimo_exito_en AS "ultimoExitoEn",
      estado,pendientes,codigo_error AS "codigoError" FROM criterika.estados_tareas
      WHERE nombre=ANY($1::text[]) ORDER BY array_position($1::text[],nombre)`,
      [MAINTENANCE_TASKS],
    );
    if (rows.length !== MAINTENANCE_TASKS.length)
      throw new PersistenceInvariantError(
        'Falta el catálogo de tareas de mantenimiento.',
      );
    return {
      tareas: rows.map((row) => ({
        ...row,
        ultimaEjecucionEn: row.ultimaEjecucionEn?.toISOString() ?? null,
        ultimoExitoEn: row.ultimoExitoEn?.toISOString() ?? null,
        codigoError:
          row.codigoError === null
            ? null
            : SAFE_ERROR_CODES.has(row.codigoError)
              ? row.codigoError
              : 'TASK_FAILED',
      })),
    };
  }
}
