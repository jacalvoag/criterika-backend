import { evaluateMemory } from './memory-evaluation.js';
import {
  MEMORY_REJECTION_REASONS,
  type MemoryAnswer,
  type MemoryDefinition,
  type MemoryProgress,
} from './memory-evaluation.types.js';

const CONCEPT_A = '00000000-0000-4000-8000-000000000130';
const DEFINITION_A = '00000000-0000-4000-8000-000000000131';
const CONCEPT_B = '00000000-0000-4000-8000-000000000132';
const DEFINITION_B = '00000000-0000-4000-8000-000000000133';
const UNKNOWN_CARD = '00000000-0000-4000-8000-000000000199';

const definition: MemoryDefinition = {
  tarjetas: [
    { id: CONCEPT_A, parejaId: 'pareja-a' },
    { id: DEFINITION_A, parejaId: 'pareja-a' },
    { id: CONCEPT_B, parejaId: 'pareja-b' },
    { id: DEFINITION_B, parejaId: 'pareja-b' },
  ],
};

const noProgress: MemoryProgress = { parejasResueltas: [] };

function answer(...tarjetasIds: string[]): MemoryAnswer {
  return { tipo: 'MEMORAMA', tarjetasIds };
}

describe('evaluateMemory', () => {
  it('define los motivos de rechazo de una selección imposible', () => {
    expect(MEMORY_REJECTION_REASONS).toEqual([
      'INVALID_SELECTION',
      'CARD_NOT_FOUND',
      'CARD_ALREADY_RESOLVED',
    ]);
  });

  it('marca correcta una pareja de la misma definición', () => {
    expect(
      evaluateMemory(definition, answer(CONCEPT_A, DEFINITION_A), noProgress),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'MEMORAMA',
        correcta: true,
        tarjetasIds: [CONCEPT_A, DEFINITION_A],
      },
    });
  });

  it('acepta la pareja en cualquier orden de selección', () => {
    expect(
      evaluateMemory(definition, answer(DEFINITION_B, CONCEPT_B), noProgress),
    ).toMatchObject({ ok: true, feedback: { correcta: true } });
  });

  it('marca incorrectas dos tarjetas de parejas distintas', () => {
    expect(
      evaluateMemory(definition, answer(CONCEPT_A, DEFINITION_B), noProgress),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'MEMORAMA',
        correcta: false,
        tarjetasIds: [CONCEPT_A, DEFINITION_B],
      },
    });
  });

  it('evalúa la última pareja cuando las demás ya están resueltas', () => {
    expect(
      evaluateMemory(definition, answer(CONCEPT_B, DEFINITION_B), {
        parejasResueltas: [[CONCEPT_A, DEFINITION_A]],
      }),
    ).toMatchObject({ ok: true, feedback: { correcta: true } });
  });

  it('rechaza la misma tarjeta seleccionada dos veces', () => {
    expect(
      evaluateMemory(definition, answer(CONCEPT_A, CONCEPT_A), noProgress),
    ).toEqual({ ok: false, reason: 'INVALID_SELECTION' });
  });

  it('rechaza una selección que no tiene exactamente dos tarjetas', () => {
    expect(evaluateMemory(definition, answer(CONCEPT_A), noProgress)).toEqual({
      ok: false,
      reason: 'INVALID_SELECTION',
    });
    expect(
      evaluateMemory(
        definition,
        answer(CONCEPT_A, DEFINITION_A, CONCEPT_B),
        noProgress,
      ),
    ).toEqual({ ok: false, reason: 'INVALID_SELECTION' });
  });

  it('rechaza una tarjeta que no pertenece al tablero', () => {
    expect(
      evaluateMemory(definition, answer(CONCEPT_A, UNKNOWN_CARD), noProgress),
    ).toEqual({ ok: false, reason: 'CARD_NOT_FOUND' });
  });

  it('rechaza una tarjeta vacía como inexistente', () => {
    expect(
      evaluateMemory(definition, answer(CONCEPT_A, ''), noProgress),
    ).toEqual({ ok: false, reason: 'CARD_NOT_FOUND' });
  });

  it('rechaza sin contar error una tarjeta de una pareja ya resuelta', () => {
    expect(
      evaluateMemory(definition, answer(CONCEPT_A, CONCEPT_B), {
        parejasResueltas: [[CONCEPT_A, DEFINITION_A]],
      }),
    ).toEqual({ ok: false, reason: 'CARD_ALREADY_RESOLVED' });
  });
});
