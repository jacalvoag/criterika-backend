/**
 * Lives rules from the OpenAPI contract (info description and schema Lives):
 * at most five lives including the reserved one; reserving neither consumes
 * a life nor starts regeneration; failing/abandoning consumes the reserved
 * life once; approving/cancelling releases it. One life regenerates every
 * 60 minutes while below the maximum; another loss does not restart the
 * clock, and leftover time is discarded on reaching five.
 *
 * Pure functions: the caller passes the server time.
 */
export const MAX_LIVES = 5;
export const REGENERATION_INTERVAL_MS = 60 * 60 * 1000;

/** Stored player state: total lives already include the reserved one. */
export interface LivesState {
  totales: number;
  reservadas: 0 | 1;
  proximaRegeneracionEn: Date | null;
}

/** Effective state at a given instant, as exposed by schema Lives. */
export interface EffectiveLives extends LivesState {
  disponibles: number;
}

export type ReservationOutcome =
  'APROBADO' | 'CANCELADO' | 'FALLIDO' | 'ABANDONADO';

/**
 * ALREADY_RESERVED is an internal reason (no contract code): schema Lives
 * allows one reserved life at most.
 */
export type ReserveLifeResult =
  | { ok: true; state: LivesState }
  | { ok: false; reason: 'NO_LIVES' | 'ALREADY_RESERVED' };

/**
 * NO_RESERVATION is an internal reason (no contract code): settling an
 * attempt without a reserved life must not take a life.
 */
export type SettleReservationResult =
  { ok: true; state: LivesState } | { ok: false; reason: 'NO_RESERVATION' };

export function calculateLives(state: LivesState, now: Date): EffectiveLives {
  const { reservadas } = state;
  let { totales, proximaRegeneracionEn } = state;

  if (totales >= MAX_LIVES) {
    totales = MAX_LIVES;
    proximaRegeneracionEn = null;
  } else if (
    proximaRegeneracionEn !== null &&
    proximaRegeneracionEn.getTime() <= now.getTime()
  ) {
    const elapsed = now.getTime() - proximaRegeneracionEn.getTime();
    const regenerated = Math.floor(elapsed / REGENERATION_INTERVAL_MS) + 1;
    totales = Math.min(MAX_LIVES, totales + regenerated);
    proximaRegeneracionEn =
      totales === MAX_LIVES
        ? null
        : new Date(
            proximaRegeneracionEn.getTime() +
              regenerated * REGENERATION_INTERVAL_MS,
          );
  }

  return {
    totales,
    disponibles: totales - reservadas,
    reservadas,
    proximaRegeneracionEn,
  };
}

export function reserveLife(state: LivesState, now: Date): ReserveLifeResult {
  if (state.reservadas === 1) {
    return { ok: false, reason: 'ALREADY_RESERVED' };
  }

  const current = calculateLives(state, now);
  if (current.disponibles < 1) {
    return { ok: false, reason: 'NO_LIVES' };
  }
  return {
    ok: true,
    state: {
      totales: current.totales,
      reservadas: 1,
      proximaRegeneracionEn: current.proximaRegeneracionEn,
    },
  };
}

export function settleReservation(
  state: LivesState,
  outcome: ReservationOutcome,
  now: Date,
): SettleReservationResult {
  if (state.reservadas === 0) {
    return { ok: false, reason: 'NO_RESERVATION' };
  }

  const { totales, proximaRegeneracionEn } = calculateLives(state, now);

  if (outcome === 'APROBADO' || outcome === 'CANCELADO') {
    return {
      ok: true,
      state: { totales, reservadas: 0, proximaRegeneracionEn },
    };
  }

  return {
    ok: true,
    state: {
      totales: totales - 1,
      reservadas: 0,
      proximaRegeneracionEn:
        proximaRegeneracionEn ??
        new Date(now.getTime() + REGENERATION_INTERVAL_MS),
    },
  };
}
