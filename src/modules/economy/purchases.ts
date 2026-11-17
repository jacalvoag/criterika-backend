/**
 * Purchase rules from the OpenAPI contract (info description, operations
 * purchaseLives and purchaseEvolution, schemas LifePackage, EvolutionInput
 * and CardView):
 * - Life packages VIDA_1/VIDAS_3/VIDAS_5 give 1/3/5 lives for 100/150/250
 *   gems. All or nothing: a package that would exceed five lives (reserved
 *   one included, recalculated at confirmation) is rejected with
 *   LIFE_CAP_EXCEEDED. Buying never restarts the regeneration clock.
 * - Evolutions are linear: only the next stage of an obtained card, for
 *   150/350/500 gems. Disabled stages cannot be bought.
 *
 * State rules are checked before the balance; the contract does not fix a
 * priority. Pure functions: they never touch balances.
 */
import { calculateLives, MAX_LIVES, type LivesState } from './lives.js';

export type LifePackageId = 'VIDA_1' | 'VIDAS_3' | 'VIDAS_5';

export const LIFE_PACKAGES = {
  VIDA_1: { vidas: 1, costoGemas: 100 },
  VIDAS_3: { vidas: 3, costoGemas: 150 },
  VIDAS_5: { vidas: 5, costoGemas: 250 },
} as const satisfies Record<
  LifePackageId,
  { vidas: number; costoGemas: number }
>;

export type EvolutionStage = 1 | 2 | 3;
export type CardStage = 0 | EvolutionStage;

export const EVOLUTION_COSTS = {
  1: 150,
  2: 350,
  3: 500,
} as const satisfies Record<EvolutionStage, number>;

export interface LifePurchaseInput {
  paqueteId: LifePackageId;
  gemas: number;
  lives: LivesState;
}

export type LifePurchaseResult =
  | {
      ok: true;
      costoGemas: number;
      vidasAgregadas: number;
      lives: LivesState;
    }
  | { ok: false; reason: 'LIFE_CAP_EXCEEDED' | 'INSUFFICIENT_GEMS' };

export interface EvolutionPurchaseInput {
  etapa: EvolutionStage;
  etapaActual: CardStage;
  cartaObtenida: boolean;
  etapaDisponible: boolean;
  gemas: number;
}

/**
 * CARD_NOT_OBTAINED and EVOLUTION_DISABLED are internal reasons: the contract
 * states both rules but gives them no error code.
 */
export type EvolutionPurchaseResult =
  | { ok: true; costoGemas: number }
  | {
      ok: false;
      reason:
        | 'CARD_NOT_OBTAINED'
        | 'EVOLUTION_ALREADY_OWNED'
        | 'EVOLUTION_ORDER_REQUIRED'
        | 'EVOLUTION_DISABLED'
        | 'INSUFFICIENT_GEMS';
    };

export function validateLifePurchase(
  input: LifePurchaseInput,
  now: Date,
): LifePurchaseResult {
  const { vidas, costoGemas } = LIFE_PACKAGES[input.paqueteId];
  const current = calculateLives(input.lives, now);
  const totales = current.totales + vidas;

  if (totales > MAX_LIVES) {
    return { ok: false, reason: 'LIFE_CAP_EXCEEDED' };
  }
  if (input.gemas < costoGemas) {
    return { ok: false, reason: 'INSUFFICIENT_GEMS' };
  }

  return {
    ok: true,
    costoGemas,
    vidasAgregadas: vidas,
    lives: {
      totales,
      reservadas: current.reservadas,
      proximaRegeneracionEn:
        totales === MAX_LIVES ? null : current.proximaRegeneracionEn,
    },
  };
}

export function validateEvolutionPurchase(
  input: EvolutionPurchaseInput,
): EvolutionPurchaseResult {
  if (!input.cartaObtenida) {
    return { ok: false, reason: 'CARD_NOT_OBTAINED' };
  }
  if (input.etapa <= input.etapaActual) {
    return { ok: false, reason: 'EVOLUTION_ALREADY_OWNED' };
  }
  if (input.etapa !== input.etapaActual + 1) {
    return { ok: false, reason: 'EVOLUTION_ORDER_REQUIRED' };
  }
  if (!input.etapaDisponible) {
    return { ok: false, reason: 'EVOLUTION_DISABLED' };
  }

  const costoGemas = EVOLUTION_COSTS[input.etapa];
  if (input.gemas < costoGemas) {
    return { ok: false, reason: 'INSUFFICIENT_GEMS' };
  }

  return { ok: true, costoGemas };
}
