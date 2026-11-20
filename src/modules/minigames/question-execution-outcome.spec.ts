import {
  DEFAULT_QUESTION_PASS_PERCENTAGE,
  decideQuestionExecution,
} from './question-execution-outcome.js';

describe('decideQuestionExecution', () => {
  it('usa 80 como porcentaje mínimo por defecto', () => {
    expect(DEFAULT_QUESTION_PASS_PERCENTAGE).toBe(80);
  });

  it('supera la ejecución justo en el porcentaje mínimo por defecto', () => {
    expect(decideQuestionExecution({ aciertos: 4, totalPreguntas: 5 })).toEqual(
      { valid: true, resultadoEjecucion: 'SUPERADA' },
    );
  });

  it('falla la ejecución por debajo del porcentaje mínimo por defecto', () => {
    expect(decideQuestionExecution({ aciertos: 3, totalPreguntas: 5 })).toEqual(
      { valid: true, resultadoEjecucion: 'FALLIDA' },
    );
  });

  it('supera la ejecución con todos los aciertos', () => {
    expect(decideQuestionExecution({ aciertos: 5, totalPreguntas: 5 })).toEqual(
      { valid: true, resultadoEjecucion: 'SUPERADA' },
    );
  });

  it('falla la ejecución sin aciertos', () => {
    expect(decideQuestionExecution({ aciertos: 0, totalPreguntas: 5 })).toEqual(
      { valid: true, resultadoEjecucion: 'FALLIDA' },
    );
  });

  it('no redondea a favor del jugador cuando el mínimo no es exacto', () => {
    expect(
      decideQuestionExecution({ aciertos: 2, totalPreguntas: 3 }, 67),
    ).toEqual({ valid: true, resultadoEjecucion: 'FALLIDA' });
  });

  it('aplica el porcentaje mínimo fijado en el criterio', () => {
    expect(
      decideQuestionExecution({ aciertos: 3, totalPreguntas: 5 }, 60),
    ).toEqual({ valid: true, resultadoEjecucion: 'SUPERADA' });
  });

  it('exige todos los aciertos con un mínimo de 100', () => {
    expect(
      decideQuestionExecution({ aciertos: 29, totalPreguntas: 30 }, 100),
    ).toEqual({ valid: true, resultadoEjecucion: 'FALLIDA' });
  });

  it('acepta el mínimo de 1 con un solo acierto', () => {
    expect(
      decideQuestionExecution({ aciertos: 1, totalPreguntas: 30 }, 1),
    ).toEqual({ valid: true, resultadoEjecucion: 'SUPERADA' });
  });

  it.each([0, 31, 2.5])(
    'rechaza %d como total de preguntas',
    (totalPreguntas) => {
      expect(decideQuestionExecution({ aciertos: 0, totalPreguntas })).toEqual({
        valid: false,
        reason: 'INVALID_QUESTION_COUNT',
      });
    },
  );

  it.each([-1, 6, 1.5])(
    'rechaza %d como aciertos de cinco preguntas',
    (aciertos) => {
      expect(decideQuestionExecution({ aciertos, totalPreguntas: 5 })).toEqual({
        valid: false,
        reason: 'INVALID_CORRECT_COUNT',
      });
    },
  );

  it.each([0, 101, 80.5])(
    'rechaza %d como porcentaje mínimo',
    (porcentajeMinimo) => {
      expect(
        decideQuestionExecution(
          { aciertos: 4, totalPreguntas: 5 },
          porcentajeMinimo,
        ),
      ).toEqual({ valid: false, reason: 'INVALID_PASS_PERCENTAGE' });
    },
  );
});
