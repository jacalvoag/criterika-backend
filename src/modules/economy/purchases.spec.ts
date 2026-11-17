import type { LivesState } from './lives.js';
import {
  validateEvolutionPurchase,
  validateLifePurchase,
  type EvolutionPurchaseInput,
} from './purchases.js';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-11-15T12:00:00Z');

const lives = (overrides: Partial<LivesState> = {}): LivesState => ({
  totales: 5,
  reservadas: 0,
  proximaRegeneracionEn: null,
  ...overrides,
});

describe('validateLifePurchase', () => {
  it('acepta la compra con saldo exacto y detiene el reloj al llegar a 5', () => {
    const result = validateLifePurchase(
      {
        paqueteId: 'VIDAS_3',
        gemas: 150,
        lives: lives({
          totales: 2,
          proximaRegeneracionEn: at('2026-11-15T12:30:00Z'),
        }),
      },
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      costoGemas: 150,
      vidasAgregadas: 3,
      lives: { totales: 5, reservadas: 0, proximaRegeneracionEn: null },
    });
  });

  it('rechaza la compra con saldo insuficiente', () => {
    const result = validateLifePurchase(
      {
        paqueteId: 'VIDA_1',
        gemas: 99,
        lives: lives({
          totales: 4,
          proximaRegeneracionEn: at('2026-11-15T12:30:00Z'),
        }),
      },
      NOW,
    );

    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT_GEMS' });
  });

  it('Compra que excede máximo con reserva', () => {
    const result = validateLifePurchase(
      {
        paqueteId: 'VIDA_1',
        gemas: 1000,
        lives: lives({ totales: 5, reservadas: 1 }),
      },
      NOW,
    );

    expect(result).toEqual({ ok: false, reason: 'LIFE_CAP_EXCEEDED' });
  });

  it('Regeneración y compra simultáneas', () => {
    const result = validateLifePurchase(
      {
        paqueteId: 'VIDAS_3',
        gemas: 1000,
        lives: lives({
          totales: 3,
          proximaRegeneracionEn: at('2026-11-15T11:50:00Z'),
        }),
      },
      NOW,
    );

    expect(result).toEqual({ ok: false, reason: 'LIFE_CAP_EXCEEDED' });
  });

  it('aplica la regeneración vencida antes de sumar el paquete', () => {
    const result = validateLifePurchase(
      {
        paqueteId: 'VIDA_1',
        gemas: 100,
        lives: lives({
          totales: 3,
          proximaRegeneracionEn: at('2026-11-15T11:50:00Z'),
        }),
      },
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      costoGemas: 100,
      vidasAgregadas: 1,
      lives: { totales: 5, reservadas: 0, proximaRegeneracionEn: null },
    });
  });

  it('no reinicia el reloj si la compra queda por debajo de 5', () => {
    const next = at('2026-11-15T12:30:00Z');
    const result = validateLifePurchase(
      {
        paqueteId: 'VIDA_1',
        gemas: 100,
        lives: lives({ totales: 1, reservadas: 1, proximaRegeneracionEn: next }),
      },
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      costoGemas: 100,
      vidasAgregadas: 1,
      lives: { totales: 2, reservadas: 1, proximaRegeneracionEn: next },
    });
  });

  it('el límite de vidas tiene prioridad sobre el saldo', () => {
    const result = validateLifePurchase(
      { paqueteId: 'VIDAS_5', gemas: 0, lives: lives({ totales: 1 }) },
      NOW,
    );

    expect(result).toEqual({ ok: false, reason: 'LIFE_CAP_EXCEEDED' });
  });
});

describe('validateEvolutionPurchase', () => {
  const input = (
    overrides: Partial<EvolutionPurchaseInput> = {},
  ): EvolutionPurchaseInput => ({
    etapa: 1,
    etapaActual: 0,
    cartaObtenida: true,
    etapaDisponible: true,
    gemas: 1000,
    ...overrides,
  });

  it.each([
    { etapa: 1, etapaActual: 0, costo: 150 },
    { etapa: 2, etapaActual: 1, costo: 350 },
    { etapa: 3, etapaActual: 2, costo: 500 },
  ] as const)(
    'acepta la etapa $etapa con saldo exacto de $costo gemas',
    ({ etapa, etapaActual, costo }) => {
      expect(
        validateEvolutionPurchase(input({ etapa, etapaActual, gemas: costo })),
      ).toEqual({ ok: true, costoGemas: costo });
    },
  );

  it('rechaza la compra con saldo insuficiente', () => {
    expect(validateEvolutionPurchase(input({ gemas: 149 }))).toEqual({
      ok: false,
      reason: 'INSUFFICIENT_GEMS',
    });
  });

  it('rechaza una evolución fuera de orden', () => {
    expect(
      validateEvolutionPurchase(input({ etapa: 2, etapaActual: 0 })),
    ).toEqual({ ok: false, reason: 'EVOLUTION_ORDER_REQUIRED' });
  });

  it('rechaza la compra si la carta ya está en la última etapa', () => {
    expect(
      validateEvolutionPurchase(input({ etapa: 3, etapaActual: 3 })),
    ).toEqual({ ok: false, reason: 'EVOLUTION_ALREADY_OWNED' });
  });

  it('rechaza una etapa anterior ya obtenida', () => {
    expect(
      validateEvolutionPurchase(input({ etapa: 1, etapaActual: 2 })),
    ).toEqual({ ok: false, reason: 'EVOLUTION_ALREADY_OWNED' });
  });

  it('rechaza la compra si la carta base no fue obtenida', () => {
    expect(validateEvolutionPurchase(input({ cartaObtenida: false }))).toEqual({
      ok: false,
      reason: 'CARD_NOT_OBTAINED',
    });
  });

  it('rechaza una etapa deshabilitada', () => {
    expect(
      validateEvolutionPurchase(input({ etapaDisponible: false })),
    ).toEqual({ ok: false, reason: 'EVOLUTION_DISABLED' });
  });
});
