/**
 * Result shapes for the reorder rules (reorderUnits, reorderUnitLevels,
 * reorderLevelActivities). The request body is OrderedIds.idsOrdenados.
 */

/** Reasons why idsOrdenados is not the complete current set. */
export type OrderedIdsViolation =
  | { code: 'EMPTY_ORDER' }
  | { code: 'TOO_MANY_IDS'; count: number; max: number }
  | { code: 'DUPLICATE_IDS'; ids: string[] }
  | { code: 'MISSING_IDS'; ids: string[] }
  | { code: 'UNKNOWN_IDS'; ids: string[] };

/**
 * 422 VALIDATION_FAILED with internal reasons, or 409 STRUCTURE_LOCKED
 * (x-error-codes), as the contract states for these operations.
 */
export type ReorderResult =
  | { ok: true }
  | { ok: false; code: 'VALIDATION_FAILED'; violations: OrderedIdsViolation[] }
  | { ok: false; code: 'STRUCTURE_LOCKED' };
