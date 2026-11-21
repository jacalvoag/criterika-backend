import type { MinigameType } from './minigame-type.js';

type MemoryType = Extract<MinigameType, 'MEMORAMA'>;

/**
 * Server-side card of a memory board: a MemoryCard id from the contract plus
 * the MemoryPairInput.id it belongs to. The pair map never reaches the client
 * (getCurrentExecution: "memorama/relacionar sin mapa de pares correcto").
 */
export type MemoryBoardCard = {
  id: string;
  parejaId: string;
};

/** Server-side memory board built from AdminMemoryContent (2-12 pairs). */
export type MemoryDefinition = {
  tarjetas: readonly MemoryBoardCard[];
};

/** Player selection, mirroring MemoryAnswer (exactly two distinct card ids). */
export type MemoryAnswer = {
  tipo: MemoryType;
  tarjetasIds: readonly string[];
};

/** Already solved pairs, mirroring MemoryExecution.parejasResueltas. */
export type MemoryProgress = {
  parejasResueltas: readonly (readonly string[])[];
};

/** Immediate feedback, mirroring MemoryFeedback. */
export type MemoryFeedback = {
  tipo: MemoryType;
  correcta: boolean;
  tarjetasIds: [string, string];
};

/**
 * Internal reasons for an impossible selection. submitGameAnswer rejects them
 * without counting an error; the HTTP edge maps them to its validation error.
 */
export const MEMORY_REJECTION_REASONS = [
  'INVALID_SELECTION',
  'CARD_NOT_FOUND',
  'CARD_ALREADY_RESOLVED',
] as const;

export type MemoryRejectionReason = (typeof MEMORY_REJECTION_REASONS)[number];
