import type { MinigameType } from '../minigames/minigame-type.js';

/**
 * Minimal content shapes needed to validate level composition.
 * Property names follow the OpenAPI contract; more fields are added
 * when a step needs them.
 */

/** Subset of AdminActivity, with `tipo` as in ActivityPreview. */
export interface Activity {
  id: string;
  nivelId: string;
  posicion: number;
  instrucciones: string;
  tipo: MinigameType;
}

/** Subset of AdminLevel. */
export interface Level {
  id: string;
  unidadId: string;
  actividadesBorrador: Activity[];
}
