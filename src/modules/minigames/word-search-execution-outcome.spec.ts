import { decideWordSearchExecution } from './word-search-execution-outcome.js';

describe('decideWordSearchExecution', () => {
  it('sigue en curso mientras faltan palabras', () => {
    expect(
      decideWordSearchExecution({ encontradas: 2, totalPalabras: 3 }),
    ).toEqual({ ok: true, resultadoEjecucion: 'EN_CURSO' });
  });

  it('supera la ejecución al encontrar todas las palabras', () => {
    expect(
      decideWordSearchExecution({ encontradas: 3, totalPalabras: 3 }),
    ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
  });

  it('supera con una sola palabra encontrada si es la única', () => {
    expect(
      decideWordSearchExecution({ encontradas: 1, totalPalabras: 1 }),
    ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
  });

  it.each([0, 21, 2.5])(
    'rechaza un total de palabras fuera de 1 a 20: %d',
    (totalPalabras) => {
      expect(
        decideWordSearchExecution({ encontradas: 0, totalPalabras }),
      ).toEqual({ ok: false, reason: 'INVALID_WORD_COUNT' });
    },
  );

  it.each([-1, 4, 1.5])(
    'rechaza palabras encontradas imposibles: %d',
    (encontradas) => {
      expect(
        decideWordSearchExecution({ encontradas, totalPalabras: 3 }),
      ).toEqual({ ok: false, reason: 'INVALID_FOUND_COUNT' });
    },
  );
});
