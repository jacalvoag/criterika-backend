import type { Coordinate } from './coordinate.js';
import type {
  BoardConfiguration,
  BoardOrientation,
  BoardWordInput,
  RandomSource,
} from './board-generation.types.js';
import { normalizeWordText } from './word-normalization.js';

/** BoardPlacement.textoNormalizado pattern in the OpenAPI contract. */
const BOARD_WORD_PATTERN = /^[A-ZÑ]{2,20}$/;
/** BoardConfiguration.filas and columnas bounds. */
const MIN_SIDE = 2;
const MAX_SIDE = 20;
/** BoardGeneration.ubicaciones maxItems. */
const MAX_WORDS = 20;

export const ORIENTATIONS: readonly BoardOrientation[] = [
  'HORIZONTAL',
  'VERTICAL',
];

/** A word ready to place: its normalized text split into letters. */
export interface PreparedWord {
  id: string;
  text: string;
  letters: string[];
}

export function isValidBoardSize({
  filas,
  columnas,
}: BoardConfiguration): boolean {
  return [filas, columnas].every(
    (side) => Number.isInteger(side) && side >= MIN_SIDE && side <= MAX_SIDE,
  );
}

/**
 * Normalizes every word with normalizeWordText. Returns null when the list
 * size is outside `minWords` to 20 or a word does not match the
 * textoNormalizado pattern: either case makes the board impossible.
 */
export function prepareBoardWords(
  words: readonly BoardWordInput[],
  minWords: number,
): PreparedWord[] | null {
  if (words.length < minWords || words.length > MAX_WORDS) {
    return null;
  }
  const prepared: PreparedWord[] = [];
  for (const word of words) {
    const text = normalizeWordText(word.palabra);
    if (!BOARD_WORD_PATTERN.test(text)) {
      return null;
    }
    prepared.push({ id: word.id, text, letters: Array.from(text) });
  }
  return prepared;
}

export function placementCells(
  inicio: Coordinate,
  orientacion: BoardOrientation,
  length: number,
): Coordinate[] {
  return Array.from({ length }, (_, step) =>
    orientacion === 'HORIZONTAL'
      ? { fila: inicio.fila, columna: inicio.columna + step }
      : { fila: inicio.fila + step, columna: inicio.columna },
  );
}

/** A start cell and orientation for one word. */
export interface BoardPosition {
  inicio: Coordinate;
  orientacion: BoardOrientation;
}

/** Every position where a word of `length` letters fits, in both orientations. */
export function boardPositions(
  length: number,
  { filas, columnas }: BoardConfiguration,
): BoardPosition[] {
  const positions: BoardPosition[] = [];
  for (const orientacion of ORIENTATIONS) {
    const lastRow = orientacion === 'VERTICAL' ? filas - length : filas - 1;
    const lastColumn =
      orientacion === 'HORIZONTAL' ? columnas - length : columnas - 1;
    for (let fila = 0; fila <= lastRow; fila += 1) {
      for (let columna = 0; columna <= lastColumn; columna += 1) {
        positions.push({ inicio: { fila, columna }, orientacion });
      }
    }
  }
  return positions;
}

export function randomIndex(random: RandomSource, length: number): number {
  return Math.min(Math.floor(random() * length), length - 1);
}

/** Fisher-Yates over a copy, driven by the injected random source. */
export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = randomIndex(random, index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** Longest words first; ties keep the shuffled order. */
export function longestFirst(
  words: readonly PreparedWord[],
  random: RandomSource,
): PreparedWord[] {
  return shuffle(words, random).sort(
    (left, right) => right.letters.length - left.letters.length,
  );
}
