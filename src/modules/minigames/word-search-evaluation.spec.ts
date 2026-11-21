import { evaluateWordSearch } from './word-search-evaluation.js';
import {
  WORD_SEARCH_REJECTION_REASONS,
  type Coordinate,
  type WordSearchDefinition,
  type WordSearchProgress,
} from './word-search-evaluation.types.js';

const ETICA_ID = '00000000-0000-4000-8000-000000000040';
const NORMA_ID = '00000000-0000-4000-8000-000000000041';
const NINO_ID = '00000000-0000-4000-8000-000000000042';

// ETICA horizontal in row 0, NORMA vertical in column 5, NIÑO horizontal in row 4.
const definition: WordSearchDefinition = {
  cuadricula: ['ETICAN', 'XXXXXO', 'XXXXXR', 'XXXXXM', 'NIÑOXA', 'NINOXX'],
  palabras: [
    { id: ETICA_ID, texto: 'Ética' },
    { id: NORMA_ID, texto: 'norma' },
    { id: NINO_ID, texto: 'niño' },
  ],
};

const noProgress: WordSearchProgress = { encontradasIds: [] };

function select(inicio: Coordinate, fin: Coordinate) {
  return { tipo: 'SOPA_LETRAS' as const, inicio, fin };
}

describe('evaluateWordSearch', () => {
  it('define los motivos de rechazo de una selección imposible', () => {
    expect(WORD_SEARCH_REJECTION_REASONS).toEqual([
      'INVALID_SELECTION',
      'WORD_ALREADY_FOUND',
    ]);
  });

  it('encuentra una palabra horizontal comparando con normalizeWordText', () => {
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 0, columna: 0 }, { fila: 0, columna: 4 }),
        noProgress,
      ),
    ).toEqual({
      ok: true,
      feedback: { tipo: 'SOPA_LETRAS', correcta: true, palabraId: ETICA_ID },
    });
  });

  it('encuentra una palabra vertical', () => {
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 0, columna: 5 }, { fila: 4, columna: 5 }),
        noProgress,
      ),
    ).toMatchObject({ ok: true, feedback: { palabraId: NORMA_ID } });
  });

  it('acepta la selección en sentido inverso', () => {
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 0, columna: 4 }, { fila: 0, columna: 0 }),
        noProgress,
      ),
    ).toMatchObject({ ok: true, feedback: { palabraId: ETICA_ID } });
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 4, columna: 5 }, { fila: 0, columna: 5 }),
        noProgress,
      ),
    ).toMatchObject({ ok: true, feedback: { palabraId: NORMA_ID } });
  });

  it('distingue Ñ de N', () => {
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 4, columna: 0 }, { fila: 4, columna: 3 }),
        noProgress,
      ),
    ).toMatchObject({ ok: true, feedback: { palabraId: NINO_ID } });
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 5, columna: 0 }, { fila: 5, columna: 3 }),
        noProgress,
      ),
    ).toEqual({
      ok: true,
      feedback: { tipo: 'SOPA_LETRAS', correcta: false, palabraId: null },
    });
  });

  it('marca incorrecta una selección válida que no forma ninguna palabra', () => {
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 1, columna: 0 }, { fila: 1, columna: 3 }),
        noProgress,
      ),
    ).toEqual({
      ok: true,
      feedback: { tipo: 'SOPA_LETRAS', correcta: false, palabraId: null },
    });
  });

  it('marca incorrecta una selección que solo contiene parte de una palabra', () => {
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 0, columna: 0 }, { fila: 0, columna: 3 }),
        noProgress,
      ),
    ).toMatchObject({ ok: true, feedback: { correcta: false } });
  });

  it('rechaza sin contar error una palabra ya encontrada', () => {
    expect(
      evaluateWordSearch(
        definition,
        select({ fila: 0, columna: 0 }, { fila: 0, columna: 4 }),
        { encontradasIds: [ETICA_ID] },
      ),
    ).toEqual({ ok: false, reason: 'WORD_ALREADY_FOUND' });
  });

  it.each([
    ['diagonal', { fila: 0, columna: 0 }, { fila: 2, columna: 2 }],
    ['una sola casilla', { fila: 0, columna: 0 }, { fila: 0, columna: 0 }],
    ['fuera del tablero', { fila: 0, columna: 0 }, { fila: 0, columna: 6 }],
    ['fila negativa', { fila: -1, columna: 0 }, { fila: 1, columna: 0 }],
    [
      'coordenada no entera',
      { fila: 0, columna: 0.5 },
      { fila: 0, columna: 4 },
    ],
  ])('rechaza una selección imposible: %s', (_caso, inicio, fin) => {
    expect(
      evaluateWordSearch(definition, select(inicio, fin), noProgress),
    ).toEqual({ ok: false, reason: 'INVALID_SELECTION' });
  });
});
