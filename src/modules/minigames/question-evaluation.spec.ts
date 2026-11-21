import { evaluateQuestion } from './question-evaluation.js';
import type {
  QuestionAnswer,
  QuestionDefinition,
} from './question-evaluation.types.js';

const QUESTION_ID = '0b6f2c1e-3d4a-4f5b-8c6d-7e8f9a0b1c2d';
const CORRECT_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const WRONG_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const UNKNOWN_ID = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f';

const definition: QuestionDefinition = {
  id: QUESTION_ID,
  enunciado: '¿Qué artículo regula el derecho de petición?',
  opciones: [
    { id: CORRECT_ID, texto: 'Artículo 8' },
    { id: WRONG_ID, texto: 'Artículo 27' },
  ],
  opcionCorrectaId: CORRECT_ID,
  explicacion: 'El artículo 8 regula el derecho de petición.',
  pista: null,
};

function answer(overrides: Partial<QuestionAnswer> = {}): QuestionAnswer {
  return {
    tipo: 'PREGUNTAS',
    preguntaId: QUESTION_ID,
    opcionId: CORRECT_ID,
    ...overrides,
  };
}

describe('evaluateQuestion', () => {
  it('marca correcta la opción correcta y devuelve el feedback', () => {
    expect(evaluateQuestion(definition, answer())).toEqual({
      ok: true,
      feedback: {
        tipo: 'PREGUNTAS',
        correcta: true,
        preguntaId: QUESTION_ID,
        opcionCorrectaId: CORRECT_ID,
        explicacion: definition.explicacion,
      },
    });
  });

  it('marca incorrecta otra opción y aun así revela la correcta y la explicación', () => {
    expect(
      evaluateQuestion(definition, answer({ opcionId: WRONG_ID })),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'PREGUNTAS',
        correcta: false,
        preguntaId: QUESTION_ID,
        opcionCorrectaId: CORRECT_ID,
        explicacion: definition.explicacion,
      },
    });
  });

  it('rechaza una opción que no pertenece a la pregunta', () => {
    expect(
      evaluateQuestion(definition, answer({ opcionId: UNKNOWN_ID })),
    ).toEqual({ ok: false, reason: 'OPTION_NOT_FOUND' });
  });

  it('rechaza una opción vacía', () => {
    expect(evaluateQuestion(definition, answer({ opcionId: '' }))).toEqual({
      ok: false,
      reason: 'EMPTY_ANSWER',
    });
  });

  it('rechaza un preguntaId vacío', () => {
    expect(evaluateQuestion(definition, answer({ preguntaId: '' }))).toEqual({
      ok: false,
      reason: 'EMPTY_ANSWER',
    });
  });

  it('rechaza una respuesta dirigida a otra pregunta', () => {
    expect(
      evaluateQuestion(definition, answer({ preguntaId: UNKNOWN_ID })),
    ).toEqual({ ok: false, reason: 'QUESTION_MISMATCH' });
  });

  it('ignora un campo del cliente que diga que acertó', () => {
    const forged = { ...answer({ opcionId: WRONG_ID }), correcta: true };
    const result = evaluateQuestion(definition, forged);
    expect(result).toMatchObject({
      ok: true,
      feedback: { correcta: false },
    });
  });

  it('evalúa una situación práctica igual que cualquier pregunta', () => {
    const scenario: QuestionDefinition = {
      ...definition,
      enunciado:
        'Tu vecino bloquea la salida de tu cochera todos los días. ¿Qué haces primero?',
      opciones: [
        { id: WRONG_ID, texto: 'Ponchar sus llantas' },
        {
          id: CORRECT_ID,
          texto: 'Hablar con él y, si sigue, acudir a la autoridad',
        },
      ],
      pista: 'Piensa en la vía pacífica.',
    };
    expect(evaluateQuestion(scenario, answer())).toMatchObject({
      ok: true,
      feedback: { correcta: true, opcionCorrectaId: CORRECT_ID },
    });
    expect(
      evaluateQuestion(scenario, answer({ opcionId: WRONG_ID })),
    ).toMatchObject({ ok: true, feedback: { correcta: false } });
  });
});
