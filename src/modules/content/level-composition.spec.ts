import type { MinigameType } from '../minigames/minigame-type.js';
import { validateLevelComposition } from './level-composition.js';

const activities = (...tipos: MinigameType[]) =>
  tipos.map((tipo) => ({ tipo }));

describe('validateLevelComposition', () => {
  it('rechaza una lista vacía', () => {
    expect(validateLevelComposition([])).toEqual({
      valid: false,
      violations: [{ code: 'TOO_FEW_ACTIVITIES', count: 0 }],
    });
  });

  it('rechaza 2 actividades', () => {
    expect(
      validateLevelComposition(activities('MEMORAMA', 'PREGUNTAS')),
    ).toEqual({
      valid: false,
      violations: [{ code: 'TOO_FEW_ACTIVITIES', count: 2 }],
    });
  });

  it('acepta 3 actividades', () => {
    expect(
      validateLevelComposition(
        activities('MEMORAMA', 'PREGUNTAS', 'CRUCIGRAMA'),
      ),
    ).toEqual({ valid: true });
  });

  it('acepta 6 actividades con dos de cada uno de tres tipos', () => {
    expect(
      validateLevelComposition(
        activities(
          'MEMORAMA',
          'MEMORAMA',
          'PREGUNTAS',
          'PREGUNTAS',
          'RELACIONAR',
          'RELACIONAR',
        ),
      ),
    ).toEqual({ valid: true });
  });

  it('rechaza 7 actividades aunque ningún tipo pase de dos', () => {
    expect(
      validateLevelComposition(
        activities(
          'MEMORAMA',
          'MEMORAMA',
          'PREGUNTAS',
          'PREGUNTAS',
          'RELACIONAR',
          'RELACIONAR',
          'CRUCIGRAMA',
        ),
      ),
    ).toEqual({
      valid: false,
      violations: [{ code: 'TOO_MANY_ACTIVITIES', count: 7 }],
    });
  });

  it('rechaza tres actividades del mismo tipo', () => {
    expect(
      validateLevelComposition(
        activities('PREGUNTAS', 'PREGUNTAS', 'PREGUNTAS', 'MEMORAMA'),
      ),
    ).toEqual({
      valid: false,
      violations: [{ code: 'TOO_MANY_OF_TYPE', tipo: 'PREGUNTAS', count: 3 }],
    });
  });

  it('con dos de cada uno de los cinco tipos solo falla por el total', () => {
    const result = validateLevelComposition(
      activities(
        'MEMORAMA',
        'MEMORAMA',
        'PREGUNTAS',
        'PREGUNTAS',
        'SOPA_LETRAS',
        'SOPA_LETRAS',
        'CRUCIGRAMA',
        'CRUCIGRAMA',
        'RELACIONAR',
        'RELACIONAR',
      ),
    );
    expect(result).toEqual({
      valid: false,
      violations: [{ code: 'TOO_MANY_ACTIVITIES', count: 10 }],
    });
  });

  it('reporta todas las violaciones a la vez', () => {
    expect(
      validateLevelComposition(
        activities(
          'SOPA_LETRAS',
          'SOPA_LETRAS',
          'SOPA_LETRAS',
          'MEMORAMA',
          'MEMORAMA',
          'MEMORAMA',
          'PREGUNTAS',
        ),
      ),
    ).toEqual({
      valid: false,
      violations: [
        { code: 'TOO_MANY_ACTIVITIES', count: 7 },
        { code: 'TOO_MANY_OF_TYPE', tipo: 'SOPA_LETRAS', count: 3 },
        { code: 'TOO_MANY_OF_TYPE', tipo: 'MEMORAMA', count: 3 },
      ],
    });
  });
});
