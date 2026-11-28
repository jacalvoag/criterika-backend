import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { boundedLimit } from '../../../database/persistence-checks.js';
import {
  PersistenceInvariantError,
  safeInteger,
} from '../../../database/persistence-values.js';
import { GameEconomyRepository } from './game-economy.repository.js';
@Injectable()
export class PostgresEconomyReadRepository {
  /** Persisted facts only: Rafael computes current lives/streak and next eligible level. Use one read snapshot. */
  async getOwned(tx: PoolClient, playerId: string) {
    const state = await new GameEconomyRepository().findPlayerState(
      tx,
      playerId,
    );
    if (!state) return null;
    const { rows } = await tx.query<{ reservada: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM criterika.intentos_nivel WHERE jugador_id=$1 AND estado='EN_CURSO') AS reservada",
      [playerId],
    );
    const approvals = await tx.query<{
      nivelId: string;
      unidadId: string;
      tipo: string;
      aprobadaEn: Date;
    }>(
      `SELECT a.nivel_id AS "nivelId",n.unidad_id AS "unidadId",n.tipo,a.aprobada_en AS "aprobadaEn"
      FROM criterika.aprobaciones_nivel a JOIN criterika.niveles n ON n.id=a.nivel_id WHERE a.jugador_id=$1 ORDER BY a.nivel_id`,
      [playerId],
    );
    const counts = await tx.query<{
      cartas: string;
      evoluciones: string;
      terminos: string;
    }>(
      `SELECT
      (SELECT count(*)::text FROM criterika.cartas_obtenidas WHERE jugador_id=$1) AS cartas,
      (SELECT count(*)::text FROM criterika.evoluciones_obtenidas WHERE jugador_id=$1) AS evoluciones,
      (SELECT count(*)::text FROM criterika.terminos_desbloqueados WHERE jugador_id=$1) AS terminos`,
      [playerId],
    );
    return {
      estadoJugador: state,
      reservadas: rows[0].reservada ? 1 : 0,
      aprobaciones: approvals.rows,
      cartasObtenidas: safeInteger(counts.rows[0].cartas),
      evolucionesObtenidas: safeInteger(counts.rows[0].evoluciones),
      terminosDesbloqueados: safeInteger(counts.rows[0].terminos),
    };
  }
  async movementsOwned(
    tx: PoolClient,
    playerId: string,
    limit = 20,
    after?: { movementId: string },
  ) {
    boundedLimit(limit);
    let ordinal: string | null = null;
    if (after) {
      const anchor = await tx.query<{ ordinal: string }>(
        'SELECT orden_contable::text AS ordinal FROM criterika.movimientos_gemas WHERE id=$1 AND jugador_id=$2',
        [after.movementId, playerId],
      );
      if (!anchor.rows[0])
        throw new PersistenceInvariantError(
          'Posición de movimientos inválida.',
        );
      ordinal = anchor.rows[0].ordinal;
    }
    const { rows } = await tx.query<{
      id: string;
      tipo: string;
      cantidad: string;
      saldoPosterior: string;
      creadoEn: Date;
      referenciaId: string;
    }>(
      `SELECT id,tipo,cantidad::text,saldo_posterior::text AS "saldoPosterior",creado_en AS "creadoEn",
      COALESCE(aprobacion_id,compra_vidas_id,evolucion_obtenida_id,correccion_id) AS "referenciaId"
      FROM criterika.movimientos_gemas WHERE jugador_id=$1 AND ($2::bigint IS NULL OR orden_contable<$2::bigint)
      ORDER BY orden_contable DESC LIMIT $3`,
      [playerId, ordinal, limit + 1],
    );
    const items = rows.slice(0, limit).map((row) => ({
      ...row,
      cantidad: safeInteger(row.cantidad),
      saldoPosterior: safeInteger(row.saldoPosterior),
    }));
    return {
      items,
      nextPosition:
        rows.length > limit ? { movementId: items[items.length - 1].id } : null,
    };
  }
}
