import type { MinigameType } from './minigame-type.js';

type QuestionsType = Extract<MinigameType, 'PREGUNTAS'>;

/** QuestionOption from the OpenAPI contract. */
export type QuestionOption = {
  id: string;
  texto: string;
};

/**
 * Server-side question definition, mirroring AdminQuestion from the contract.
 * Practical situations have no schema of their own: they are questions
 * whose `enunciado` describes the scenario.
 */
export type QuestionDefinition = {
  id: string;
  enunciado: string;
  opciones: readonly QuestionOption[];
  opcionCorrectaId: string;
  explicacion: string;
  pista: string | null;
};

/** Player answer, mirroring QuestionAnswer. Correctness is decided by the server. */
export type QuestionAnswer = {
  tipo: QuestionsType;
  preguntaId: string;
  opcionId: string;
};

/** Immediate feedback, mirroring QuestionFeedback. */
export type QuestionFeedback = {
  tipo: QuestionsType;
  correcta: boolean;
  preguntaId: string;
  opcionCorrectaId: string;
  explicacion: string;
};

/**
 * Internal reasons for a malformed answer. The contract has no dedicated
 * code for them; the HTTP edge maps them to its validation error.
 */
export const QUESTION_REJECTION_REASONS = [
  'QUESTION_MISMATCH',
  'OPTION_NOT_FOUND',
  'EMPTY_ANSWER',
] as const;

export type QuestionRejectionReason =
  (typeof QUESTION_REJECTION_REASONS)[number];

/** Result shared by every minigame evaluator. */
export type EvaluationResult<Feedback, Reason extends string> =
  | { valid: true; feedback: Feedback }
  | { valid: false; reason: Reason };
