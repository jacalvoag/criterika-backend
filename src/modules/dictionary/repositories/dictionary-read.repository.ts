import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';

export interface UnlockedTerm {
  id: string;
  nombre: string;
  categoria: string;
  definicion: string;
  ejemplo: string;
  fuenteUrl: string | null;
}
export interface DictionaryFilters {
  q?: string;
  categoria?: string;
}
/** Internal anchor; HTTP must protect and bind the opaque cursor to player and filters. */
export interface DictionaryPosition {
  termId: string;
}
export class DictionaryPositionError extends Error {
  constructor() {
    super('Posición de diccionario inválida.');
  }
}
type TermRow = { [K in keyof UnlockedTerm]: UnlockedTerm[K] | null };
const SELECT = `t.id,t.nombre_publicado AS nombre,t.categoria_publicada AS categoria,
  t.definicion_publicada AS definicion,t.ejemplo_publicado AS ejemplo,t.fuente_publicada AS "fuenteUrl"`;
const SOURCE = `FROM criterika.terminos_desbloqueados d
  JOIN criterika.terminos t ON t.id=d.termino_id
  JOIN criterika.cuentas c ON c.id=d.jugador_id AND c.rol='JUGADOR'`;
const FILTERS = `d.jugador_id=$1
  AND ($2::text IS NULL OR strpos(lower(t.nombre_publicado),lower($2::text))>0)
  AND ($3::text IS NULL OR t.categoria_publicada=$3)`;
function filter(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (
    typeof value !== 'string' ||
    Array.from(value).length < 1 ||
    Array.from(value).length > 120 ||
    value.includes('\0')
  )
    throw new PersistenceInvariantError('Filtro de diccionario inválido.');
  return value;
}
function project(row: TermRow): UnlockedTerm {
  const { id, nombre, categoria, definicion, ejemplo, fuenteUrl } = row;
  if (!id || !nombre || !categoria || !definicion || !ejemplo)
    throw new PersistenceInvariantError(
      'Término adquirido sin publicación completa.',
    );
  return { id, nombre, categoria, definicion, ejemplo, fuenteUrl };
}

/** Reads the caller's unlocked, current published content; deliberately keeps disabled acquisitions. */
@Injectable()
export class PostgresDictionaryReadRepository {
  /** Use TransactionRunner.read so anchor lookup and page share one consistent snapshot. */
  async list(
    tx: PoolClient,
    playerId: string,
    filters: DictionaryFilters = {},
    limit = 20,
    after?: DictionaryPosition,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new PersistenceInvariantError('Límite de diccionario inválido.');
    const values = [playerId, filter(filters.q), filter(filters.categoria)];
    let anchor: { id: string; nombreOrden: string | null } | undefined;
    if (after) {
      const { rows } = await tx.query<{
        id: string;
        nombreOrden: string | null;
      }>(
        `SELECT t.id,lower(t.nombre_publicado) AS "nombreOrden" ${SOURCE}
         WHERE ${FILTERS} AND t.id=$4::uuid`,
        [...values, after.termId],
      );
      anchor = rows[0];
      if (!anchor) throw new DictionaryPositionError();
      if (!anchor.nombreOrden)
        throw new PersistenceInvariantError(
          'Término adquirido sin publicación completa.',
        );
    }
    const { rows } = await tx.query<TermRow>(
      `SELECT ${SELECT} ${SOURCE}
      WHERE ${FILTERS}
        AND ($4::text IS NULL OR (lower(t.nombre_publicado) COLLATE "C",t.id)>($4::text COLLATE "C",$5::uuid))
      ORDER BY lower(t.nombre_publicado) COLLATE "C",t.id LIMIT $6`,
      [...values, anchor?.nombreOrden ?? null, anchor?.id ?? null, limit + 1],
    );
    const items = rows.slice(0, limit).map(project);
    return {
      items,
      nextPosition:
        rows.length > limit && items.length
          ? { termId: items[items.length - 1].id }
          : null,
    };
  }
  async get(
    tx: PoolClient,
    playerId: string,
    termId: string,
  ): Promise<UnlockedTerm | null> {
    const { rows } = await tx.query<TermRow>(
      `SELECT ${SELECT} ${SOURCE}
      WHERE d.jugador_id=$1 AND t.id=$2`,
      [playerId, termId],
    );
    return rows[0] ? project(rows[0]) : null;
  }
}
