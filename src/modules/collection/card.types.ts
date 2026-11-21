import type { EvolutionStage } from '../economy/purchases.js';

/**
 * Minimal card shapes needed to validate publication.
 * Property names follow the OpenAPI contract (AdminCard).
 */

export type CardStatus = 'BORRADOR' | 'PUBLICADO' | 'DESHABILITADO';

/** Item of AdminCard.evoluciones. */
export interface CardEvolution {
  etapa: EvolutionStage;
  imagenMediaId: string | null;
  habilitada: boolean;
  costoGemas: number;
}

/** Subset of AdminCard. */
export interface Card {
  id: string;
  unidadId: string;
  estado: CardStatus;
  imagenBaseMediaId: string | null;
  evoluciones: CardEvolution[];
}
