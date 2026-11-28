import { Injectable } from '@nestjs/common';
import { serverInstant } from '../../../database/persistence-checks.js';
import type { PoolClient } from 'pg';
import {
  PersistenceInvariantError,
  jsonObject,
  type JsonObject,
} from '../../../database/persistence-values.js';
import {
  validateEvolutionPurchase,
  type EvolutionStage,
} from '../purchases.js';
import {
  lockPurchase,
  receiptEconomy,
  type ReceiptEconomyProjector,
} from './purchase-state.js';
import { readCollectionCard } from '../../collection/repositories/collection-card.reader.js';
interface ReceiptRow {
  id: string;
  jugadorId: string;
  cartaId: string;
  etapa: EvolutionStage;
  gemasGastadas: number;
  creadaEn: Date;
  payload: JsonObject;
}
@Injectable()
export class PostgresEvolutionPurchaseRepository {
  constructor(private readonly projectEconomy: ReceiptEconomyProjector) {}
  async getOwned(tx: PoolClient, playerId: string, id: string) {
    const { rows } = await tx.query<ReceiptRow>(
      `SELECT id,jugador_id AS "jugadorId",carta_id AS "cartaId",numero_etapa AS etapa,gemas_gastadas AS "gemasGastadas",obtenida_en AS "creadaEn",economia_al_confirmar AS payload
   FROM criterika.evoluciones_obtenidas WHERE jugador_id=$1 AND id=$2`,
      [playerId, id],
    );
    const row = rows[0];
    if (!row) return null;
    if (
      row.payload.formato !== 1 ||
      !row.payload.economia ||
      !row.payload.carta
    )
      throw new PersistenceInvariantError(
        'Recibo de evolución sin snapshot confirmado.',
      );
    return {
      id: row.id,
      cartaId: row.cartaId,
      etapa: row.etapa,
      gemasGastadas: row.gemasGastadas,
      creadaEn: row.creadaEn,
      economia: row.payload.economia,
      carta: row.payload.carta,
    };
  }
  async purchaseOwned(
    tx: PoolClient,
    playerId: string,
    id: string,
    cardId: string,
    stage: EvolutionStage,
    clock: () => Date = () => new Date(),
  ) {
    if (![1, 2, 3].includes(stage))
      throw new PersistenceInvariantError('Etapa inválida.');
    const facts = await lockPurchase(tx, playerId, clock);
    if (!facts) return { kind: 'unavailable' } as const;
    const existing = await tx.query<{
      player: string;
      card: string;
      stage: number;
    }>(
      'SELECT jugador_id AS player,carta_id AS card,numero_etapa AS stage FROM criterika.evoluciones_obtenidas WHERE id=$1',
      [id],
    );
    if (existing.rows[0])
      return existing.rows[0].player === playerId &&
        existing.rows[0].card === cardId &&
        existing.rows[0].stage === stage
        ? ({
            kind: 'existing',
            receipt: (await this.getOwned(tx, playerId, id))!,
          } as const)
        : ({ kind: 'receipt_conflict' } as const);
    const card = await tx.query<{ estado: string }>(
      'SELECT estado FROM criterika.cartas WHERE id=$1 FOR SHARE',
      [cardId],
    );
    const stages = await tx.query<{
      numero: EvolutionStage;
      habilitada: boolean;
      imagen: string | null;
    }>(
      `SELECT s.numero,s.habilitada,s.imagen_publicada_id AS imagen
   FROM criterika.etapas_carta s WHERE s.carta_id=$1 ORDER BY s.numero FOR SHARE OF s`,
      [cardId],
    );
    const acquired = await tx.query<{ id: string }>(
      'SELECT id FROM criterika.cartas_obtenidas WHERE jugador_id=$1 AND carta_id=$2 FOR UPDATE',
      [playerId, cardId],
    );
    const previous = await tx.query<{ stage: number }>(
      'SELECT COALESCE(max(numero_etapa),0) AS stage FROM criterika.evoluciones_obtenidas WHERE jugador_id=$1 AND carta_id=$2',
      [playerId, cardId],
    );
    const selected = stages.rows.find((s) => s.numero === stage);
    const image = selected?.imagen
      ? await tx.query(
          "SELECT id FROM criterika.archivos WHERE id=$1 AND estado='ACTIVO' AND uso='EVOLUCION' FOR SHARE",
          [selected.imagen],
        )
      : null;
    facts.at = serverInstant(clock);
    const valid = validateEvolutionPurchase({
      etapa: stage,
      etapaActual: previous.rows[0].stage as 0 | EvolutionStage,
      cartaObtenida: !!acquired.rowCount,
      etapaDisponible:
        card.rows[0]?.estado === 'PUBLICADO' &&
        !!selected?.habilitada &&
        !!image?.rowCount,
      gemas: facts.state.gemasSaldo,
    });
    if (!valid.ok) return { kind: 'rejected', reason: valid.reason } as const;
    const current = await readCollectionCard(tx, playerId, cardId);
    if (!current || stages.rows.length !== 3 || !selected?.imagen)
      throw new PersistenceInvariantError('Carta de evolución incompleta.');
    const next = {
      ...facts,
      state: {
        ...facts.state,
        gemasSaldo: facts.state.gemasSaldo - valid.costoGemas,
      },
    };
    const economy = receiptEconomy(this.projectEconomy, next);
    const confirmedCard = {
      ...current,
      etapaActual: stage,
      evoluciones: current.evoluciones.map((e) => ({
        ...e,
        obtenida: e.obtenida || e.etapa === stage,
        imagenMediaId: e.etapa === stage ? selected.imagen : e.imagenMediaId,
        disponible:
          e.etapa === stage + 1 &&
          !!stages.rows.find((s) => s.numero === e.etapa)?.habilitada,
      })),
    };
    const payload = jsonObject({
      formato: 1,
      economia: economy,
      carta: confirmedCard,
    });
    const inserted = await tx.query(
      `INSERT INTO criterika.evoluciones_obtenidas(id,jugador_id,carta_obtenida_id,carta_id,numero_etapa,gemas_gastadas,economia_al_confirmar,obtenida_en)
   VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [
        id,
        playerId,
        acquired.rows[0].id,
        cardId,
        stage,
        valid.costoGemas,
        payload,
        facts.at,
      ],
    );
    if (!inserted.rowCount) return { kind: 'receipt_conflict' } as const;
    await tx.query(
      'UPDATE criterika.estados_jugador SET gemas_saldo=$2 WHERE cuenta_id=$1',
      [playerId, next.state.gemasSaldo],
    );
    await tx.query(
      `INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,evolucion_obtenida_id,creado_en)
   VALUES($1,'EVOLUCION',$2,$3,$4,$5)`,
      [playerId, -valid.costoGemas, next.state.gemasSaldo, id, facts.at],
    );
    return {
      kind: 'purchased',
      receipt: (await this.getOwned(tx, playerId, id))!,
    } as const;
  }
}
