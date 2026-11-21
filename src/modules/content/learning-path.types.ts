import type { ContentStatus, LevelType } from './unit.types.js';

/**
 * Learning path shapes. Output names follow the OpenAPI contract
 * (UnitSummary, LevelSummary); inputs carry what the rule needs.
 */

/** LevelSummary.motivoNoDisponible. */
export type LevelUnavailableReason =
  | 'PRERREQUISITO'
  | 'DESHABILITADO'
  | 'UNIDAD_DESHABILITADA'
  | 'CARTA_NO_DISPONIBLE';

/** A level of the path plus the player's progress on it. */
export interface PathLevelInput {
  id: string;
  nombre: string;
  orden: number;
  tipo: LevelType;
  estado: ContentStatus;
  /** The player already approved this level at least once. */
  completado: boolean;
}

/** A unit of the path with its levels and its card status. */
export interface PathUnitInput {
  id: string;
  nombre: string;
  descripcion: string;
  orden: number;
  estado: ContentStatus;
  /** AdminCard.estado of the unit card, or null if it has none. */
  estadoCarta: ContentStatus | null;
  niveles: PathLevelInput[];
}

/** LevelSummary. */
export interface LevelSummary {
  id: string;
  nombre: string;
  orden: number;
  tipo: LevelType;
  completado: boolean;
  disponible: boolean;
  motivoNoDisponible: LevelUnavailableReason | null;
}

/** UnitSummary. */
export interface UnitSummary {
  id: string;
  nombre: string;
  descripcion: string;
  orden: number;
  completada: boolean;
  nivelesCompletados: number;
  niveles: LevelSummary[];
}
