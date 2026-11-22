import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  PersistenceInvariantError,
  requireOne,
  safeInteger,
} from '../../../database/persistence-values.js';
import type { StreakState } from '../streak.js';

export interface PlayerStateRow {
  cuentaId: string;
  gemasSaldo: number;
  xpTotal: number;
  vidasTotales: number;
  proximaRegeneracionEn: Date | null;
  rachaUltimoDia: string | null;
  rachaContadorHito: number;
  rachaZona: string;
}
interface StateRecord extends Omit<PlayerStateRow, 'gemasSaldo' | 'xpTotal'> {
  gemasSaldo: string;
  xpTotal: string;
}

const STATE_SELECT = `SELECT cuenta_id AS "cuentaId",gemas_saldo AS "gemasSaldo",xp_total AS "xpTotal",
  vidas_totales AS "vidasTotales",proxima_regeneracion_en AS "proximaRegeneracionEn",
  racha_ultimo_dia::text AS "rachaUltimoDia",racha_contador_hito AS "rachaContadorHito",racha_zona AS "rachaZona"
  FROM criterika.estados_jugador WHERE cuenta_id=$1`;

@Injectable()
export class GameEconomyRepository {
  async findPlayerState(
    client: PoolClient,
    cuentaId: string,
  ): Promise<PlayerStateRow | null> {
    return this.readState(client, cuentaId, false);
  }

  async lockPlayerState(
    client: PoolClient,
    cuentaId: string,
  ): Promise<PlayerStateRow | null> {
    return this.readState(client, cuentaId, true);
  }

  private async readState(
    client: PoolClient,
    cuentaId: string,
    lock: boolean,
  ): Promise<PlayerStateRow | null> {
    const result = await client.query<StateRecord>(
      STATE_SELECT + (lock ? ' FOR UPDATE' : ''),
      [cuentaId],
    );
    const row = result.rows[0];
    return row
      ? {
          ...row,
          gemasSaldo: safeInteger(row.gemasSaldo),
          xpTotal: safeInteger(row.xpTotal),
        }
      : null;
  }

  async updateLives(
    client: PoolClient,
    cuentaId: string,
    vidas: { vidasTotales: number; proximaRegeneracionEn: Date | null },
  ): Promise<void> {
    const result = await client.query(
      `UPDATE criterika.estados_jugador SET vidas_totales=$2,proxima_regeneracion_en=$3 WHERE cuenta_id=$1`,
      [cuentaId, vidas.vidasTotales, vidas.proximaRegeneracionEn],
    );
    requireOne(result.rowCount);
  }

  /** Caller holds player state. Approval, state and ledger must commit together. */
  async creditLevelReward(
    client: PoolClient,
    input: {
      cuentaId: string;
      aprobacionId: string;
      gemas: number;
      xp: number;
      registradaEn: Date;
    },
  ): Promise<{ saldoPosterior: number }> {
    const approval = await client.query<{
      gemas_otorgadas: number;
      xp_otorgada: number;
    }>(
      `SELECT gemas_otorgadas,xp_otorgada FROM criterika.aprobaciones_nivel
       WHERE id=$1 AND jugador_id=$2 FOR UPDATE`,
      [input.aprobacionId, input.cuentaId],
    );
    if (
      !approval.rows[0] ||
      approval.rows[0].gemas_otorgadas !== input.gemas ||
      approval.rows[0].xp_otorgada !== input.xp
    ) {
      throw new PersistenceInvariantError(
        'Recompensa no corresponde a la aprobación.',
      );
    }
    const previous = await client.query<{ saldo_posterior: string }>(
      'SELECT saldo_posterior FROM criterika.movimientos_gemas WHERE aprobacion_id=$1',
      [input.aprobacionId],
    );
    if (previous.rows[0])
      return { saldoPosterior: safeInteger(previous.rows[0].saldo_posterior) };
    const state = await client.query<{ gemas_saldo: string }>(
      `UPDATE criterika.estados_jugador SET gemas_saldo=gemas_saldo+$2,xp_total=xp_total+$3
       WHERE cuenta_id=$1 AND gemas_saldo+$2<=9007199254740991 AND xp_total+$3<=9007199254740991
       RETURNING gemas_saldo`,
      [input.cuentaId, input.gemas, input.xp],
    );
    requireOne(state.rowCount);
    const saldoPosterior = safeInteger(state.rows[0].gemas_saldo);
    await client.query(
      `INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,aprobacion_id,creado_en)
       VALUES($1,'RECOMPENSA_NIVEL',$2,$3,$4,$5)`,
      [
        input.cuentaId,
        input.gemas,
        saldoPosterior,
        input.aprobacionId,
        input.registradaEn,
      ],
    );
    return { saldoPosterior };
  }

  async updateStreak(
    client: PoolClient,
    cuentaId: string,
    racha: StreakState,
  ): Promise<void> {
    const result = await client.query(
      `UPDATE criterika.estados_jugador SET racha_contador_hito=$2,racha_ultimo_dia=$3::date,racha_zona=$4 WHERE cuenta_id=$1`,
      [cuentaId, racha.dias, racha.ultimaFechaLocalAprobada, racha.zonaHoraria],
    );
    requireOne(result.rowCount);
  }
}
