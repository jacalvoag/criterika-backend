/**
 * Minigame types from the OpenAPI contract
 * (ActivityPreview.tipo and the `tipo` discriminator of AdminActivityContent and Criteria).
 */
export const MINIGAME_TYPES = [
  'MEMORAMA',
  'PREGUNTAS',
  'SOPA_LETRAS',
  'CRUCIGRAMA',
  'RELACIONAR',
] as const;

export type MinigameType = (typeof MINIGAME_TYPES)[number];
