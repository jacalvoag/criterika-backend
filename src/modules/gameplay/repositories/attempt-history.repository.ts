import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { boundedLimit } from '../../../database/persistence-checks.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import { GameplayRepository } from './gameplay.repository.js';
interface AttemptSummary {
  id: string;
  nivelId: string;
  estado: string;
  iniciadoEn: Date;
  finalizadoEn: Date | null;
  motivoFinalizacion: string | null;
}
const FIELDS = `i.id,i.nivel_id AS "nivelId",i.estado,i.iniciado_en AS "iniciadoEn",i.finalizado_en AS "finalizadoEn",i.motivo_finalizacion AS "motivoFinalizacion"`;
@Injectable()
export class PostgresAttemptHistoryRepository {
  /** Only metadata; never boards, expected answers or private estado_juego. */
  async listOwned(
    tx: PoolClient,
    playerId: string,
    limit = 20,
    after?: { attemptId: string },
  ) {
    boundedLimit(limit);
    let anchor: { stamp: string; id: string } | undefined;
    if (after) {
      const { rows } = await tx.query<{ stamp: string; id: string }>(
        'SELECT iniciado_en::text AS stamp,id FROM criterika.intentos_nivel WHERE id=$1 AND jugador_id=$2',
        [after.attemptId, playerId],
      );
      anchor = rows[0];
      if (!anchor)
        throw new PersistenceInvariantError('Posición de intentos inválida.');
    }
    const { rows } = await tx.query<AttemptSummary>(
      `SELECT ${FIELDS} FROM criterika.intentos_nivel i
      WHERE i.jugador_id=$1 AND ($2::timestamptz IS NULL OR (i.iniciado_en,i.id)<($2::timestamptz,$3::uuid))
      ORDER BY i.iniciado_en DESC,i.id DESC LIMIT $4`,
      [playerId, anchor?.stamp ?? null, anchor?.id ?? null, limit + 1],
    );
    const items = rows.slice(0, limit);
    return {
      items,
      nextPosition:
        rows.length > limit ? { attemptId: items[items.length - 1].id } : null,
    };
  }
  /** Reuses the existing authoritative attempt reader. Output remains internal for Rafael's projection. */
  async getOwned(tx: PoolClient, playerId: string, attemptId: string) {
    return new GameplayRepository().findOwnAttempt(tx, playerId, attemptId);
  }
  async executionHistory(tx: PoolClient, playerId: string, attemptId: string) {
    const owned = await this.getOwned(tx, playerId, attemptId);
    if (!owned) return null;
    const { rows } = await tx.query<{
      id: string;
      actividadIntentoId: string;
      numero: number;
      estado: string;
      errores: number;
      iniciadaEn: Date;
      finalizadaEn: Date | null;
    }>(
      `SELECT e.id,e.actividad_intento_id AS "actividadIntentoId",e.numero,e.estado,e.errores,e.iniciada_en AS "iniciadaEn",e.finalizada_en AS "finalizadaEn"
      FROM criterika.ejecuciones_actividad e JOIN criterika.intentos_nivel i ON i.id=e.intento_id
      WHERE i.id=$1 AND i.jugador_id=$2 ORDER BY e.iniciada_en,e.id`,
      [attemptId, playerId],
    );
    return rows;
  }
}
