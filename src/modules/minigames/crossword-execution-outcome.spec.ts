import {
  DEFAULT_CROSSWORD_INCORRECT_CHECKS,
  decideCrosswordExecution,
} from './crossword-execution-outcome.js';

describe('decideCrosswordExecution', () => {
  it('usa 3 comprobaciones incorrectas permitidas por defecto', () => {
    expect(DEFAULT_CROSSWORD_INCORRECT_CHECKS).toBe(3);
  });

  it('supera la ejecución con una comprobación correcta a la primera', () => {
    expect(
      decideCrosswordExecution({
        comprobacionesIncorrectas: 0,
        ultimaComprobacionCorrecta: true,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
  });

  it('sigue en curso tras una comprobación incorrecta dentro del límite', () => {
    expect(
      decideCrosswordExecution({
        comprobacionesIncorrectas: 1,
        ultimaComprobacionCorrecta: false,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'EN_CURSO' });
  });

  it('sigue en curso con justo las comprobaciones incorrectas permitidas', () => {
    expect(
      decideCrosswordExecution({
        comprobacionesIncorrectas: 3,
        ultimaComprobacionCorrecta: false,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'EN_CURSO' });
  });

  it('aprueba la cuarta comprobación correcta si aún no había cuatro incorrectas', () => {
    expect(
      decideCrosswordExecution({
        comprobacionesIncorrectas: 3,
        ultimaComprobacionCorrecta: true,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
  });

  it('falla la ejecución en la cuarta comprobación incorrecta', () => {
    expect(
      decideCrosswordExecution({
        comprobacionesIncorrectas: 4,
        ultimaComprobacionCorrecta: false,
      }),
    ).toEqual({ ok: true, resultadoEjecucion: 'FALLIDA' });
  });

  it('calcula el límite con el criterio de la actividad', () => {
    expect(
      decideCrosswordExecution(
        { comprobacionesIncorrectas: 2, ultimaComprobacionCorrecta: false },
        1,
      ),
    ).toEqual({ ok: true, resultadoEjecucion: 'FALLIDA' });
  });

  it.each([0, 11, 2.5])(
    'rechaza comprobaciones permitidas fuera de 1 a 10: %d',
    (permitidas) => {
      expect(
        decideCrosswordExecution(
          { comprobacionesIncorrectas: 0, ultimaComprobacionCorrecta: false },
          permitidas,
        ),
      ).toEqual({ ok: false, reason: 'INVALID_ALLOWED_CHECKS' });
    },
  );

  it.each([-1, 5, 1.5])(
    'rechaza comprobaciones incorrectas imposibles con el límite por defecto: %d',
    (comprobacionesIncorrectas) => {
      expect(
        decideCrosswordExecution({
          comprobacionesIncorrectas,
          ultimaComprobacionCorrecta: false,
        }),
      ).toEqual({ ok: false, reason: 'INVALID_INCORRECT_CHECK_COUNT' });
    },
  );
});
