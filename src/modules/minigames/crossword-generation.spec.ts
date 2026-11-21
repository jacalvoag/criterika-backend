import type { Coordinate } from './coordinate.js';
import type {
  BoardPlacement,
  BoardWordInput,
  GeneratedBoard,
  RandomSource,
} from './board-generation.types.js';
import { generateCrosswordBoard } from './crossword-generation.js';
import { normalizeWordText } from './word-normalization.js';

/** Deterministic generator (mulberry32) so every board is reproducible. */
function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function word(id: string, palabra: string): BoardWordInput {
  return { id, palabra };
}

const WORDS: BoardWordInput[] = [
  word('11111111-1111-4111-8111-111111111111', 'Derecho'),
  word('22222222-2222-4222-8222-222222222222', 'Petición'),
  word('33333333-3333-4333-8333-333333333333', 'Amparo'),
  word('44444444-4444-4444-8444-444444444444', 'Ley'),
  word('55555555-5555-4555-8555-555555555555', 'Señor'),
];

function cellsOf(placement: BoardPlacement): Coordinate[] {
  return Array.from(placement.textoNormalizado).map((_, step) =>
    placement.orientacion === 'HORIZONTAL'
      ? {
          fila: placement.inicio.fila,
          columna: placement.inicio.columna + step,
        }
      : {
          fila: placement.inicio.fila + step,
          columna: placement.inicio.columna,
        },
  );
}

function key({ fila, columna }: Coordinate): string {
  return `${fila},${columna}`;
}

function letterAt(board: GeneratedBoard, { fila, columna }: Coordinate) {
  return Array.from(board.cuadricula[fila] ?? '')[columna];
}

function isConnected(placements: readonly BoardPlacement[]): boolean {
  const cellSets = placements.map(
    (placement) => new Set(cellsOf(placement).map(key)),
  );
  const reached = new Set([0]);
  const pending = [0];
  while (pending.length > 0) {
    const current = pending.pop() ?? 0;
    cellSets.forEach((cells, index) => {
      const touches = [...cells].some((cell) => cellSets[current].has(cell));
      if (!reached.has(index) && touches) {
        reached.add(index);
        pending.push(index);
      }
    });
  }
  return reached.size === placements.length;
}

