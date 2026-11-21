import type { EvaluationResult } from './evaluation-result.js';
import type {
  QuestionAnswer,
  QuestionDefinition,
  QuestionFeedback,
  QuestionRejectionReason,
} from './question-evaluation.types.js';

/**
 * Evaluates a player's answer against the server-side definition
 * (QuestionAnswer -> QuestionFeedback in the OpenAPI contract).
 * Correctness is derived only from the definition; any client field
 * claiming the result is ignored.
 */
export function evaluateQuestion(
  definition: QuestionDefinition,
  answer: QuestionAnswer,
): EvaluationResult<QuestionFeedback, QuestionRejectionReason> {
  if (answer.preguntaId.trim() === '' || answer.opcionId.trim() === '') {
    return { ok: false, reason: 'EMPTY_ANSWER' };
  }
  if (answer.preguntaId !== definition.id) {
    return { ok: false, reason: 'QUESTION_MISMATCH' };
  }
  if (!definition.opciones.some((option) => option.id === answer.opcionId)) {
    return { ok: false, reason: 'OPTION_NOT_FOUND' };
  }

  return {
    ok: true,
    feedback: {
      tipo: 'PREGUNTAS',
      correcta: answer.opcionId === definition.opcionCorrectaId,
      preguntaId: definition.id,
      opcionCorrectaId: definition.opcionCorrectaId,
      explicacion: definition.explicacion,
    },
  };
}
