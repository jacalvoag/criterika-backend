import { evaluateMatch } from './match-evaluation.js';
import {
  MATCH_REJECTION_REASONS,
  type MatchDefinition,
  type MatchProgress,
} from './match-evaluation.types.js';

const LEFT_A = '00000000-0000-4000-8000-000000000042';
const RIGHT_A = '00000000-0000-4000-8000-000000000043';
const LEFT_B = '00000000-0000-4000-8000-000000000044';
const RIGHT_B = '00000000-0000-4000-8000-000000000045';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000099';

const definition: MatchDefinition = {
  parejas: [
    { izquierdaId: LEFT_A, derechaId: RIGHT_A },
    { izquierdaId: LEFT_B, derechaId: RIGHT_B },
  ],
};

const noProgress: MatchProgress = { asociacionesResueltas: [] };

function associate(izquierdaId: string, derechaId: string) {
  return { tipo: 'RELACIONAR' as const, izquierdaId, derechaId };
}

describe('evaluateMatch', () => {
  it('define los motivos de rechazo de una asociación imposible', () => {
    expect(MATCH_REJECTION_REASONS).toEqual([
      'ITEM_NOT_FOUND',
      'ITEM_ALREADY_RESOLVED',
    ]);
  });

  it('marca correcta una asociación de la misma pareja', () => {
    expect(
      evaluateMatch(definition, associate(LEFT_A, RIGHT_A), noProgress),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'RELACIONAR',
        correcta: true,
        izquierdaId: LEFT_A,
        derechaId: RIGHT_A,
      },
    });
  });

  it('marca incorrecta una asociación de parejas distintas', () => {
    expect(
      evaluateMatch(definition, associate(LEFT_A, RIGHT_B), noProgress),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'RELACIONAR',
        correcta: false,
        izquierdaId: LEFT_A,
        derechaId: RIGHT_B,
      },
    });
  });

  it('evalúa la última asociación cuando las demás ya están resueltas', () => {
    expect(
      evaluateMatch(definition, associate(LEFT_B, RIGHT_B), {
        asociacionesResueltas: [{ izquierdaId: LEFT_A, derechaId: RIGHT_A }],
      }),
    ).toMatchObject({ ok: true, feedback: { correcta: true } });
  });

  it('rechaza un elemento izquierdo inexistente', () => {
    expect(
      evaluateMatch(definition, associate(UNKNOWN_ID, RIGHT_A), noProgress),
    ).toEqual({ ok: false, reason: 'ITEM_NOT_FOUND' });
  });

  it('rechaza un elemento derecho inexistente o vacío', () => {
    expect(
      evaluateMatch(definition, associate(LEFT_A, UNKNOWN_ID), noProgress),
    ).toEqual({ ok: false, reason: 'ITEM_NOT_FOUND' });
    expect(
      evaluateMatch(definition, associate(LEFT_A, ''), noProgress),
    ).toEqual({ ok: false, reason: 'ITEM_NOT_FOUND' });
  });

  it('rechaza elementos con los lados invertidos', () => {
    expect(
      evaluateMatch(definition, associate(RIGHT_A, LEFT_A), noProgress),
    ).toEqual({ ok: false, reason: 'ITEM_NOT_FOUND' });
  });

  it('rechaza sin contar error un elemento ya resuelto de cualquier lado', () => {
    const progress: MatchProgress = {
      asociacionesResueltas: [{ izquierdaId: LEFT_A, derechaId: RIGHT_A }],
    };
    expect(
      evaluateMatch(definition, associate(LEFT_A, RIGHT_B), progress),
    ).toEqual({ ok: false, reason: 'ITEM_ALREADY_RESOLVED' });
    expect(
      evaluateMatch(definition, associate(LEFT_B, RIGHT_A), progress),
    ).toEqual({ ok: false, reason: 'ITEM_ALREADY_RESOLVED' });
  });
});
