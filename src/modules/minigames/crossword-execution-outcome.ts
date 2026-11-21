/**
 * Outcome of a crossword execution, from CrosswordCriteria and
 * CrosswordExecution in the OpenAPI contract. `comprobacionesIncorrectasPermitidas`
 * (1-10, default 3) wrong checks are allowed; the next one fails, which is why
 * CrosswordExecution.comprobacionesIncorrectas goes up to 11. A correct check
 * passes while that limit was not exceeded (x-acceptance-scenarios "Cuarta
 * comprobación de crucigrama correcta"). A check adds at most one error
 * (CrosswordFeedback), so callers count checks, not wrong words.
 */
export const DEFAULT_CROSSWORD_INCORRECT_CHECKS = 3;

const MIN_ALLOWED_CHECKS = 1;
const MAX_ALLOWED_CHECKS = 10;

export type CrosswordExecutionProgress = {
  comprobacionesIncorrectas: number;
  ultimaComprobacionCorrecta: boolean;
};

/** Internal reasons for impossible input; the contract has no code for them. */
export type CrosswordExecutionViolation =
  'INVALID_ALLOWED_CHECKS' | 'INVALID_INCORRECT_CHECK_COUNT';

export type CrosswordExecutionDecision =
  | { ok: true; resultadoEjecucion: 'EN_CURSO' | 'SUPERADA' | 'FALLIDA' }
  | { ok: false; reason: CrosswordExecutionViolation };

export function decideCrosswordExecution(
  {
    comprobacionesIncorrectas,
    ultimaComprobacionCorrecta,
  }: CrosswordExecutionProgress,
  comprobacionesIncorrectasPermitidas: number = DEFAULT_CROSSWORD_INCORRECT_CHECKS,
): CrosswordExecutionDecision {
  if (
    !Number.isInteger(comprobacionesIncorrectasPermitidas) ||
    comprobacionesIncorrectasPermitidas < MIN_ALLOWED_CHECKS ||
    comprobacionesIncorrectasPermitidas > MAX_ALLOWED_CHECKS
  ) {
    return { ok: false, reason: 'INVALID_ALLOWED_CHECKS' };
  }
  if (
    !Number.isInteger(comprobacionesIncorrectas) ||
    comprobacionesIncorrectas < 0 ||
    comprobacionesIncorrectas > comprobacionesIncorrectasPermitidas + 1
  ) {
    return { ok: false, reason: 'INVALID_INCORRECT_CHECK_COUNT' };
  }

  if (comprobacionesIncorrectas > comprobacionesIncorrectasPermitidas) {
    return { ok: true, resultadoEjecucion: 'FALLIDA' };
  }
  if (ultimaComprobacionCorrecta) {
    return { ok: true, resultadoEjecucion: 'SUPERADA' };
  }
  return { ok: true, resultadoEjecucion: 'EN_CURSO' };
}
