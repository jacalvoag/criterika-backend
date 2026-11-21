import {
  DEFAULT_MATCH_ALLOWED_ERRORS,
  decideMatchExecution,
} from './match-execution-outcome.js';

describe('decideMatchExecution', () => {
  it('usa 3 errores permitidos por defecto', () => {
    expect(DEFAULT_MATCH_ALLOWED_ERRORS).toBe(3);
  });

  it('sigue en curso mientras faltan asociaciones', () => {
    expect(
      decideMatchExecution({
        errores: 0,
        asociacionesResueltas: 1,
        totalParejas: 3,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'EN_CURSO' });
  });

  it('supera la ejecución al resolver todas las asociaciones', () => {
    expect(
      decideMatchExecution({
        errores: 2,
        asociacionesResueltas: 3,
        totalParejas: 3,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
  });

  it('supera la ejecución con justo los errores permitidos', () => {
    expect(
      decideMatchExecution({
        errores: 3,
        asociacionesResueltas: 3,
        totalParejas: 3,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
  });

  it('falla la ejecución al exceder los errores permitidos', () => {
    expect(
      decideMatchExecution({
        errores: 4,
        asociacionesResueltas: 1,
        totalParejas: 3,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'FALLIDA' });
  });

  it('calcula el límite con el criterio de la actividad', () => {
    expect(
      decideMatchExecution(
        { errores: 2, asociacionesResueltas: 0, totalParejas: 3 },
        1,
      ),
    ).toEqual({ ok: true, resultadoEjecucion: 'FALLIDA' });
  });

  it.each([1, 13, 2.5])(
    'rechaza un total de parejas fuera de 2 a 12: %d',
    (totalParejas) => {
      expect(
        decideMatchExecution({
          errores: 0,
          asociacionesResueltas: 0,
          totalParejas,
        }),
      ).toEqual({ ok: false, reason: 'INVALID_PAIR_COUNT' });
    },
  );

  it.each([-1, 4])(
    'rechaza asociaciones resueltas imposibles: %d',
    (asociacionesResueltas) => {
      expect(
        decideMatchExecution({
          errores: 0,
          asociacionesResueltas,
          totalParejas: 3,
        }),
      ).toEqual({ ok: false, reason: 'INVALID_RESOLVED_COUNT' });
    },
  );

  it('rechaza errores negativos', () => {
    expect(
      decideMatchExecution({
        errores: -1,
        asociacionesResueltas: 0,
        totalParejas: 3,
      }),
    ).toEqual({ ok: false, reason: 'INVALID_ERROR_COUNT' });
  });

  it.each([0, 21, 1.5])(
    'rechaza errores permitidos fuera de 1 a 20: %d',
    (erroresPermitidos) => {
      expect(
        decideMatchExecution(
          { errores: 0, asociacionesResueltas: 0, totalParejas: 3 },
          erroresPermitidos,
        ),
      ).toEqual({ ok: false, reason: 'INVALID_ALLOWED_ERRORS' });
    },
  );
});
