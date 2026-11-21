import {
  DEFAULT_MEMORY_ERRORS_PER_PAIR,
  decideMemoryExecution,
} from './memory-execution-outcome.js';

describe('decideMemoryExecution', () => {
  it('usa 2 errores por pareja por defecto', () => {
    expect(DEFAULT_MEMORY_ERRORS_PER_PAIR).toBe(2);
  });

  it('sigue en curso mientras faltan parejas y no se excede el límite', () => {
    expect(
      decideMemoryExecution({
        errores: 0,
        parejasResueltas: 1,
        totalParejas: 2,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'EN_CURSO' });
  });

  it('supera la ejecución al resolver todas las parejas', () => {
    expect(
      decideMemoryExecution({
        errores: 1,
        parejasResueltas: 2,
        totalParejas: 2,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
  });

  it('supera la ejecución con justo los errores permitidos (2 parejas x 2 = 4)', () => {
    expect(
      decideMemoryExecution({
        errores: 4,
        parejasResueltas: 2,
        totalParejas: 2,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
  });

  it('sigue en curso con justo los errores permitidos', () => {
    expect(
      decideMemoryExecution({
        errores: 4,
        parejasResueltas: 0,
        totalParejas: 2,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'EN_CURSO' });
  });

  it('falla la ejecución al exceder los errores permitidos', () => {
    expect(
      decideMemoryExecution({
        errores: 5,
        parejasResueltas: 1,
        totalParejas: 2,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'FALLIDA' });
  });

  it('calcula el límite con el criterio de la actividad', () => {
    expect(
      decideMemoryExecution(
        { errores: 4, parejasResueltas: 0, totalParejas: 3 },
        1,
      ),
    ).toEqual({ ok: true, resultadoEjecucion: 'FALLIDA' });
  });

  it.each([
    [{ errores: 0, parejasResueltas: 0, totalParejas: 1 }],
    [{ errores: 0, parejasResueltas: 0, totalParejas: 13 }],
    [{ errores: 0, parejasResueltas: 0, totalParejas: 2.5 }],
  ])('rechaza un total de parejas fuera de 2 a 12: %o', (progress) => {
    expect(decideMemoryExecution(progress)).toEqual({
      ok: false,
      reason: 'INVALID_PAIR_COUNT',
    });
  });

  it.each([
    [{ errores: 0, parejasResueltas: -1, totalParejas: 2 }],
    [{ errores: 0, parejasResueltas: 3, totalParejas: 2 }],
  ])('rechaza parejas resueltas imposibles: %o', (progress) => {
    expect(decideMemoryExecution(progress)).toEqual({
      ok: false,
      reason: 'INVALID_RESOLVED_COUNT',
    });
  });

  it('rechaza errores negativos', () => {
    expect(
      decideMemoryExecution({
        errores: -1,
        parejasResueltas: 0,
        totalParejas: 2,
      }),
    ).toEqual({ ok: false, reason: 'INVALID_ERROR_COUNT' });
  });

  it.each([0, 6, 1.5])(
    'rechaza errores por pareja fuera de 1 a 5: %d',
    (erroresPorPareja) => {
      expect(
        decideMemoryExecution(
          { errores: 0, parejasResueltas: 0, totalParejas: 2 },
          erroresPorPareja,
        ),
      ).toEqual({ ok: false, reason: 'INVALID_ERRORS_PER_PAIR' });
    },
  );
});
