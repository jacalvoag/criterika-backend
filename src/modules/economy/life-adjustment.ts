/**
 * Administrative life adjustment (operation adjustPlayerLives): it never
 * removes an active reservation and limits are revalidated at confirmation,
 * so a result above five is rejected with LIFE_CAP_EXCEEDED (409) instead of
 * being clamped. Regeneration is applied first; going down from five starts
 * the clock once, and an adjustment below five keeps the computed clock.
 *
 * The caller validates cantidad (LifeAdjustmentInput: integer from -5 to 5,
 * not zero) and passes the server time.
 */
import {
  calculateLives,
  MAX_LIVES,
  REGENERATION_INTERVAL_MS,
  type LivesState,
} from './lives.js';

/**
 * MISSING_REGENERATION_CLOCK is an internal inconsistency (500
 * INTERNAL_ERROR): the schema requires a clock below five lives.
 * WOULD_REMOVE_RESERVED_LIFE is an internal reason with no contract code.
 */
export type LifeAdjustmentResult =
  | { ok: true; state: LivesState }
  | {
      ok: false;
      reason:
        | 'MISSING_REGENERATION_CLOCK'
        | 'WOULD_REMOVE_RESERVED_LIFE'
        | 'LIFE_CAP_EXCEEDED';
    };

export function adjustLives(
  state: LivesState,
  cantidad: number,
  serverNow: Date,
): LifeAdjustmentResult {
  if (state.totales < MAX_LIVES && state.proximaRegeneracionEn === null) {
    return { ok: false, reason: 'MISSING_REGENERATION_CLOCK' };
  }

  const current = calculateLives(state, serverNow);
  const totales = current.totales + cantidad;

  if (totales < current.reservadas) {
    return { ok: false, reason: 'WOULD_REMOVE_RESERVED_LIFE' };
  }
  if (totales > MAX_LIVES) {
    return { ok: false, reason: 'LIFE_CAP_EXCEEDED' };
  }

  let proximaRegeneracionEn = current.proximaRegeneracionEn;
  if (totales === MAX_LIVES) {
    proximaRegeneracionEn = null;
  } else if (current.totales === MAX_LIVES) {
    proximaRegeneracionEn = new Date(
      serverNow.getTime() + REGENERATION_INTERVAL_MS,
    );
  }

  return {
    ok: true,
    state: { totales, reservadas: current.reservadas, proximaRegeneracionEn },
  };
}
