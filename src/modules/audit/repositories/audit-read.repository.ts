import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { requireAdministrativeRead } from '../../../database/administrative-read.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';

export interface AuditPosition {
  ocurridoEn: string;
  id: string;
}
export interface AuditFilters {
  administradorId?: string;
  accion?: string;
  recursoTipo?: string;
  desde?: Date;
  hasta?: Date;
}
export interface AuditEventRecord {
  id: string;
  administradorId: string | null;
  actorTipo: 'ADMINISTRADOR' | 'SISTEMA' | 'MANTENIMIENTO';
  accion: string;
  recursoTipo: string;
  recursoId: string | null;
  ocurridoEn: string;
  motivo: string | null;
  cambios: {
    campo: string;
    anterior: string | number | boolean | null;
    posterior: string | number | boolean | null;
  }[];
  requestId: string;
  resultado: 'CONFIRMADO' | 'RECHAZADO';
  expiraEn: string;
}
interface Row extends Omit<AuditEventRecord, 'ocurridoEn' | 'expiraEn'> {
  ocurridoEn: Date;
  expiraEn: Date;
  cursorFecha: string;
}
const COLUMNS = `id,administrador_id AS "administradorId",actor_tipo AS "actorTipo",
  accion,recurso_tipo AS "recursoTipo",recurso_id AS "recursoId",ocurrido_en AS "ocurridoEn",
  motivo,cambios_permitidos AS cambios,request_id AS "requestId",resultado,expira_en AS "expiraEn",
  to_char(ocurrido_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorFecha"`;
function project(row: Row): AuditEventRecord {
  const { cursorFecha: _internal, ocurridoEn, expiraEn, ...rest } = row;
  return {
    ...rest,
    ocurridoEn: ocurridoEn.toISOString(),
    expiraEn: expiraEn.toISOString(),
  };
}

@Injectable()
export class PostgresAuditReadRepository {
  /** Position is internal. HTTP must validate filters and bind an opaque cursor to them. */
  async list(
    tx: PoolClient,
    filters: AuditFilters,
    limit = 20,
    after?: AuditPosition,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new PersistenceInvariantError('Límite de consulta inválido.');
    if (
      (filters.desde && !Number.isFinite(filters.desde.getTime())) ||
      (filters.hasta && !Number.isFinite(filters.hasta.getTime())) ||
      (filters.desde && filters.hasta && filters.desde > filters.hasta)
    )
      throw new PersistenceInvariantError('Intervalo de consulta inválido.');
    await requireAdministrativeRead(tx);
    const { rows } = await tx.query<Row>(
      `SELECT ${COLUMNS} FROM criterika.eventos_auditoria
      WHERE expira_en>transaction_timestamp()
        AND ($1::uuid IS NULL OR administrador_id=$1::uuid)
        AND ($2::text IS NULL OR accion=$2)
        AND ($3::text IS NULL OR recurso_tipo=$3)
        AND ($4::timestamptz IS NULL OR ocurrido_en >= $4::timestamptz)
        AND ($5::timestamptz IS NULL OR ocurrido_en <= $5::timestamptz)
        AND ($6::timestamptz IS NULL OR (ocurrido_en,id)<($6::timestamptz,$7::uuid))
      ORDER BY ocurrido_en DESC,id DESC LIMIT $8`,
      [
        filters.administradorId ?? null,
        filters.accion ?? null,
        filters.recursoTipo ?? null,
        filters.desde ?? null,
        filters.hasta ?? null,
        after?.ocurridoEn ?? null,
        after?.id ?? null,
        limit + 1,
      ],
    );
    const page = rows.slice(0, limit),
      last = page.at(-1);
    return {
      items: page.map(project),
      nextPosition:
        rows.length > limit && last
          ? { ocurridoEn: last.cursorFecha, id: last.id }
          : null,
    };
  }
  async get(tx: PoolClient, id: string): Promise<AuditEventRecord | null> {
    await requireAdministrativeRead(tx);
    const { rows } = await tx.query<Row>(
      `SELECT ${COLUMNS} FROM criterika.eventos_auditoria
      WHERE id=$1::uuid AND expira_en>transaction_timestamp()`,
      [id],
    );
    return rows[0] ? project(rows[0]) : null;
  }
}
