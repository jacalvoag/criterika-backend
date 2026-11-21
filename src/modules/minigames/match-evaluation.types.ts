import type { MinigameType } from './minigame-type.js';

type MatchType = Extract<MinigameType, 'RELACIONAR'>;

/**
 * Correct association between a left and a right MatchItem, built from
 * MatchPairInput in the OpenAPI contract. The pair map never reaches the
 * client (getCurrentExecution: "memorama/relacionar sin mapa de pares correcto").
 */
export type MatchPair = {
  izquierdaId: string;
  derechaId: string;
};

/** Server-side match board built from AdminMatchContent (2-12 pairs). */
export type MatchDefinition = {
  parejas: readonly MatchPair[];
};

/** Player association, mirroring MatchAnswer. */
export type MatchAnswer = {
  tipo: MatchType;
  izquierdaId: string;
  derechaId: string;
};

/** Already solved associations, mirroring MatchExecution.asociacionesResueltas. */
export type MatchProgress = {
  asociacionesResueltas: readonly MatchPair[];
};

/** Immediate feedback, mirroring MatchFeedback. */
export type MatchFeedback = {
  tipo: MatchType;
  correcta: boolean;
  izquierdaId: string;
  derechaId: string;
};

/**
 * Internal reasons for an impossible association. submitGameAnswer rejects
 * them without counting an error; the HTTP edge maps them to its validation error.
 */
export const MATCH_REJECTION_REASONS = [
  'ITEM_NOT_FOUND',
  'ITEM_ALREADY_RESOLVED',
] as const;

export type MatchRejectionReason = (typeof MATCH_REJECTION_REASONS)[number];
