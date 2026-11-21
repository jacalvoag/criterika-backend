import type { ContentStatus, Unit, UnitCard, UnitLevel } from './unit.types.js';

/**
 * Publication rules from the OpenAPI contract (publishUnit,
 * POST /admin/units/{unitId}/publish): at least one level, a single
 * FINAL_UNIDAD level at the end, valid published levels and a complete
 * published card (info "Una unidad tiene uno o más niveles, exactamente un
 * final al terminar y una carta propia").
 *
 * A card can only reach PUBLICADO through publishCard, which checks it is
 * complete, so PUBLICADO is the completeness signal here. Each level's
 * composition is checked by publishLevel before it becomes PUBLICADO.
 */

/**
 * Internal reasons. The contract has no dedicated code for them;
 * the HTTP edge reports them as 422 VALIDATION_FAILED.
 */
export type UnitPublicationViolation =
  | { code: 'NO_LEVELS' }
  | { code: 'FINAL_LEVEL_COUNT'; count: number }
  | { code: 'FINAL_LEVEL_NOT_LAST'; levelId: string }
  | { code: 'LEVEL_NOT_PUBLISHED'; levelId: string; estado: ContentStatus }
  | { code: 'MISSING_CARD' }
  | { code: 'CARD_NOT_OWN' }
  | { code: 'CARD_NOT_PUBLISHED'; estado: ContentStatus };

export type UnitPublicationResult =
  { ok: true } | { ok: false; violations: UnitPublicationViolation[] };

export interface UnitPublicationInput {
  unit: Pick<Unit, 'id' | 'cartaId'>;
  levels: readonly UnitLevel[];
  /** The card referenced by unit.cartaId, or null if none was found. */
  card: UnitCard | null;
}

export function validateUnitPublication({
  unit,
  levels,
  card,
}: UnitPublicationInput): UnitPublicationResult {
  const violations: UnitPublicationViolation[] = [];

  if (levels.length === 0) {
    violations.push({ code: 'NO_LEVELS' });
  }

  const finals = levels.filter(({ tipo }) => tipo === 'FINAL_UNIDAD');
  const [final] = finals;
  if (finals.length !== 1 || final === undefined) {
    violations.push({ code: 'FINAL_LEVEL_COUNT', count: finals.length });
  } else if (levels.some(({ orden }) => orden > final.orden)) {
    violations.push({ code: 'FINAL_LEVEL_NOT_LAST', levelId: final.id });
  }

  for (const { id, estado } of levels) {
    if (estado !== 'PUBLICADO') {
      violations.push({ code: 'LEVEL_NOT_PUBLISHED', levelId: id, estado });
    }
  }

  if (unit.cartaId === null || card === null) {
    violations.push({ code: 'MISSING_CARD' });
  } else if (card.id !== unit.cartaId || card.unidadId !== unit.id) {
    violations.push({ code: 'CARD_NOT_OWN' });
  } else if (card.estado !== 'PUBLICADO') {
    violations.push({ code: 'CARD_NOT_PUBLISHED', estado: card.estado });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
