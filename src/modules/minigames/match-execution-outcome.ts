/**
 * Outcome of a match execution, from MatchCriteria and MatchExecution in the
 * OpenAPI contract. `erroresPermitidos` (1-20, default 3) wrong associations
 * are allowed for the whole activity; exceeding them fails, as in the
 * crossword acceptance scenario. Solving every pair (2-12) passes.
 */
export const DEFAULT_MATCH_ALLOWED_ERRORS = 3;

const MIN_PAIRS = 2;
const MAX_PAIRS = 12;
const MIN_ALLOWED_ERRORS = 1;
const MAX_ALLOWED_ERRORS = 20;

export type MatchExecutionProgress = {
  errores: number;
  asociacionesResueltas: number;
  totalParejas: number;
};

/** Internal reasons for impossible input; the contract has no code for them. */
export type MatchExecutionViolation =
  | 'INVALID_PAIR_COUNT'
  | 'INVALID_RESOLVED_COUNT'
  | 'INVALID_ERROR_COUNT'
  | 'INVALID_ALLOWED_ERRORS';

export type MatchExecutionDecision =
  | { ok: true; resultadoEjecucion: 'EN_CURSO' | 'SUPERADA' | 'FALLIDA' }
  | { ok: false; reason: MatchExecutionViolation };

export function decideMatchExecution(
  { errores, asociacionesResueltas, totalParejas }: MatchExecutionProgress,
  erroresPermitidos: number = DEFAULT_MATCH_ALLOWED_ERRORS,
): MatchExecutionDecision {
  if (
    !Number.isInteger(totalParejas) ||
    totalParejas < MIN_PAIRS ||
    totalParejas > MAX_PAIRS
  ) {
    return { ok: false, reason: 'INVALID_PAIR_COUNT' };
  }
  if (
    !Number.isInteger(asociacionesResueltas) ||
    asociacionesResueltas < 0 ||
    asociacionesResueltas > totalParejas
  ) {
    return { ok: false, reason: 'INVALID_RESOLVED_COUNT' };
  }
  if (!Number.isInteger(errores) || errores < 0) {
    return { ok: false, reason: 'INVALID_ERROR_COUNT' };
  }
  if (
    !Number.isInteger(erroresPermitidos) ||
    erroresPermitidos < MIN_ALLOWED_ERRORS ||
    erroresPermitidos > MAX_ALLOWED_ERRORS
  ) {
    return { ok: false, reason: 'INVALID_ALLOWED_ERRORS' };
  }

  if (errores > erroresPermitidos) {
    return { ok: true, resultadoEjecucion: 'FALLIDA' };
  }
  if (asociacionesResueltas === totalParejas) {
    return { ok: true, resultadoEjecucion: 'SUPERADA' };
  }
  return { ok: true, resultadoEjecucion: 'EN_CURSO' };
}
