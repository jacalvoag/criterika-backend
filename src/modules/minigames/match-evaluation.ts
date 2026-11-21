import type { EvaluationResult } from './evaluation-result.js';
import type {
  MatchAnswer,
  MatchDefinition,
  MatchFeedback,
  MatchProgress,
  MatchRejectionReason,
} from './match-evaluation.types.js';

/**
 * Evaluates one association (MatchAnswer -> MatchFeedback in the OpenAPI
 * contract). Ids must belong to their own column; unknown ids and items
 * already solved are rejected without counting an error (submitGameAnswer).
 */
export function evaluateMatch(
  definition: MatchDefinition,
  answer: MatchAnswer,
  progress: MatchProgress,
): EvaluationResult<MatchFeedback, MatchRejectionReason> {
  const { izquierdaId, derechaId } = answer;
  const leftExists = definition.parejas.some(
    (pair) => pair.izquierdaId === izquierdaId,
  );
  const rightExists = definition.parejas.some(
    (pair) => pair.derechaId === derechaId,
  );
  if (!leftExists || !rightExists) {
    return { ok: false, reason: 'ITEM_NOT_FOUND' };
  }

  const alreadyResolved = progress.asociacionesResueltas.some(
    (pair) => pair.izquierdaId === izquierdaId || pair.derechaId === derechaId,
  );
  if (alreadyResolved) {
    return { ok: false, reason: 'ITEM_ALREADY_RESOLVED' };
  }

  return {
    ok: true,
    feedback: {
      tipo: 'RELACIONAR',
      correcta: definition.parejas.some(
        (pair) =>
          pair.izquierdaId === izquierdaId && pair.derechaId === derechaId,
      ),
      izquierdaId,
      derechaId,
    },
  };
}
