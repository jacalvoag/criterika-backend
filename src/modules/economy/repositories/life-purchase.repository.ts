import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  PersistenceInvariantError,
  jsonObject,
  type JsonObject,
} from '../../../database/persistence-values.js';
import {
  LIFE_PACKAGES,
  validateLifePurchase,
  type LifePackageId,
} from '../purchases.js';
import {
  lockPurchase,
  receiptEconomy,
  type ReceiptEconomyProjector,
} from './purchase-state.js';
interface LifeReceipt {
  id: string;
  paqueteId: LifePackageId;
  vidasAgregadas: number;
  gemasGastadas: number;
  creadaEn: Date;
  economia: JsonObject;
}
const RECEIPT = `id,paquete AS "paqueteId",vidas_entregadas AS "vidasAgregadas",gemas_gastadas AS "gemasGastadas",creada_en AS "creadaEn",economia_al_confirmar AS economia`;
@Injectable()
export class PostgresLifePurchaseRepository {
  constructor(private readonly projectEconomy: ReceiptEconomyProjector) {}
  async getOwned(
    tx: PoolClient,
    playerId: string,
    id: string,
  ): Promise<LifeReceipt | null> {
    const { rows } = await tx.query<LifeReceipt>(
      `SELECT ${RECEIPT} FROM criterika.compras_vidas WHERE jugador_id=$1 AND id=$2`,
      [playerId, id],
    );
    return rows[0] ?? null;
  }
  /** Account/security/legal eligibility must be checked by the coordinator under the same account lock. */
  async purchaseOwned(
    tx: PoolClient,
    playerId: string,
    id: string,
    packageId: LifePackageId,
    clock: () => Date = () => new Date(),
  ) {
    if (!Object.hasOwn(LIFE_PACKAGES, packageId))
      throw new PersistenceInvariantError('Paquete inválido.');
    const facts = await lockPurchase(tx, playerId, clock);
    if (!facts) return { kind: 'unavailable' } as const;
    const existing = await tx.query<{ jugador_id: string; paquete: string }>(
      'SELECT jugador_id,paquete FROM criterika.compras_vidas WHERE id=$1',
      [id],
    );
    if (existing.rows[0])
      return existing.rows[0].jugador_id === playerId &&
        existing.rows[0].paquete === packageId
        ? ({
            kind: 'existing',
            receipt: (await this.getOwned(tx, playerId, id))!,
          } as const)
        : ({ kind: 'receipt_conflict' } as const);
    const validation = validateLifePurchase(
      {
        paqueteId: packageId,
        gemas: facts.state.gemasSaldo,
        lives: {
          totales: facts.state.vidasTotales,
          reservadas: facts.reserved,
          proximaRegeneracionEn: facts.state.proximaRegeneracionEn,
        },
      },
      facts.at,
    );
    if (!validation.ok)
      return { kind: 'rejected', reason: validation.reason } as const;
    const next = {
      ...facts,
      state: {
        ...facts.state,
        gemasSaldo: facts.state.gemasSaldo - validation.costoGemas,
        vidasTotales: validation.lives.totales,
        proximaRegeneracionEn: validation.lives.proximaRegeneracionEn,
      },
    };
    const economy = receiptEconomy(this.projectEconomy, next);
    const inserted = await tx.query(
      `INSERT INTO criterika.compras_vidas(id,jugador_id,paquete,vidas_entregadas,gemas_gastadas,economia_al_confirmar,creada_en)
   VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [
        id,
        playerId,
        packageId,
        validation.vidasAgregadas,
        validation.costoGemas,
        jsonObject(economy),
        facts.at,
      ],
    );
    if (!inserted.rowCount) return { kind: 'receipt_conflict' } as const;
    await tx.query(
      `UPDATE criterika.estados_jugador SET gemas_saldo=$2,vidas_totales=$3,proxima_regeneracion_en=$4 WHERE cuenta_id=$1`,
      [
        playerId,
        next.state.gemasSaldo,
        next.state.vidasTotales,
        next.state.proximaRegeneracionEn,
      ],
    );
    await tx.query(
      `INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,compra_vidas_id,creado_en)
   VALUES($1,'COMPRA_VIDAS',$2,$3,$4,$5)`,
      [playerId, -validation.costoGemas, next.state.gemasSaldo, id, facts.at],
    );
    return {
      kind: 'purchased',
      receipt: (await this.getOwned(tx, playerId, id))!,
    } as const;
  }
}
