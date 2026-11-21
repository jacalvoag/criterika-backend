/**
 * Outcome of a word search execution, from WordSearchCriteria and
 * WordSearchExecution in the OpenAPI contract. WordSearchCriteria has no
 * error limit (only `tipo`), so a word search is passed once every word
 * (1-20) is found and never fails by errors: it only ends otherwise by
 * abandonment or timeout, which gameplay handles.
 */
const MIN_WORDS = 1;
const MAX_WORDS = 20;

export type WordSearchExecutionProgress = {
  encontradas: number;
  totalPalabras: number;
};

/** Internal reasons for impossible input; the contract has no code for them. */
export type WordSearchExecutionViolation =
  'INVALID_WORD_COUNT' | 'INVALID_FOUND_COUNT';

export type WordSearchExecutionDecision =
  | { ok: true; resultadoEjecucion: 'EN_CURSO' | 'SUPERADA' }
  | { ok: false; reason: WordSearchExecutionViolation };

export function decideWordSearchExecution({
  encontradas,
  totalPalabras,
}: WordSearchExecutionProgress): WordSearchExecutionDecision {
  if (
    !Number.isInteger(totalPalabras) ||
    totalPalabras < MIN_WORDS ||
    totalPalabras > MAX_WORDS
  ) {
    return { ok: false, reason: 'INVALID_WORD_COUNT' };
  }
  if (
    !Number.isInteger(encontradas) ||
    encontradas < 0 ||
    encontradas > totalPalabras
  ) {
    return { ok: false, reason: 'INVALID_FOUND_COUNT' };
  }

  return {
    ok: true,
    resultadoEjecucion: encontradas === totalPalabras ? 'SUPERADA' : 'EN_CURSO',
  };
}
