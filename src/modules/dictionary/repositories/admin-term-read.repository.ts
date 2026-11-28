import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { boundedLimit } from '../../../database/persistence-checks.js';
import { requireAdministrativeRead } from '../../../database/administrative-read.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import type { TermDraft } from './admin-term.input.js';
interface Row extends TermDraft {
  id: string;
  estado: 'BORRADOR' | 'PUBLICADO' | 'DESHABILITADO';
  version: string;
}
export const TERM_FIELDS = `id,nombre_borrador AS nombre,categoria_borrador AS categoria,definicion_borrador AS definicion,ejemplo_borrador AS ejemplo,fuente_borrador AS "fuenteUrl",estado,version::text`;
export const termSnapshot = (row: Row) => ({
  ...row,
  version: BigInt(row.version),
});
export async function loadAdminTerm(tx: PoolClient, id: string) {
  const { rows } = await tx.query<Row>(
    `SELECT ${TERM_FIELDS} FROM criterika.terminos WHERE id=$1`,
    [id],
  );
  return rows[0] ? termSnapshot(rows[0]) : null;
}
@Injectable()
export class PostgresAdminTermReadRepository {
  async get(tx: PoolClient, id: string) {
    await requireAdministrativeRead(tx);
    return loadAdminTerm(tx, id);
  }
  async list(
    tx: PoolClient,
    filters: { q?: string; categoria?: string; estado?: Row['estado'] } = {},
    limit = 20,
    after?: { termId: string },
  ) {
    await requireAdministrativeRead(tx);
    boundedLimit(limit);
    for (const value of [filters.q, filters.categoria])
      if (
        value !== undefined &&
        (typeof value !== 'string' ||
          !value ||
          value.includes('\0') ||
          Array.from(value).length > 120)
      )
        throw new PersistenceInvariantError('Filtro de términos inválido.');
    if (
      filters.estado !== undefined &&
      !['BORRADOR', 'PUBLICADO', 'DESHABILITADO'].includes(filters.estado)
    )
      throw new PersistenceInvariantError('Estado de término inválido.');
    const query = `FROM criterika.terminos WHERE ($1::text IS NULL OR strpos(lower(nombre_borrador),lower($1))>0) AND ($2::text IS NULL OR categoria_borrador=$2) AND ($3::text IS NULL OR estado=$3)`;
    const values = [
      filters.q ?? null,
      filters.categoria ?? null,
      filters.estado ?? null,
    ];
    if (after) {
      const anchor = await tx.query(`SELECT id ${query} AND id=$4`, [
        ...values,
        after.termId,
      ]);
      if (!anchor.rowCount)
        throw new PersistenceInvariantError('Posición de términos inválida.');
    }
    const { rows } = await tx.query<Row>(
      `SELECT ${TERM_FIELDS} ${query} AND ($4::uuid IS NULL OR id>$4::uuid) ORDER BY id LIMIT $5`,
      [...values, after?.termId ?? null, limit + 1],
    );
    const items = rows.slice(0, limit).map(termSnapshot);
    return {
      items,
      nextPosition:
        rows.length > limit ? { termId: items[items.length - 1].id } : null,
    };
  }
}
