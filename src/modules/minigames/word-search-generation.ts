import type {
  BoardConfiguration,
  BoardGenerationResult,
  BoardOrientation,
  BoardWordInput,
  Coordinate,
  RandomSource,
} from './board-generation.types.js';
import {
  boardPositions,
  isValidBoardSize,
  longestFirst,
  placementCells,
  prepareBoardWords,
  randomIndex,
  shuffle,
  type PreparedWord,
} from './board-words.js';

const FILL_LETTERS = Array.from('ABCDEFGHIJKLMNÑOPQRSTUVWXYZ');
/** Fresh layouts tried when the filler cannot keep every word unique. */
const MAX_LAYOUTS = 20;
/** Filler cells re-drawn per layout before giving it up. */
const MAX_FILL_REPAIRS = 200;
/** Candidate positions checked before the layout search gives up. */
const SEARCH_BUDGET = 100_000;

const NOT_GENERATABLE: BoardGenerationResult = {
  ok: false,
  reason: 'BOARD_NOT_GENERATABLE',
};

interface Placed {
  word: PreparedWord;
  order: number;
  inicio: Coordinate;
  orientacion: BoardOrientation;
}

interface Layout {
  grid: (string | null)[][];
  placed: Placed[];
}

/**
 * Generates a SOPA_LETRAS board (BoardGeneration in the OpenAPI contract).
 * Words go horizontally or vertically forwards and are selected in both
 * directions (info.description, "Tableros automáticos con revisión").
 *
 * Every normalized word appears exactly once in the final grid, counting both
 * directions and the letters added as filler, because the word search
 * evaluator matches selections by their letters. Words that are equal,
 * reversed or contained in another one can never satisfy that, so they are
 * rejected with BOARD_NOT_GENERATABLE, like any layout that is not found.
 */
export function generateWordSearchBoard(
  words: readonly BoardWordInput[],
  tablero: BoardConfiguration,
  random: RandomSource,
): BoardGenerationResult {
  if (!isValidBoardSize(tablero)) {
    return { ok: false, reason: 'INVALID_BOARD_SIZE' };
  }
  const prepared = prepareBoardWords(words, 1);
  if (prepared === null || hasEmbeddedWord(prepared)) {
    return NOT_GENERATABLE;
  }

  for (let attempt = 0; attempt < MAX_LAYOUTS; attempt += 1) {
    const layout = placeWords(prepared, tablero, random);
    if (layout === null) {
      return NOT_GENERATABLE;
    }
    const grid = fillWithUniqueWords(layout, random);
    if (grid !== null) {
      return {
        ok: true,
        board: {
          tipo: 'SOPA_LETRAS',
          filas: tablero.filas,
          columnas: tablero.columnas,
          cuadricula: grid.map((row) => row.join('')),
          ubicaciones: [...layout.placed]
            .sort((left, right) => left.order - right.order)
            .map(({ word, inicio, orientacion }) => ({
              palabraId: word.id,
              textoNormalizado: word.text,
              inicio,
              orientacion,
            })),
        },
      };
    }
  }
  return NOT_GENERATABLE;
}

/** True when a word equals, or is contained in, another word or its reverse. */
function hasEmbeddedWord(words: readonly PreparedWord[]): boolean {
  return words.some((inner, innerIndex) => {
    const reversed = [...inner.letters].reverse().join('');
    return words.some(
      (outer, outerIndex) =>
        innerIndex !== outerIndex &&
        (outer.text.includes(inner.text) || outer.text.includes(reversed)),
    );
  });
}

/** Randomized backtracking: null when no layout exists or the budget ends. */
function placeWords(
  words: readonly PreparedWord[],
  size: BoardConfiguration,
  random: RandomSource,
): Layout | null {
  const grid: (string | null)[][] = Array.from({ length: size.filas }, () =>
    Array.from<string | null>({ length: size.columnas }).fill(null),
  );
  const orderOf = new Map(words.map((word, index) => [word, index]));
  const sorted = longestFirst(words, random);
  const placed: Placed[] = [];
  let budget = SEARCH_BUDGET;

  const place = (index: number): boolean => {
    if (index === sorted.length) {
      return true;
    }
    const word = sorted[index];
    const positions = boardPositions(word.letters.length, size);
    for (const candidate of shuffle(positions, random)) {
      budget -= 1;
      if (budget < 0) {
        return false;
      }
      const cells = placementCells(
        candidate.inicio,
        candidate.orientacion,
        word.letters.length,
      );
      const fits = cells.every(({ fila, columna }, step) => {
        const current = grid[fila][columna];
        return current === null || current === word.letters[step];
      });
      if (!fits) {
        continue;
      }
      const written = cells.filter(
        ({ fila, columna }) => grid[fila][columna] === null,
      );
      cells.forEach(({ fila, columna }, step) => {
        grid[fila][columna] = word.letters[step];
      });
      placed.push({ word, order: orderOf.get(word) ?? index, ...candidate });
      if (place(index + 1)) {
        return true;
      }
      placed.pop();
      for (const { fila, columna } of written) {
        grid[fila][columna] = null;
      }
    }
    return false;
  };

  return place(0) ? { grid, placed } : null;
}

/**
 * Fills the free cells and re-draws filler letters that form an extra copy of
 * a word. Null when an extra copy has no filler cell to change, or the
 * repairs run out: the caller then tries another layout.
 */
function fillWithUniqueWords(
  layout: Layout,
  random: RandomSource,
): string[][] | null {
  const free = layout.grid.map((row) => row.map((cell) => cell === null));
  const grid = layout.grid.map((row) =>
    row.map((cell) => cell ?? randomLetter(random)),
  );

  for (let repair = 0; repair <= MAX_FILL_REPAIRS; repair += 1) {
    const extras = extraOccurrences(grid, layout.placed);
    if (extras.length === 0) {
      return grid;
    }
    for (const cells of extras) {
      const changeable = cells.filter(
        ({ fila, columna }) => free[fila][columna],
      );
      if (changeable.length === 0) {
        return null;
      }
      const { fila, columna } =
        changeable[randomIndex(random, changeable.length)];
      grid[fila][columna] = randomLetter(random);
    }
  }
  return null;
}

/** Cells of every segment that reads a word in either direction outside its placement. */
function extraOccurrences(
  grid: readonly string[][],
  placed: readonly Placed[],
): Coordinate[][] {
  const size = { filas: grid.length, columnas: grid[0]?.length ?? 0 };
  const extras: Coordinate[][] = [];
  for (const { word, inicio, orientacion: own } of placed) {
    const length = word.letters.length;
    const reversed = [...word.letters].reverse().join('');
    for (const position of boardPositions(length, size)) {
      const isOwn =
        position.orientacion === own &&
        position.inicio.fila === inicio.fila &&
        position.inicio.columna === inicio.columna;
      if (isOwn) {
        continue;
      }
      const cells = placementCells(
        position.inicio,
        position.orientacion,
        length,
      );
      const text = cells.map((cell) => grid[cell.fila][cell.columna]).join('');
      if (text === word.text || text === reversed) {
        extras.push(cells);
      }
    }
  }
  return extras;
}

function randomLetter(random: RandomSource): string {
  return FILL_LETTERS[randomIndex(random, FILL_LETTERS.length)];
}
