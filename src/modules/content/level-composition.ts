import type { MinigameType } from '../minigames/minigame-type.js';
import type { Activity } from './content.types.js';

/**
 * Publication rules from the OpenAPI contract (publishLevel):
 * 3–6 activities, at most two per minigame type.
 * Drafts may be incomplete; this check applies when publishing.
 */
export const MIN_ACTIVITIES = 3;
export const MAX_ACTIVITIES = 6;
export const MAX_ACTIVITIES_PER_TYPE = 2;

/**
 * Internal reasons. The contract has no dedicated code for them;
 * the HTTP edge reports them as 422 VALIDATION_FAILED.
 */
export type LevelCompositionViolation =
  | { code: 'TOO_FEW_ACTIVITIES'; count: number }
  | { code: 'TOO_MANY_ACTIVITIES'; count: number }
  | { code: 'TOO_MANY_OF_TYPE'; tipo: MinigameType; count: number };

export type LevelCompositionResult =
  { ok: true } | { ok: false; violations: LevelCompositionViolation[] };

export function validateLevelComposition(
  activities: readonly Pick<Activity, 'tipo'>[],
): LevelCompositionResult {
  const violations: LevelCompositionViolation[] = [];
  const count = activities.length;

  if (count < MIN_ACTIVITIES) {
    violations.push({ code: 'TOO_FEW_ACTIVITIES', count });
  } else if (count > MAX_ACTIVITIES) {
    violations.push({ code: 'TOO_MANY_ACTIVITIES', count });
  }

  const countsByType = new Map<MinigameType, number>();
  for (const { tipo } of activities) {
    countsByType.set(tipo, (countsByType.get(tipo) ?? 0) + 1);
  }
  for (const [tipo, typeCount] of countsByType) {
    if (typeCount > MAX_ACTIVITIES_PER_TYPE) {
      violations.push({ code: 'TOO_MANY_OF_TYPE', tipo, count: typeCount });
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
