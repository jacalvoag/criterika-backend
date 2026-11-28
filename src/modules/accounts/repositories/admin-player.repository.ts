import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { requireAdministrativeRead } from '../../../database/administrative-read.js';
import {
  boundedLimit,
  serverInstant,
} from '../../../database/persistence-checks.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import { GameEconomyRepository } from '../../economy/repositories/game-economy.repository.js';
export type AccountStatus =
  | 'ACTIVA'
  | 'SUSPENDIDA'
  | 'BLOQUEADA'
  | 'RESTRINGIDA'
  | 'CANCELACION_EN_PROCESO';
export interface PlayerStateFacts {
  situacionOperativa: string;
  mayorDeEdad: boolean;
  sancionTemporal: boolean;
  bloqueo: boolean;
  privacidad: boolean;
}
interface PlayerRow extends PlayerStateFacts {
  id: string;
  nombreVisible: string;
  creadaEn: Date;
}
const SELECT = `SELECT c.id,c.nombre AS "nombreVisible",c.creada_en AS "creadaEn",c.situacion_operativa AS "situacionOperativa",
 (c.fecha_nacimiento+interval '18 years')::date<=($2::timestamptz AT TIME ZONE 'UTC')::date AS "mayorDeEdad",
 EXISTS(SELECT 1 FROM criterika.sanciones s WHERE s.jugador_id=c.id AND s.tipo='TEMPORAL' AND s.inicio<=$2 AND s.vence_en>$2 AND (s.levantada_en IS NULL OR s.levantada_en>$2)) AS "sancionTemporal",
 EXISTS(SELECT 1 FROM criterika.sanciones s WHERE s.jugador_id=c.id AND s.tipo='BLOQUEO' AND s.inicio<=$2 AND (s.levantada_en IS NULL OR s.levantada_en>$2)) AS bloqueo,
 EXISTS(SELECT 1 FROM criterika.restricciones_tratamiento r WHERE r.jugador_id=c.id AND r.aplicada_en<=$2 AND (r.levantada_en IS NULL OR r.levantada_en>$2)) AS privacidad
 FROM criterika.cuentas c WHERE c.rol='JUGADOR'`;
const STATES: AccountStatus[] = [
  'ACTIVA',
  'SUSPENDIDA',
  'BLOQUEADA',
  'RESTRINGIDA',
  'CANCELACION_EN_PROCESO',
];
@Injectable()
export class PostgresAdminPlayerRepository {
  /** Accounts owns state precedence. Supply its real pure classifier; no default or test classifier is wired. */
  constructor(
    private readonly classify: (facts: PlayerStateFacts) => AccountStatus,
  ) {}
  private project(row: PlayerRow) {
    const estado = this.classify(row);
    if (!STATES.includes(estado))
      throw new PersistenceInvariantError('Estado de cuenta inválido.');
    return {
      id: row.id,
      nombreVisible: row.nombreVisible,
      creadaEn: row.creadaEn,
      estado,
    };
  }
  async list(
    tx: PoolClient,
    at: Date,
    filters: { q?: string; estado?: AccountStatus } = {},
    limit = 20,
    after?: { playerId: string },
  ) {
    await requireAdministrativeRead(tx);
    boundedLimit(limit);
    const now = serverInstant(() => at);
    if (
      (filters.q !== undefined &&
        (typeof filters.q !== 'string' ||
          !filters.q ||
          Array.from(filters.q).length > 120 ||
          filters.q.includes('\0'))) ||
      (filters.estado !== undefined && !STATES.includes(filters.estado))
    )
      throw new PersistenceInvariantError('Filtro de jugadores inválido.');
    if (after) {
      const anchor = await tx.query(
        "SELECT id FROM criterika.cuentas WHERE id=$1 AND rol='JUGADOR'",
        [after.playerId],
      );
      if (!anchor.rowCount)
        throw new PersistenceInvariantError('Posición de jugadores inválida.');
    }
    const items: ReturnType<PostgresAdminPlayerRepository['project']>[] = [];
    let scan = after?.playerId ?? null;
    // Filter the composed state before counting the public page; no wrong LIMIT-before-filter pagination.
    while (items.length <= limit) {
      const { rows } = await tx.query<PlayerRow>(
        `${SELECT} AND ($1::uuid IS NULL OR c.id>$1::uuid)
        AND ($3::text IS NULL OR strpos(lower(c.nombre),lower($3))>0) ORDER BY c.id LIMIT 100`,
        [scan, now, filters.q ?? null],
      );
      for (const row of rows) {
        const projected = this.project(row);
        if (!filters.estado || projected.estado === filters.estado)
          items.push(projected);
        if (items.length > limit) break;
      }
      if (rows.length < 100 || items.length > limit) break;
      scan = rows[rows.length - 1].id;
    }
    return {
      items: items.slice(0, limit),
      nextPosition:
        items.length > limit ? { playerId: items[limit - 1].id } : null,
    };
  }
  async get(tx: PoolClient, id: string, at: Date) {
    await requireAdministrativeRead(tx);
    const now = serverInstant(() => at);
    const { rows } = await tx.query<PlayerRow>(`${SELECT} AND c.id=$1`, [
      id,
      now,
    ]);
    if (!rows[0]) return null;
    const estadoJugador = await new GameEconomyRepository().findPlayerState(
      tx,
      id,
    );
    const progress = await tx.query<{ nivelId: string; unidadId: string }>(
      `SELECT a.nivel_id AS "nivelId",n.unidad_id AS "unidadId"
      FROM criterika.aprobaciones_nivel a JOIN criterika.niveles n ON n.id=a.nivel_id WHERE a.jugador_id=$1 ORDER BY a.nivel_id`,
      [id],
    );
    return {
      jugador: this.project(rows[0]),
      estadoJugador,
      aprobaciones: progress.rows,
    };
  }
}
