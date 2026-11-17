import {
  QUESTION_REJECTION_REASONS,
  type EvaluationResult,
  type QuestionAnswer,
  type QuestionDefinition,
  type QuestionFeedback,
  type QuestionRejectionReason,
} from './question-evaluation.types.js';

describe('Tipos de evaluación de preguntas', () => {
  it('define los motivos de rechazo de una respuesta mal formada', () => {
    expect(QUESTION_REJECTION_REASONS).toEqual([
      'QUESTION_MISMATCH',
      'OPTION_NOT_FOUND',
      'EMPTY_ANSWER',
    ]);
    expectTypeOf<QuestionRejectionReason>().toEqualTypeOf<
      'QUESTION_MISMATCH' | 'OPTION_NOT_FOUND' | 'EMPTY_ANSWER'
    >();
  });

  it('la definición sigue AdminQuestion del contrato', () => {
    expectTypeOf<QuestionDefinition>().toEqualTypeOf<{
      id: string;
      enunciado: string;
      opciones: readonly { id: string; texto: string }[];
      opcionCorrectaId: string;
      explicacion: string;
      pista: string | null;
    }>();
  });

  it('la respuesta sigue QuestionAnswer y no trae si acertó', () => {
    expectTypeOf<QuestionAnswer>().toEqualTypeOf<{
      tipo: 'PREGUNTAS';
      preguntaId: string;
      opcionId: string;
    }>();
    expectTypeOf<QuestionAnswer>().not.toHaveProperty('correcta');
  });

  it('el feedback sigue QuestionFeedback y solo admite tipo PREGUNTAS', () => {
    expectTypeOf<QuestionFeedback>().toEqualTypeOf<{
      tipo: 'PREGUNTAS';
      correcta: boolean;
      preguntaId: string;
      opcionCorrectaId: string;
      explicacion: string;
    }>();
    expectTypeOf<{ tipo: 'MEMORAMA' }>().not.toExtend<
      Pick<QuestionFeedback, 'tipo'>
    >();
  });

  it('un resultado inválido no trae feedback', () => {
    type Result = EvaluationResult<QuestionFeedback, QuestionRejectionReason>;
    expectTypeOf<Extract<Result, { valid: true }>>().toEqualTypeOf<{
      valid: true;
      feedback: QuestionFeedback;
    }>();
    expectTypeOf<Extract<Result, { valid: false }>>().toEqualTypeOf<{
      valid: false;
      reason: QuestionRejectionReason;
    }>();
  });
});
