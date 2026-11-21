import type { Card, CardEvolution } from './card.types.js';
import { validateCardPublication } from './card-publication.js';

const evolution = (
  etapa: CardEvolution['etapa'],
  overrides: Partial<CardEvolution> = {},
): CardEvolution => ({
  etapa,
  imagenMediaId: `img-${etapa}`,
  habilitada: true,
  costoGemas: { 1: 150, 2: 350, 3: 500 }[etapa],
  ...overrides,
});

const card = (overrides: Partial<Card> = {}): Card => ({
  id: 'card-1',
  unidadId: 'unit-1',
  estado: 'BORRADOR',
  imagenBaseMediaId: 'img-base',
  evoluciones: [evolution(1), evolution(2), evolution(3)],
  ...overrides,
});

describe('validateCardPublication', () => {
  it('acepta imagen base y tres evoluciones distintas en orden 1-3', () => {
    expect(validateCardPublication(card())).toEqual({ ok: true });
  });

  it('rechaza una carta sin imagen base', () => {
    expect(validateCardPublication(card({ imagenBaseMediaId: null }))).toEqual({
      ok: false,
      violations: [{ code: 'MISSING_BASE_IMAGE' }],
    });
  });

  it('rechaza una evolución sin imagen', () => {
    expect(
      validateCardPublication(
        card({
          evoluciones: [
            evolution(1),
            evolution(2, { imagenMediaId: null }),
            evolution(3),
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      violations: [{ code: 'MISSING_EVOLUTION_IMAGE', etapa: 2 }],
    });
  });

  it('rechaza evoluciones fuera de orden', () => {
    expect(
      validateCardPublication(
        card({ evoluciones: [evolution(2), evolution(1), evolution(3)] }),
      ),
    ).toEqual({
      ok: false,
      violations: [
        { code: 'EVOLUTION_STAGES_OUT_OF_ORDER', etapas: [2, 1, 3] },
      ],
    });
  });

  it('rechaza menos de tres evoluciones', () => {
    expect(
      validateCardPublication(
        card({ evoluciones: [evolution(1), evolution(2)] }),
      ),
    ).toEqual({
      ok: false,
      violations: [{ code: 'EVOLUTION_STAGES_OUT_OF_ORDER', etapas: [1, 2] }],
    });
  });

  it('rechaza una etapa repetida', () => {
    expect(
      validateCardPublication(
        card({
          evoluciones: [
            evolution(1),
            evolution(1, { imagenMediaId: 'img-x' }),
            evolution(3),
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      violations: [
        { code: 'EVOLUTION_STAGES_OUT_OF_ORDER', etapas: [1, 1, 3] },
      ],
    });
  });

  it('rechaza una evolución que repite la imagen base', () => {
    expect(
      validateCardPublication(
        card({
          evoluciones: [
            evolution(1),
            evolution(2),
            evolution(3, { imagenMediaId: 'img-base' }),
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      violations: [{ code: 'DUPLICATE_IMAGE', mediaId: 'img-base' }],
    });
  });

  it('rechaza dos evoluciones con la misma imagen', () => {
    expect(
      validateCardPublication(
        card({
          evoluciones: [
            evolution(1, { imagenMediaId: 'img-same' }),
            evolution(2, { imagenMediaId: 'img-same' }),
            evolution(3),
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      violations: [{ code: 'DUPLICATE_IMAGE', mediaId: 'img-same' }],
    });
  });

  it('rechaza un costo distinto del precio fijo de la etapa', () => {
    expect(
      validateCardPublication(
        card({
          evoluciones: [
            evolution(1),
            evolution(2, { costoGemas: 300 }),
            evolution(3),
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      violations: [
        { code: 'EVOLUTION_COST_MISMATCH', etapa: 2, costoGemas: 300 },
      ],
    });
  });

  it('acumula todas las violaciones', () => {
    const result = validateCardPublication(
      card({
        imagenBaseMediaId: null,
        evoluciones: [evolution(1, { imagenMediaId: null })],
      }),
    );
    expect(result).toEqual({
      ok: false,
      violations: [
        { code: 'MISSING_BASE_IMAGE' },
        { code: 'EVOLUTION_STAGES_OUT_OF_ORDER', etapas: [1] },
        { code: 'MISSING_EVOLUTION_IMAGE', etapa: 1 },
      ],
    });
  });
});
