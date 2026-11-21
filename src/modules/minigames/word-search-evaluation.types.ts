import type { MinigameType } from './minigame-type.js';

type WordSearchType = Extract<MinigameType, 'SOPA_LETRAS'>;

/** Zero-based cell, mirroring Coordinate in the OpenAPI contract. */
export type Coordinate = {
  fila: number;
  columna: number;
};

/** Target word, mirroring WordTarget (id and text from WordClueInput). */
export type WordSearchWord = {
  id: string;
  texto: string;
};

/**
 * Server-side word search board: the approved BoardGeneration grid
 * (rows of ^[A-ZÑ]{2,20}$, as in WordSearchExecution.cuadricula) and the
 * words of AdminWordSearchContent (1-20).
 */
export type WordSearchDefinition = {
  cuadricula: readonly string[];
  palabras: readonly WordSearchWord[];
};

/** Player selection, mirroring WordSearchAnswer. */
export type WordSearchAnswer = {
  tipo: WordSearchType;
  inicio: Coordinate;
  fin: Coordinate;
};

/** Words already found, mirroring WordSearchExecution.encontradasIds. */
export type WordSearchProgress = {
  encontradasIds: readonly string[];
};

/** Immediate feedback, mirroring WordSearchFeedback. */
export type WordSearchFeedback = {
  tipo: WordSearchType;
  correcta: boolean;
  palabraId: string | null;
};

/**
 * Internal reasons for an impossible selection. submitGameAnswer rejects them
 * without counting an error; the HTTP edge maps them to its validation error.
 */
export const WORD_SEARCH_REJECTION_REASONS = [
  'INVALID_SELECTION',
  'WORD_ALREADY_FOUND',
] as const;

export type WordSearchRejectionReason =
  (typeof WORD_SEARCH_REJECTION_REASONS)[number];
