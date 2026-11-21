/**
 * Outcome of a memory execution, from MemoryCriteria and MemoryExecution in
 * the OpenAPI contract. The allowed errors are `erroresPorPareja` (1-5,
 * default 2) times the number of pairs (2-12): the getCurrentExecution
 * example has 2 pairs, 2 per pair and erroresPermitidos 4, and the maximum
 * erroresPermitidos is 60 = 5 x 12. Reaching the limit is still allowed;
 * exceeding it fails, as in the crossword acceptance scenario.
 */
export const DEFAULT_MEMORY_ERRORS_PER_PAIR = 2;

const MIN_PAIRS = 2;
const MAX_PAIRS = 12;
const MIN_ERRORS_PER_PAIR = 1;
const MAX_ERRORS_PER_PAIR = 5;

export type MemoryExecutionProgress = {
  errores: number;
  parejasResueltas: number;
  totalParejas: number;
};

/** Internal reasons for impossible input; the contract has no code for them. */
export type MemoryExecutionViolation =
  | 'INVALID_PAIR_COUNT'
  | 'INVALID_RESOLVED_COUNT'
  | 'INVALID_ERROR_COUNT'
  | 'INVALID_ERRORS_PER_PAIR';

export type MemoryExecutionDecision =
  | { ok: true; resultadoEjecucion: 'EN_CURSO' | 'SUPERADA' | 'FALLIDA' }
  | { ok: false; reason: MemoryExecutionViolation };

export function decideMemoryExecution(
  { errores, parejasResueltas, totalParejas }: MemoryExecutionProgress,
  erroresPorPareja: number = DEFAULT_MEMORY_ERRORS_PER_PAIR,
): MemoryExecutionDecision {
  if (
    !Number.isInteger(totalParejas) ||
    totalParejas < MIN_PAIRS ||
    totalParejas > MAX_PAIRS
  ) {
    return { ok: false, reason: 'INVALID_PAIR_COUNT' };
  }
  if (
    !Number.isInteger(parejasResueltas) ||
    parejasResueltas < 0 ||
    parejasResueltas > totalParejas
  ) {
    return { ok: false, reason: 'INVALID_RESOLVED_COUNT' };
  }
  if (!Number.isInteger(errores) || errores < 0) {
    return { ok: false, reason: 'INVALID_ERROR_COUNT' };
  }
  if (
    !Number.isInteger(erroresPorPareja) ||
    erroresPorPareja < MIN_ERRORS_PER_PAIR ||
    erroresPorPareja > MAX_ERRORS_PER_PAIR
  ) {
    return { ok: false, reason: 'INVALID_ERRORS_PER_PAIR' };
  }

  if (errores > erroresPorPareja * totalParejas) {
    return { ok: true, resultadoEjecucion: 'FALLIDA' };
  }
  if (parejasResueltas === totalParejas) {
    return { ok: true, resultadoEjecucion: 'SUPERADA' };
  }
  return { ok: true, resultadoEjecucion: 'EN_CURSO' };
}
