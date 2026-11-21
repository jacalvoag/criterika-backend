import type { Unit } from './unit.types.js';
import type { OrderedIdsViolation, ReorderResult } from './reorder.types.js';

/**
 * Reorder rules from the OpenAPI contract:
 * - OrderedIds: complete list, no duplicates or omissions, 1–100 items.
 * - reorderUnits (POST /admin/units/order): complete set even if GET is
 *   paginated; cannot move positions of the used segment nor place units
 *   before it; at most 100 units in v1.
 * - reorderUnitLevels (POST /admin/units/{unitId}/levels/order): complete
 *   set; locked structure gives 409 STRUCTURE_LOCKED. The single final at
 *   the end is checked by publishUnit, not here.
 * - reorderLevelActivities (POST /admin/levels/{levelId}/activities/order):
 *   complete set without duplicates; only the draft changes.
 */
export const MAX_ORDERED_IDS = 100;

export function validateOrderedIds(
  currentIds: readonly string[],
  idsOrdenados: readonly string[],
): ReorderResult {
  const violations: OrderedIdsViolation[] = [];

  if (idsOrdenados.length === 0) {
    violations.push({ code: 'EMPTY_ORDER' });
  }
  if (idsOrdenados.length > MAX_ORDERED_IDS) {
    violations.push({
      code: 'TOO_MANY_IDS',
      count: idsOrdenados.length,
      max: MAX_ORDERED_IDS,
    });
  }

  const duplicates = [
    ...new Set(idsOrdenados.filter((id, i) => idsOrdenados.indexOf(id) !== i)),
  ];
  if (duplicates.length > 0) {
    violations.push({ code: 'DUPLICATE_IDS', ids: duplicates });
  }

  const requested = new Set(idsOrdenados);
  const missing = currentIds.filter((id) => !requested.has(id));
  if (missing.length > 0) {
    violations.push({ code: 'MISSING_IDS', ids: missing });
  }

  const current = new Set(currentIds);
  const unknown = [...requested].filter((id) => !current.has(id));
  if (unknown.length > 0) {
    violations.push({ code: 'UNKNOWN_IDS', ids: unknown });
  }

  return violations.length === 0
    ? { ok: true }
    : { ok: false, code: 'VALIDATION_FAILED', violations };
}

/**
 * @param units current units in their current order (by `orden`).
 * The used segment runs from the first unit to the last one with
 * estructuraFijada, so it must stay identical at the start of the list.
 */
export function reorderUnits(
  units: readonly Pick<Unit, 'id' | 'estructuraFijada'>[],
  idsOrdenados: readonly string[],
): ReorderResult {
  const setResult = validateOrderedIds(
    units.map(({ id }) => id),
    idsOrdenados,
  );
  if (!setResult.ok) return setResult;

  const usedLength =
    units.findLastIndex(({ estructuraFijada }) => estructuraFijada) + 1;
  const usedSegmentKept = units
    .slice(0, usedLength)
    .every(({ id }, index) => idsOrdenados[index] === id);

  return usedSegmentKept
    ? { ok: true }
    : { ok: false, code: 'STRUCTURE_LOCKED' };
}

export function reorderUnitLevels(
  unit: Pick<Unit, 'estructuraFijada'>,
  currentLevelIds: readonly string[],
  idsOrdenados: readonly string[],
): ReorderResult {
  if (unit.estructuraFijada) return { ok: false, code: 'STRUCTURE_LOCKED' };
  return validateOrderedIds(currentLevelIds, idsOrdenados);
}

export function reorderLevelActivities(
  currentActivityIds: readonly string[],
  idsOrdenados: readonly string[],
): ReorderResult {
  return validateOrderedIds(currentActivityIds, idsOrdenados);
}