function expectSolvableCrossword(
  board: GeneratedBoard,
  words: readonly BoardWordInput[],
): void {
  expect(board.tipo).toBe('CRUCIGRAMA');
  expect(board.cuadricula).toHaveLength(board.filas);
  for (const row of board.cuadricula) {
    expect(row).toMatch(/^[A-ZÑ#]+$/);
    expect(Array.from(row)).toHaveLength(board.columnas);
  }
  expect(board.ubicaciones).toHaveLength(words.length);

  // Words read at their positions, and crossings never disagree.
  const expected = new Map<string, string>();
  const orientationsByCell = new Map<string, string[]>();
  words.forEach((input, index) => {
    const placement = board.ubicaciones[index];
    const normalized = normalizeWordText(input.palabra);
    expect(placement.palabraId).toBe(input.id);
    expect(placement.textoNormalizado).toBe(normalized);
    const letters = Array.from(normalized);
    cellsOf(placement).forEach((cell, step) => {
      const previous = expected.get(key(cell));
      if (previous !== undefined) {
        expect(previous).toBe(letters[step]);
      }
      expected.set(key(cell), letters[step]);
      orientationsByCell.set(key(cell), [
        ...(orientationsByCell.get(key(cell)) ?? []),
        placement.orientacion,
      ]);
      expect(letterAt(board, cell)).toBe(letters[step]);
    });
  });

  // Crossings are perpendicular: one horizontal and one vertical word at most.
  for (const orientations of orientationsByCell.values()) {
    expect(new Set(orientations).size).toBe(orientations.length);
  }

  // No letter outside the placements.
  board.cuadricula.forEach((row, fila) => {
    Array.from(row).forEach((cell, columna) => {
      if (cell !== '#') {
        expect(expected.has(key({ fila, columna }))).toBe(true);
      }
    });
  });

  expect(isConnected(board.ubicaciones)).toBe(true);
}

function generate(
  words: readonly BoardWordInput[],
  filas: number,
  columnas: number,
  seed = 1,
) {
  return generateCrosswordBoard(words, { filas, columnas }, seeded(seed));
}

describe('generateCrosswordBoard', () => {
  it('genera un crucigrama conectado donde cada palabra se lee en su ubicación', () => {
    const result = generate(WORDS, 12, 12);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.board.filas).toBe(12);
      expect(result.board.columnas).toBe(12);
      expectSolvableCrossword(result.board, WORDS);
    }
  });

  it('mantiene las reglas del crucigrama con muchas semillas', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const result = generate(WORDS, 10, 11, seed);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expectSolvableCrossword(result.board, WORDS);
      }
    }
  });

  it('separa las palabras con casillas vacías y no deja letras pegadas fuera de los cruces', () => {
    const result = generate(WORDS, 12, 12, 3);

    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const placement of result.board.ubicaciones) {
        const cells = cellsOf(placement);
        const step =
          placement.orientacion === 'HORIZONTAL'
            ? { fila: 0, columna: 1 }
            : { fila: 1, columna: 0 };
        const before = {
          fila: cells[0].fila - step.fila,
          columna: cells[0].columna - step.columna,
        };
        const last = cells[cells.length - 1];
        const after = {
          fila: last.fila + step.fila,
          columna: last.columna + step.columna,
        };
        for (const outside of [before, after]) {
          expect(letterAt(result.board, outside) ?? '#').toBe('#');
        }
      }
    }
  });

  it('conserva la Ñ distinta de la N en textoNormalizado', () => {
    const result = generate(WORDS, 12, 12);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.board.ubicaciones[4].textoNormalizado).toBe('SEÑOR');
    }
  });

  it('es determinista con la misma fuente aleatoria', () => {
    expect(generate(WORDS, 12, 12, 9)).toEqual(generate(WORDS, 12, 12, 9));
  });

  it('no usa Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    generate(WORDS, 12, 12);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('genera el tablero mínimo de 2 por 2', () => {
    const words = [word(WORDS[0].id, 'ab'), word(WORDS[1].id, 'ac')];
    const result = generate(words, 2, 2);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expectSolvableCrossword(result.board, words);
    }
  });

  it('acepta dos palabras iguales tras normalizar en ubicaciones distintas', () => {
    const words = [word(WORDS[0].id, 'Sol'), word(WORDS[1].id, 'sol')];
    const result = generate(words, 5, 5);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expectSolvableCrossword(result.board, words);
    }
  });

  it('genera el máximo de 20 palabras en 20 por 20', () => {
    const words = [
      'Constitución',
      'Derecho',
      'Amparo',
      'Petición',
      'Ley',
      'Juez',
      'Tribunal',
      'Sentencia',
      'Demanda',
      'Recurso',
      'Garantía',
      'Libertad',
      'Igualdad',
      'Justicia',
      'Voto',
      'Ciudadano',
      'Estado',
      'Poder',
      'Decreto',
      'Norma',
    ].map((palabra, index) => word(`id-${index}`, palabra));
    const result = generate(words, 20, 20);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expectSolvableCrossword(result.board, words);
    }
  });

  it('rechaza palabras sin letras en común porque no puede conectarlas', () => {
    const words = [word(WORDS[0].id, 'Ley'), word(WORDS[1].id, 'Unión')];

    expect(generate(words, 10, 10)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
  });

  it('rechaza cuando las palabras no caben en la cuadrícula', () => {
    const words = [
      word(WORDS[0].id, 'AB'),
      word(WORDS[1].id, 'AC'),
      word(WORDS[2].id, 'BD'),
    ];

    expect(generate(words, 2, 2)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
  });

  it('rechaza una palabra más larga que las filas y las columnas', () => {
    const words = [word(WORDS[0].id, 'Derecho'), word(WORDS[1].id, 'Ley')];

    expect(generate(words, 5, 6)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
  });

  it.each([
    ['una sola letra', 'a.'],
    ['dígitos', 'Ley 8'],
    ['más de 20 letras', 'Inconstitucionalidades'],
  ])(
    'rechaza una palabra que tras normalizar no cumple el patrón: %s',
    (_caso, palabra) => {
      const words = [word(WORDS[0].id, palabra), word(WORDS[1].id, 'Ley')];

      expect(generate(words, 20, 20)).toEqual({
        ok: false,
        reason: 'BOARD_NOT_GENERATABLE',
      });
    },
  );

  it('rechaza menos de 2 y más de 20 palabras', () => {
    const many = Array.from({ length: 21 }, (_, index) =>
      word(`id-${index}`, 'Sol'),
    );

    expect(generate([word(WORDS[0].id, 'Sol')], 10, 10)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
    expect(generate(many, 20, 20)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
  });

  it.each([
    [1, 10],
    [10, 1],
    [21, 10],
    [10, 21],
    [2.5, 10],
  ])('rechaza el tamaño %s por %s', (filas, columnas) => {
    expect(generate(WORDS, filas, columnas)).toEqual({
      ok: false,
      reason: 'INVALID_BOARD_SIZE',
    });
  });
});
