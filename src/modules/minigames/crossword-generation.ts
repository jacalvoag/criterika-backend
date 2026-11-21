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
  shuffle,
  type BoardPosition,
  type PreparedWord,
} from './board-words.js';

/** Empty cell in BoardGeneration.cuadricula. */
const EMPTY_CELL = '#';
/** Candidate positions checked before the layout search gives up. */
const SEARCH_BUDGET = 200_000;

const NOT_GENERATABLE: BoardGenerationResult = {
  ok: false,
  reason: 'BOARD_NOT_GENERATABLE',
};

interface Cell {
  letter: string;
  orientations: Set<BoardOrientation>;
}

interface Placed extends BoardPosition {
  word: PreparedWord;
  order: number;
}

type Grid = (Cell | null)[][];

/**
 * Generates a CRUCIGRAMA board (BoardGeneration in the OpenAPI contract).
 * The crossword is connected: every word after the first crosses an already
 * placed one. Crossings are perpendicular and share the same letter. Words do
 * not touch other letters outside their crossings, and the cells before and
 * after each word stay empty, so every word reads at its BoardPlacement.
 * No layout found means BOARD_NOT_GENERATABLE (generateActivityBoard, 422).
 */
export function generateCrosswordBoard(
  words: readonly BoardWordInput[],
  tablero: BoardConfiguration,
  random: RandomSource,
): BoardGenerationResult {
  if (!isValidBoardSize(tablero)) {
    return { ok: false, reason: 'INVALID_BOARD_SIZE' };
  }
  const prepared = prepareBoardWords(words, 2);
  if (prepared === null) {
    return NOT_GENERATABLE;
  }
  const placed = placeWords(prepared, tablero, random);
  if (placed === null) {
    return NOT_GENERATABLE;
  }

  const rows = Array.from({ length: tablero.filas }, () =>
    Array.from({ length: tablero.columnas }, () => EMPTY_CELL),
  );
  for (const { word, inicio, orientacion } of placed) {
    placementCells(inicio, orientacion, word.letters.length).forEach(
      ({ fila, columna }, step) => {
        rows[fila][columna] = word.letters[step];
      },
    );
  }

  return {
    ok: true,
    board: {
      tipo: 'CRUCIGRAMA',
      filas: tablero.filas,
      columnas: tablero.columnas,
      cuadricula: rows.map((row) => row.join('')),
      ubicaciones: [...placed]
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

/** Randomized backtracking: null when no layout exists or the budget ends. */
function placeWords(
  words: readonly PreparedWord[],
  size: BoardConfiguration,
  random: RandomSource,
): Placed[] | null {
  const grid: Grid = Array.from({ length: size.filas }, () =>
    Array.from<Cell | null>({ length: size.columnas }).fill(null),
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
      if (!fits(grid, word, candidate, index === 0)) {
        continue;
      }
      const cells = placementCells(
        candidate.inicio,
        candidate.orientacion,
        word.letters.length,
      );
      const written = cells.filter(
        ({ fila, columna }) => grid[fila][columna] === null,
      );
      cells.forEach(({ fila, columna }, step) => {
        const cell = grid[fila][columna] ?? {
          letter: word.letters[step],
          orientations: new Set<BoardOrientation>(),
        };
        cell.orientations.add(candidate.orientacion);
        grid[fila][columna] = cell;
      });
      placed.push({ word, order: orderOf.get(word) ?? index, ...candidate });
      if (place(index + 1)) {
        return true;
      }
      placed.pop();
      for (const { fila, columna } of cells) {
        grid[fila][columna]?.orientations.delete(candidate.orientacion);
      }
      for (const { fila, columna } of written) {
        grid[fila][columna] = null;
      }
    }
    return false;
  };

  return place(0) ? placed : null;
}

/**
 * A candidate fits when the cells before and after it are empty, every
 * crossing is perpendicular with the same letter, its new cells have no
 * letters beside them, and (except the first word) it crosses at least once.
 */
function fits(
  grid: Grid,
  word: PreparedWord,
  { inicio, orientacion }: BoardPosition,
  isFirst: boolean,
): boolean {
  const step =
    orientacion === 'HORIZONTAL'
      ? { fila: 0, columna: 1 }
      : { fila: 1, columna: 0 };
  const side = { fila: step.columna, columna: step.fila };
  const cells = placementCells(inicio, orientacion, word.letters.length);
  const last = cells[cells.length - 1];

  const before = {
    fila: inicio.fila - step.fila,
    columna: inicio.columna - step.columna,
  };
  const after = {
    fila: last.fila + step.fila,
    columna: last.columna + step.columna,
  };
  if (cellAt(grid, before) !== null || cellAt(grid, after) !== null) {
    return false;
  }

  let crossings = 0;
  for (const [position, cell] of cells.entries()) {
    const current = cellAt(grid, cell);
    if (current !== null) {
      if (
        current.letter !== word.letters[position] ||
        current.orientations.has(orientacion)
      ) {
        return false;
      }
      crossings += 1;
      continue;
    }
    const neighbours = [
      { fila: cell.fila + side.fila, columna: cell.columna + side.columna },
      { fila: cell.fila - side.fila, columna: cell.columna - side.columna },
    ];
    if (neighbours.some((neighbour) => cellAt(grid, neighbour) !== null)) {
      return false;
    }
  }
  return isFirst || crossings > 0;
}

/** The cell at a coordinate, or null when it is empty or outside the board. */
function cellAt(grid: Grid, { fila, columna }: Coordinate): Cell | null {
  return grid[fila]?.[columna] ?? null;
}
