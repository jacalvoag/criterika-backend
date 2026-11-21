import { EVOLUTION_COSTS } from '../economy/purchases.js';
import type { EvolutionStage } from '../economy/purchases.js';
import type { Card } from './card.types.js';

/**
 * Publication rules from the OpenAPI contract (publishCard,
 * POST /admin/cards/{cardId}/publish): a base image and three distinct
 * evolution images in stage order 1–3, with fixed prices
 * (info "Evoluciones: 150/350/500", AdminCard.evoluciones).
 */
const EXPECTED_STAGES: readonly EvolutionStage[] = [1, 2, 3];

/**
 * Internal reasons. The contract has no dedicated code for them;
 * the HTTP edge reports them as 422 VALIDATION_FAILED.
 */
export type CardPublicationViolation =
  | { code: 'MISSING_BASE_IMAGE' }
  | { code: 'EVOLUTION_STAGES_OUT_OF_ORDER'; etapas: number[] }
  | { code: 'MISSING_EVOLUTION_IMAGE'; etapa: EvolutionStage }
  | { code: 'DUPLICATE_IMAGE'; mediaId: string }
  | {
      code: 'EVOLUTION_COST_MISMATCH';
      etapa: EvolutionStage;
      costoGemas: number;
    };

export type CardPublicationResult =
  { ok: true } | { ok: false; violations: CardPublicationViolation[] };

export function validateCardPublication(
  card: Pick<Card, 'imagenBaseMediaId' | 'evoluciones'>,
): CardPublicationResult {
  const violations: CardPublicationViolation[] = [];

  if (card.imagenBaseMediaId === null) {
    violations.push({ code: 'MISSING_BASE_IMAGE' });
  }

  const etapas = card.evoluciones.map(({ etapa }) => etapa);
  const inOrder =
    etapas.length === EXPECTED_STAGES.length &&
    etapas.every((etapa, index) => etapa === EXPECTED_STAGES[index]);
  if (!inOrder) {
    violations.push({ code: 'EVOLUTION_STAGES_OUT_OF_ORDER', etapas });
  }

  for (const { etapa, imagenMediaId, costoGemas } of card.evoluciones) {
    if (imagenMediaId === null) {
      violations.push({ code: 'MISSING_EVOLUTION_IMAGE', etapa });
    }
    if (costoGemas !== EVOLUTION_COSTS[etapa]) {
      violations.push({ code: 'EVOLUTION_COST_MISMATCH', etapa, costoGemas });
    }
  }

  const seen = new Set<string>();
  const images = [
    card.imagenBaseMediaId,
    ...card.evoluciones.map(({ imagenMediaId }) => imagenMediaId),
  ];
  for (const mediaId of images) {
    if (mediaId === null) continue;
    if (seen.has(mediaId)) {
      violations.push({ code: 'DUPLICATE_IMAGE', mediaId });
    }
    seen.add(mediaId);
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
