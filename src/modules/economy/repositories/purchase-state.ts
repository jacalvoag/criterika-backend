import type { PoolClient } from 'pg';
import {
  requireHumanContext,
  serverInstant,
} from '../../../database/persistence-checks.js';
import {
  PersistenceInvariantError,
  jsonObject,
  type JsonObject,
} from '../../../database/persistence-values.js';
import { GameAccountRepository } from '../../accounts/repositories/game-account.repository.js';
import {
  GameEconomyRepository,
  type PlayerStateRow,
} from './game-economy.repository.js';
import { calculateLives, MAX_LIVES } from '../lives.js';
export interface PurchaseFacts {
  state: PlayerStateRow;
  reserved: 0 | 1;
  at: Date;
}
/** Rafael provides the real, pure economy projection; never accept this callback/payload from HTTP. */
export type ReceiptEconomyProjector = (facts: PurchaseFacts) => JsonObject;
export async function lockPurchase(
  tx: PoolClient,
  playerId: string,
  clock: () => Date,
): Promise<PurchaseFacts | null> {
  await requireHumanContext(tx, playerId, true);
  const account = await new GameAccountRepository().lockPlayerAccount(
    tx,
    playerId,
  );
  if (!account || account.situacionOperativa !== 'HABILITADA') return null;
  const state = await new GameEconomyRepository().lockPlayerState(tx, playerId);
  if (!state) return null;
  const { rows } = await tx.query<{ active: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM criterika.intentos_nivel WHERE jugador_id=$1 AND estado='EN_CURSO') AS active",
    [playerId],
  );
  return { state, reserved: rows[0].active ? 1 : 0, at: serverInstant(clock) };
}
export function receiptEconomy(
  project: ReceiptEconomyProjector,
  facts: PurchaseFacts,
): JsonObject {
  const isolated: PurchaseFacts = {
    state: {
      ...facts.state,
      proximaRegeneracionEn: facts.state.proximaRegeneracionEn
        ? new Date(facts.state.proximaRegeneracionEn.getTime())
        : null,
    },
    reserved: facts.reserved,
    at: new Date(facts.at.getTime()),
  };
  const value = JSON.parse(jsonObject(project(isolated))) as JsonObject;
  const lives = calculateLives(
    {
      totales: facts.state.vidasTotales,
      reservadas: facts.reserved,
      proximaRegeneracionEn: facts.state.proximaRegeneracionEn,
    },
    facts.at,
  );
  const v = value.vidas as JsonObject | undefined,
    r = value.racha as JsonObject | undefined;
  if (
    Object.keys(value).sort().join(',') !==
      'calculadaEn,gemas,racha,vidas,xp' ||
    value.gemas !== facts.state.gemasSaldo ||
    value.xp !== facts.state.xpTotal ||
    value.calculadaEn !== facts.at.toISOString() ||
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(',') !==
      'disponibles,maximo,proximaRegeneracionEn,reservadas,totales' ||
    v.totales !== lives.totales ||
    v.disponibles !== lives.disponibles ||
    v.reservadas !== lives.reservadas ||
    v.maximo !== MAX_LIVES ||
    v.proximaRegeneracionEn !==
      (lives.proximaRegeneracionEn?.toISOString() ?? null) ||
    !r ||
    typeof r !== 'object' ||
    Array.isArray(r) ||
    Object.keys(r).sort().join(',') !==
      'dias,ultimaFechaLocalAprobada,zonaHoraria' ||
    typeof r.dias !== 'number' ||
    !Number.isSafeInteger(r.dias) ||
    r.dias < 0 ||
    r.ultimaFechaLocalAprobada !== facts.state.rachaUltimoDia ||
    r.zonaHoraria !== facts.state.rachaZona
  )
    throw new PersistenceInvariantError(
      'La proyección de recibo no corresponde al estado confirmado.',
    );
  return value;
}
