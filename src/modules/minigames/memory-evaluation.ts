import type { EvaluationResult } from './evaluation-result.js';
import type {
  MemoryAnswer,
  MemoryDefinition,
  MemoryFeedback,
  MemoryProgress,
  MemoryRejectionReason,
} from './memory-evaluation.types.js';

/**
 * Evaluates one memory selection (MemoryAnswer -> MemoryFeedback in the
 * OpenAPI contract). Impossible selections and already solved cards are
 * rejected without counting an error (submitGameAnswer).
 */
export function evaluateMemory(
  definition: MemoryDefinition,
  answer: MemoryAnswer,
  progress: MemoryProgress,
): EvaluationResult<MemoryFeedback, MemoryRejectionReason> {
  const [firstId, secondId] = answer.tarjetasIds;
  if (
    answer.tarjetasIds.length !== 2 ||
    firstId === undefined ||
    secondId === undefined ||
    firstId === secondId
  ) {
    return { ok: false, reason: 'INVALID_SELECTION' };
  }

  const first = definition.tarjetas.find((card) => card.id === firstId);
  const second = definition.tarjetas.find((card) => card.id === secondId);
  if (first === undefined || second === undefined) {
    return { ok: false, reason: 'CARD_NOT_FOUND' };
  }

  const resolvedIds = new Set(progress.parejasResueltas.flat());
  if (resolvedIds.has(firstId) || resolvedIds.has(secondId)) {
    return { ok: false, reason: 'CARD_ALREADY_RESOLVED' };
  }

  return {
    ok: true,
    feedback: {
      tipo: 'MEMORAMA',
      correcta: first.parejaId === second.parejaId,
      tarjetasIds: [firstId, secondId],
    },
  };
}
