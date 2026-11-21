import type { Coordinate } from './coordinate.js';
import type { EvaluationResult } from './evaluation-result.js';
import { normalizeWordText } from './word-normalization.js';
import type {
  WordSearchAnswer,
  WordSearchDefinition,
  WordSearchFeedback,
  WordSearchProgress,
  WordSearchRejectionReason,
} from './word-search-evaluation.types.js';

/**
 * Evaluates one word search selection (WordSearchAnswer -> WordSearchFeedback
 * in the OpenAPI contract). Words are placed horizontally or vertically
 * forwards and may be selected in both directions (info.description,
 * "Tableros automáticos con revisión"). The selected letters are compared with
 * each word through normalizeWordText. Impossible selections and words already
 * found are rejected without counting an error (submitGameAnswer).
 */
export function evaluateWordSearch(
  definition: WordSearchDefinition,
  answer: WordSearchAnswer,
  progress: WordSearchProgress,
): EvaluationResult<WordSearchFeedback, WordSearchRejectionReason> {
  const rows = definition.cuadricula.map((row) => Array.from(row));
  const letters = readSelection(rows, answer.inicio, answer.fin);
  if (letters === null) {
    return { ok: false, reason: 'INVALID_SELECTION' };
  }

  const forward = letters.join('');
  const backward = [...letters].reverse().join('');
  const matches = definition.palabras.filter((word) => {
    const normalized = normalizeWordText(word.texto);
    return normalized === forward || normalized === backward;
  });
  const newMatch = matches.find(
    (word) => !progress.encontradasIds.includes(word.id),
  );

  if (newMatch === undefined && matches.length > 0) {
    return { ok: false, reason: 'WORD_ALREADY_FOUND' };
  }

  return {
    ok: true,
    feedback: {
      tipo: 'SOPA_LETRAS',
      correcta: newMatch !== undefined,
      palabraId: newMatch?.id ?? null,
    },
  };
}

/** Letters from `inicio` to `fin`, or null for a selection that cannot hold a word. */
function readSelection(
  rows: readonly string[][],
  inicio: Coordinate,
  fin: Coordinate,
): string[] | null {
  if (!isInside(rows, inicio) || !isInside(rows, fin)) {
    return null;
  }
  const sameRow = inicio.fila === fin.fila;
  const sameColumn = inicio.columna === fin.columna;
  if (sameRow === sameColumn) {
    // Diagonal, or a single cell: no word has fewer than two letters.
    return null;
  }

  const rowStep = Math.sign(fin.fila - inicio.fila);
  const columnStep = Math.sign(fin.columna - inicio.columna);
  const length =
    Math.max(
      Math.abs(fin.fila - inicio.fila),
      Math.abs(fin.columna - inicio.columna),
    ) + 1;

  const letters: string[] = [];
  for (let step = 0; step < length; step += 1) {
    const letter =
      rows[inicio.fila + step * rowStep]?.[inicio.columna + step * columnStep];
    if (letter === undefined) {
      return null;
    }
    letters.push(letter);
  }
  return letters;
}

function isInside(rows: readonly string[][], { fila, columna }: Coordinate) {
  return (
    Number.isInteger(fila) &&
    Number.isInteger(columna) &&
    fila >= 0 &&
    columna >= 0 &&
    fila < rows.length &&
    columna < (rows[fila]?.length ?? 0)
  );
}
