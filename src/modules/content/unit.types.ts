/**
 * Minimal unit shapes for publication, learning path and reordering.
 * Property names and enum values follow the OpenAPI contract
 * (AdminUnit, AdminLevel, AdminCard).
 */

/** AdminUnit.estado, AdminLevel.estado and AdminCard.estado. */
export type ContentStatus = 'BORRADOR' | 'PUBLICADO' | 'DESHABILITADO';

/** AdminLevel.tipo and LevelSummary.tipo. */
export type LevelType = 'NORMAL' | 'FINAL_UNIDAD';

/** Subset of AdminLevel. */
export interface UnitLevel {
  id: string;
  orden: number;
  tipo: LevelType;
  estado: ContentStatus;
}

/**
 * Subset of AdminCard that content needs. content cannot import
 * collection (docs/architecture/backend.md), so it keeps its own view.
 */
export interface UnitCard {
  id: string;
  unidadId: string;
  estado: ContentStatus;
}

/** Subset of AdminUnit. */
export interface Unit {
  id: string;
  orden: number;
  estado: ContentStatus;
  estructuraFijada: boolean;
  cartaId: string | null;
}
