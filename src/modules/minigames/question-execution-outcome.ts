/**
 * Pass rule of a finished question execution, from QuestionCriteria and
 * QuestionExecution in the OpenAPI contract: the execution is passed when the
 * share of correct answers reaches `porcentajeMinimo` (1-100, default 80)
 * over 1-30 questions. Callers decide once every question is answered,
 * because the contract does not allow skipping questions.
 */
export const DEFAULT_QUESTION_PASS_PERCENTAGE = 80;

const MAX_QUESTIONS_PER_EXECUTION = 30;
const MIN_PASS_PERCENTAGE = 1;
const MAX_PASS_PERCENTAGE = 100;

export type QuestionExecutionProgress = {
  aciertos: number;
  totalPreguntas: number;
};

/** Internal reasons for impossible input; the contract has no code for them. */
export type QuestionExecutionViolation =
  | 'INVALID_QUESTION_COUNT'
  | 'INVALID_CORRECT_COUNT'
  | 'INVALID_PASS_PERCENTAGE';

export type QuestionExecutionDecision =
  | { ok: true; resultadoEjecucion: 'SUPERADA' | 'FALLIDA' }
  | { ok: false; reason: QuestionExecutionViolation };

export function decideQuestionExecution(
  { aciertos, totalPreguntas }: QuestionExecutionProgress,
  porcentajeMinimo: number = DEFAULT_QUESTION_PASS_PERCENTAGE,
): QuestionExecutionDecision {
  if (
    !Number.isInteger(totalPreguntas) ||
    totalPreguntas < 1 ||
    totalPreguntas > MAX_QUESTIONS_PER_EXECUTION
  ) {
    return { ok: false, reason: 'INVALID_QUESTION_COUNT' };
  }
  if (
    !Number.isInteger(aciertos) ||
    aciertos < 0 ||
    aciertos > totalPreguntas
  ) {
    return { ok: false, reason: 'INVALID_CORRECT_COUNT' };
  }
  if (
    !Number.isInteger(porcentajeMinimo) ||
    porcentajeMinimo < MIN_PASS_PERCENTAGE ||
    porcentajeMinimo > MAX_PASS_PERCENTAGE
  ) {
    return { ok: false, reason: 'INVALID_PASS_PERCENTAGE' };
  }

  // Compared as integers so a fractional percentage can never round in favor of the player.
  const passed = aciertos * 100 >= porcentajeMinimo * totalPreguntas;
  return { ok: true, resultadoEjecucion: passed ? 'SUPERADA' : 'FALLIDA' };
}
