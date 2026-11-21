import type { MinigameType } from './minigame-type.js';

type CrosswordType = Extract<MinigameType, 'CRUCIGRAMA'>;

/**
 * Server-side solution of one clue: the CrosswordClue id and its word
 * (WordClueInput.palabra in the OpenAPI contract). Solutions are never
 * revealed to the player (CrosswordFeedback).
 */
export type CrosswordWord = {
  id: string;
  texto: string;
};

/** Server-side crossword built from AdminCrosswordContent (2-20 words). */
export type CrosswordDefinition = {
  palabras: readonly CrosswordWord[];
};

/** One entry per clue, mirroring CrosswordAnswer.respuestas. */
export type CrosswordEntry = {
  palabraId: string;
  texto: string;
};

/** Player check of the whole board, mirroring CrosswordAnswer. */
export type CrosswordAnswer = {
  tipo: CrosswordType;
  respuestas: readonly CrosswordEntry[];
};

/** Immediate feedback, mirroring CrosswordFeedback. */
export type CrosswordFeedback = {
  tipo: CrosswordType;
  correcta: boolean;
  palabrasIncorrectasIds: string[];
};

/**
 * Internal reasons for a malformed check: CrosswordAnswer asks for one entry
 * per clue without duplicates. The HTTP edge maps them to its validation error.
 */
export const CROSSWORD_REJECTION_REASONS = [
  'DUPLICATE_ENTRY',
  'WORD_NOT_FOUND',
  'MISSING_ENTRY',
] as const;

export type CrosswordRejectionReason =
  (typeof CROSSWORD_REJECTION_REASONS)[number];
