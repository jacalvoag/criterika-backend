import type {
  CrosswordAnswer,
  CrosswordDefinition,
  CrosswordFeedback,
  CrosswordRejectionReason,
} from './crossword-evaluation.types.js';
import type { EvaluationResult } from './evaluation-result.js';
import { normalizeWordText } from './word-normalization.js';

/**
 * Evaluates one check of the whole crossword (CrosswordAnswer ->
 * CrosswordFeedback in the OpenAPI contract). Each entry is compared with its
 * word through normalizeWordText; an entry that is empty once normalized
 * counts as incorrect ("Campo vacío cuenta como incorrecto al comprobar").
 * The feedback lists the wrong clues without revealing any solution.
 */
export function evaluateCrossword(
  definition: CrosswordDefinition,
  answer: CrosswordAnswer,
): EvaluationResult<CrosswordFeedback, CrosswordRejectionReason> {
  const entries = new Map<string, string>();
  for (const { palabraId, texto } of answer.respuestas) {
    if (entries.has(palabraId)) {
      return { ok: false, reason: 'DUPLICATE_ENTRY' };
    }
    entries.set(palabraId, texto);
  }

  const wordIds = new Set(definition.palabras.map((word) => word.id));
  if ([...entries.keys()].some((palabraId) => !wordIds.has(palabraId))) {
    return { ok: false, reason: 'WORD_NOT_FOUND' };
  }
  if (entries.size !== wordIds.size) {
    return { ok: false, reason: 'MISSING_ENTRY' };
  }

  const palabrasIncorrectasIds = definition.palabras
    .filter((word) => {
      const entry = normalizeWordText(entries.get(word.id) ?? '');
      return entry === '' || entry !== normalizeWordText(word.texto);
    })
    .map((word) => word.id);

  return {
    ok: true,
    feedback: {
      tipo: 'CRUCIGRAMA',
      correcta: palabrasIncorrectasIds.length === 0,
      palabrasIncorrectasIds,
    },
  };
}
