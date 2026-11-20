import { adjustLives } from './life-adjustment.js';
import type { LivesState } from './lives.js';

const at = (iso: string) => new Date(iso);
const SERVER_NOW = at('2026-11-18T18:00:00Z');

const lives = (overrides: Partial<LivesState> = {}): LivesState => ({
  totales: 5,
  reservadas: 0,
  proximaRegeneracionEn: null,
  ...overrides,
});

describe('adjustLives', () => {
  describe('ejemplos de la respuesta 3 de José', () => {
    it('bajar desde cinco inicia el reloj una hora después', () => {
      expect(adjustLives(lives(), -2, SERVER_NOW)).toEqual({
        ok: true,
        state: {
          totales: 3,
          reservadas: 0,
          proximaRegeneracionEn: at('2026-11-18T19:00:00Z'),
        },
      });
    });

    it('un ajuste por debajo de cinco conserva el reloj previo', () => {
      expect(
        adjustLives(
          lives({
            totales: 3,
            proximaRegeneracionEn: at('2026-11-18T18:30:00Z'),
          }),
          -1,
          SERVER_NOW,
        ),
      ).toEqual({
        ok: true,
        state: {
          totales: 2,
          reservadas: 0,
          proximaRegeneracionEn: at('2026-11-18T18:30:00Z'),
        },
      });
    });

    it('llegar a cinco detiene el reloj y conserva la reserva', () => {
      expect(
        adjustLives(
          lives({
            totales: 3,
            reservadas: 1,
            proximaRegeneracionEn: at('2026-11-18T18:30:00Z'),
          }),
          2,
          SERVER_NOW,
        ),
      ).toEqual({
        ok: true,
        state: { totales: 5, reservadas: 1, proximaRegeneracionEn: null },
      });
    });

    it('rechaza un ajuste que retiraría la vida reservada', () => {
      expect(
        adjustLives(
          lives({
            totales: 1,
            reservadas: 1,
            proximaRegeneracionEn: at('2026-11-18T18:30:00Z'),
          }),
          -1,
          SERVER_NOW,
        ),
      ).toEqual({ ok: false, reason: 'WOULD_REMOVE_RESERVED_LIFE' });
    });
  });

  it('aplica la regeneración vencida antes del ajuste', () => {
    expect(
      adjustLives(
        lives({
          totales: 4,
          proximaRegeneracionEn: at('2026-11-18T17:30:00Z'),
        }),
        -1,
        SERVER_NOW,
      ),
    ).toEqual({
      ok: true,
      state: {
        totales: 4,
        reservadas: 0,
        proximaRegeneracionEn: at('2026-11-18T19:00:00Z'),
      },
    });
  });

  it('rechaza con LIFE_CAP_EXCEEDED un ajuste que superaría cinco', () => {
    expect(
      adjustLives(
        lives({
          totales: 4,
          proximaRegeneracionEn: at('2026-11-18T18:30:00Z'),
        }),
        2,
        SERVER_NOW,
      ),
    ).toEqual({ ok: false, reason: 'LIFE_CAP_EXCEEDED' });
  });

  it('rechaza sumar vidas con el máximo ya alcanzado', () => {
    expect(adjustLives(lives(), 1, SERVER_NOW)).toEqual({
      ok: false,
      reason: 'LIFE_CAP_EXCEEDED',
    });
  });

  it('devuelve un motivo interno si falta el reloj con menos de cinco vidas', () => {
    expect(
      adjustLives(
        lives({ totales: 3, proximaRegeneracionEn: null }),
        1,
        SERVER_NOW,
      ),
    ).toEqual({ ok: false, reason: 'MISSING_REGENERATION_CLOCK' });
  });
});
