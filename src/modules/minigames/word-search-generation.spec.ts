import type {
  BoardPlacement,
  BoardWordInput,
  GeneratedBoard,
  RandomSource,
} from './board-generation.types.js';
import { normalizeWordText } from './word-normalization.js';
import { generateWordSearchBoard } from './word-search-generation.js';

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
  word('11111111-1111-4111-8111-111111111111', 'Ley'),
  word('22222222-2222-4222-8222-222222222222', 'Derecho'),
  word('33333333-3333-4333-8333-333333333333', 'Petición'),
  word('44444444-4444-4444-8444-444444444444', 'Amparo'),
  word('55555555-5555-4555-8555-555555555555', 'Año'),
];

/** Every horizontal and vertical segment that reads `text` in either direction. */
function countOccurrences(grid: readonly string[], text: string): number {
  const rows = grid.map((row) => Array.from(row));
  const reversed = Array.from(text).reverse().join('');
  const length = Array.from(text).length;
  let count = 0;
  for (let fila = 0; fila < rows.length; fila += 1) {
    for (let columna = 0; columna < rows[fila].length; columna += 1) {
      const horizontal = rows[fila].slice(columna, columna + length).join('');
      const vertical = rows
        .slice(fila, fila + length)
        .map((row) => row[columna])
        .join('');
      for (const segment of [horizontal, vertical]) {
        if (
          Array.from(segment).length === length &&
          (segment === text || segment === reversed)
        ) {
          count += 1;
        }
      }
    }
  }
  return count;
}

function placementLetters(
  grid: readonly string[],
  placement: BoardPlacement,
): string {
  const rows = grid.map((row) => Array.from(row));
  const length = Array.from(placement.textoNormalizado).length;
  const letters: string[] = [];
  for (let step = 0; step < length; step += 1) {
    const fila =
      placement.inicio.fila + (placement.orientacion === 'VERTICAL' ? step : 0);
    const columna =
      placement.inicio.columna +
      (placement.orientacion === 'HORIZONTAL' ? step : 0);
    letters.push(rows[fila]?.[columna] ?? '');
  }
  return letters.join('');
}

function expectSolvableWordSearch(
  board: GeneratedBoard,
  words: readonly BoardWordInput[],
): void {
  expect(board.tipo).toBe('SOPA_LETRAS');
  expect(board.cuadricula).toHaveLength(board.filas);
  for (const row of board.cuadricula) {
    expect(row).toMatch(/^[A-ZÑ]+$/);
    expect(Array.from(row)).toHaveLength(board.columnas);
  }
  expect(board.ubicaciones).toHaveLength(words.length);
  for (const input of words) {
    const placement = board.ubicaciones.find(
      (candidate) => candidate.palabraId === input.id,
    );
    const normalized = normalizeWordText(input.palabra);
    expect(placement?.textoNormalizado).toBe(normalized);
    if (placement !== undefined) {
      expect(placementLetters(board.cuadricula, placement)).toBe(normalized);
    }
    expect(countOccurrences(board.cuadricula, normalized)).toBe(1);
  }
}

function generate(
  words: readonly BoardWordInput[],
  filas: number,
  columnas: number,
  seed = 1,
) {
  return generateWordSearchBoard(words, { filas, columnas }, seeded(seed));
}

describe('generateWordSearchBoard', () => {
  it('genera una sopa donde cada palabra aparece exactamente una vez en su ubicación', () => {
    const result = generate(WORDS, 10, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.board.filas).toBe(10);
      expect(result.board.columnas).toBe(10);
      expectSolvableWordSearch(result.board, WORDS);
    }
  });

  it('mantiene la regla de una sola aparición con muchas semillas', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const result = generate(WORDS, 9, 8, seed);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expectSolvableWordSearch(result.board, WORDS);
      }
    }
  });

  it('conserva la Ñ distinta de la N en textoNormalizado', () => {
    const result = generate(WORDS, 10, 10);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const year = result.board.ubicaciones.find(
        (placement) => placement.palabraId === WORDS[4].id,
      );
      expect(year?.textoNormalizado).toBe('AÑO');
    }
  });

  it('es determinista con la misma fuente aleatoria', () => {
    expect(generate(WORDS, 10, 10, 7)).toEqual(generate(WORDS, 10, 10, 7));
  });

  it('no usa Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    generate(WORDS, 10, 10);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('genera el tablero mínimo de 2 por 2', () => {
    const words = [word(WORDS[0].id, 'ab')];
    const result = generate(words, 2, 2);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expectSolvableWordSearch(result.board, words);
    }
  });

  it('llena por completo un tablero cuando las palabras ocupan todas las casillas', () => {
    const words = [word(WORDS[0].id, 'AB'), word(WORDS[1].id, 'CD')];
    const result = generate(words, 2, 2);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expectSolvableWordSearch(result.board, words);
    }
  });

  it('rechaza cuando las palabras no caben en la cuadrícula', () => {
    const words = [
      word(WORDS[0].id, 'AB'),
      word(WORDS[1].id, 'CD'),
      word(WORDS[2].id, 'EF'),
    ];

    expect(generate(words, 2, 2)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
  });

  it('rechaza una palabra más larga que las filas y las columnas', () => {
    expect(generate([word(WORDS[0].id, 'Derecho')], 5, 6)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
  });

  it.each([
    ['una sola letra', 'a.'],
    ['dígitos', 'Ley 8'],
    ['más de 20 letras', 'Inconstitucionalidades'],
    ['solo puntuación', '¿?'],
  ])(
    'rechaza una palabra que tras normalizar no cumple el patrón: %s',
    (_caso, palabra) => {
      expect(generate([word(WORDS[0].id, palabra)], 20, 20)).toEqual({
        ok: false,
        reason: 'BOARD_NOT_GENERATABLE',
      });
    },
  );

  it('rechaza dos palabras iguales tras normalizar', () => {
    const words = [
      word(WORDS[0].id, 'Petición'),
      word(WORDS[1].id, 'peticion'),
    ];

    expect(generate(words, 10, 10)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
  });

  it('rechaza una palabra que es la otra leída al revés', () => {
    const words = [word(WORDS[0].id, 'Roma'), word(WORDS[1].id, 'Amor')];

    expect(generate(words, 10, 10)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
  });

  it.each([
    ['hacia adelante', 'Sol'],
    ['al revés', 'Los'],
  ])('rechaza una palabra contenida en otra %s', (_caso, palabra) => {
    const words = [word(WORDS[0].id, palabra), word(WORDS[1].id, 'Solar')];

    expect(generate(words, 10, 10)).toEqual({
      ok: false,
      reason: 'BOARD_NOT_GENERATABLE',
    });
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
      expectSolvableWordSearch(result.board, words);
    }
  });

  it('rechaza una lista vacía y más de 20 palabras', () => {
    const many = Array.from({ length: 21 }, (_, index) =>
      word(`id-${index}`, String.fromCharCode(65 + index).repeat(2)),
    );

    expect(generate([], 10, 10)).toEqual({
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
