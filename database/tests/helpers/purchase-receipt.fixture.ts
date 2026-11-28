import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PlayerStateRow } from '../../../src/modules/economy/repositories/game-economy.repository.js';
import {
  calculateLives,
  MAX_LIVES,
} from '../../../src/modules/economy/lives.js';
/** Test-only projection; production uses Rafael's actual policy for visible streak. */
export function testEconomy(facts: {
  state: PlayerStateRow;
  reserved: 0 | 1;
  at: Date;
}) {
  const lives = calculateLives(
    {
      totales: facts.state.vidasTotales,
      reservadas: facts.reserved,
      proximaRegeneracionEn: facts.state.proximaRegeneracionEn,
    },
    facts.at,
  );
  return {
    gemas: facts.state.gemasSaldo,
    xp: facts.state.xpTotal,
    calculadaEn: facts.at.toISOString(),
    vidas: {
      ...lives,
      maximo: MAX_LIVES,
      proximaRegeneracionEn: lives.proximaRegeneracionEn?.toISOString() ?? null,
    },
    racha: {
      dias: facts.state.rachaContadorHito,
      ultimaFechaLocalAprobada: facts.state.rachaUltimoDia,
      zonaHoraria: facts.state.rachaZona,
    },
  };
}
export async function setGems(operator: Pool, player: string, target: number) {
  const tx = await operator.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(
      "SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,gen_random_uuid(),'Ajuste ficticio contable de prueba')",
    );
    const { rows } = await tx.query<{ saldo: string }>(
      'SELECT gemas_saldo::text AS saldo FROM criterika.estados_jugador WHERE cuenta_id=$1 FOR UPDATE',
      [player],
    );
    const delta = target - Number(rows[0].saldo);
    if (delta) {
      const id = randomUUID();
      await tx.query(
        "INSERT INTO criterika.correcciones_administrativas(id,jugador_id,tipo,cantidad,motivo) VALUES($1,$2,'GEMAS',$3,'Ajuste ficticio')",
        [id, player, delta],
      );
      await tx.query(
        "INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,correccion_id) VALUES($1,'AJUSTE_ADMIN',$2,$3,$4)",
        [player, delta, target, id],
      );
      await tx.query(
        'UPDATE criterika.estados_jugador SET gemas_saldo=$2 WHERE cuenta_id=$1',
        [player, target],
      );
    }
    await tx.query('COMMIT');
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}
