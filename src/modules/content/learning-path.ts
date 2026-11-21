import type {
  LevelSummary,
  LevelUnavailableReason,
  PathLevelInput,
  PathUnitInput,
  UnitSummary,
} from './learning-path.types.js';

/**
 * Availability rules from the OpenAPI contract (getLearningPath,
 * GET /learning/path, and LevelSummary.motivoNoDisponible):
 * - Stable unit and level order; one single path (info "Requisitos
 *   secuenciales: no saltar contenido deshabilitado").
 * - Disabled prerequisites are not skipped and completed progress is not
 *   removed: a disabled level stays listed and, if not completed, blocks
 *   the next one.
 * - Disabled units are not offered to start (UNIDAD_DESHABILITADA).
 * - A final level needs a published card (info "Nivel final no admite
 *   nuevos intentos sin carta publicada válida").
 *
 * Draft units and levels are not part of the player's path. Pagination
 * belongs to the caller; this rule needs the whole ordered path because a
 * unit's first level depends on the previous unit.
 *
 * When several reasons apply, one is reported in this order:
 * UNIDAD_DESHABILITADA, DESHABILITADO, PRERREQUISITO, CARTA_NO_DISPONIBLE.
 */

/**
 * Inconsistent input (the model requires unique positions). The HTTP edge
 * reports it as 500 INTERNAL_ERROR; it is not a player error.
 */
export type LearningPathResult =
  | { ok: true; items: UnitSummary[] }
  | { ok: false; code: 'DUPLICATE_UNIT_ORDER'; orden: number }
  | {
      ok: false;
      code: 'DUPLICATE_LEVEL_ORDER';
      unidadId: string;
      orden: number;
    };

const byOrder = (a: { orden: number }, b: { orden: number }) =>
  a.orden - b.orden;

const findDuplicateOrder = (items: readonly { orden: number }[]) =>
  items.find(
    (item, index) => items.findIndex((o) => o.orden === item.orden) !== index,
  )?.orden;

export function buildLearningPath(
  units: readonly PathUnitInput[],
): LearningPathResult {
  const visibleUnits = units
    .filter(({ estado }) => estado !== 'BORRADOR')
    .toSorted(byOrder);

  const duplicateUnit = findDuplicateOrder(visibleUnits);
  if (duplicateUnit !== undefined) {
    return { ok: false, code: 'DUPLICATE_UNIT_ORDER', orden: duplicateUnit };
  }

  const items: UnitSummary[] = [];
  let previousCompleted = true;

  for (const unit of visibleUnits) {
    const levels = unit.niveles
      .filter(({ estado }) => estado !== 'BORRADOR')
      .toSorted(byOrder);

    const duplicateLevel = findDuplicateOrder(levels);
    if (duplicateLevel !== undefined) {
      return {
        ok: false,
        code: 'DUPLICATE_LEVEL_ORDER',
        unidadId: unit.id,
        orden: duplicateLevel,
      };
    }
    if (levels.length === 0) continue;

    const niveles: LevelSummary[] = levels.map((level) => {
      const motivoNoDisponible = unavailableReason(
        unit,
        level,
        previousCompleted,
      );
      previousCompleted = level.completado;
      return {
        id: level.id,
        nombre: level.nombre,
        orden: level.orden,
        tipo: level.tipo,
        completado: level.completado,
        disponible: motivoNoDisponible === null,
        motivoNoDisponible,
      };
    });

    const nivelesCompletados = niveles.filter((l) => l.completado).length;
    items.push({
      id: unit.id,
      nombre: unit.nombre,
      descripcion: unit.descripcion,
      orden: unit.orden,
      completada: nivelesCompletados === niveles.length,
      nivelesCompletados,
      niveles,
    });
  }

  return { ok: true, items };
}

function unavailableReason(
  unit: PathUnitInput,
  level: PathLevelInput,
  previousCompleted: boolean,
): LevelUnavailableReason | null {
  if (unit.estado === 'DESHABILITADO') return 'UNIDAD_DESHABILITADA';
  if (level.estado === 'DESHABILITADO') return 'DESHABILITADO';
  if (!previousCompleted) return 'PRERREQUISITO';
  if (level.tipo === 'FINAL_UNIDAD' && unit.estadoCarta !== 'PUBLICADO') {
    return 'CARTA_NO_DISPONIBLE';
  }
  return null;
}
