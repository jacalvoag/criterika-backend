import {
  calculateLives,
  reserveLife,
  settleReservation,
  type LivesState,
} from './lives.js';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-11-15T12:00:00Z');

const state = (overrides: Partial<LivesState> = {}): LivesState => ({
  totales: 5,
  reservadas: 0,
  proximaRegeneracionEn: null,
  ...overrides,
});

describe('calculateLives', () => {
  it('con 5 vidas no hay regeneración pendiente', () => {
    expect(calculateLives(state(), NOW)).toEqual({
      totales: 5,
      disponibles: 5,
      reservadas: 0,
      proximaRegeneracionEn: null,
    });
  });

  it('con 0 vidas y la próxima regeneración en el futuro no hay disponibles', () => {
    const next = at('2026-11-15T12:30:00Z');
    expect(
      calculateLives(state({ totales: 0, proximaRegeneracionEn: next }), NOW),
    ).toEqual({
      totales: 0,
      disponibles: 0,
      reservadas: 0,
      proximaRegeneracionEn: next,
    });
  });

  it('acumula varias horas de regeneración sin perder el tiempo parcial', () => {
    const result = calculateLives(
      state({
        totales: 1,
        proximaRegeneracionEn: at('2026-11-15T09:30:00Z'),
      }),
      NOW,
    );
    // 09:30, 10:30 y 11:30 ya pasaron: tres vidas; la siguiente sigue a las 12:30.
    expect(result).toEqual({
      totales: 4,
      disponibles: 4,
      reservadas: 0,
      proximaRegeneracionEn: at('2026-11-15T12:30:00Z'),
    });
  });

  it('regenera justo en el instante de la próxima regeneración', () => {
    expect(
      calculateLives(state({ totales: 3, proximaRegeneracionEn: NOW }), NOW),
    ).toMatchObject({
      totales: 4,
      proximaRegeneracionEn: at('2026-11-15T13:00:00Z'),
    });
  });

  it('se detiene en 5 y no acumula tiempo sobrante', () => {
    expect(
      calculateLives(
        state({
          totales: 2,
          proximaRegeneracionEn: at('2026-11-14T00:00:00Z'),
        }),
        NOW,
      ),
    ).toEqual({
      totales: 5,
      disponibles: 5,
      reservadas: 0,
      proximaRegeneracionEn: null,
    });
  });

  it('la reserva activa cuenta dentro del total y del tope', () => {
    expect(
      calculateLives(
        state({
          totales: 4,
          reservadas: 1,
          proximaRegeneracionEn: at('2026-11-15T08:00:00Z'),
        }),
        NOW,
      ),
    ).toEqual({
      totales: 5,
      disponibles: 4,
      reservadas: 1,
      proximaRegeneracionEn: null,
    });
  });
});

describe('reserveLife', () => {
  it('reserva sin reducir totales ni iniciar regeneración', () => {
    expect(reserveLife(state(), NOW)).toEqual({
      ok: true,
      state: { totales: 5, reservadas: 1, proximaRegeneracionEn: null },
    });
  });

  it('regenera antes de validar la disponibilidad', () => {
    expect(
      reserveLife(state({ totales: 0, proximaRegeneracionEn: NOW }), NOW),
    ).toEqual({
      ok: true,
      state: {
        totales: 1,
        reservadas: 1,
        proximaRegeneracionEn: at('2026-11-15T13:00:00Z'),
      },
    });
  });

  it('rechaza con NO_LIVES si no hay vidas disponibles', () => {
    expect(
      reserveLife(
        state({
          totales: 0,
          proximaRegeneracionEn: at('2026-11-15T12:30:00Z'),
        }),
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'NO_LIVES' });
  });

  it('rechaza con ALREADY_RESERVED si la única vida ya está reservada', () => {
    expect(
      reserveLife(
        state({
          totales: 1,
          reservadas: 1,
          proximaRegeneracionEn: at('2026-11-15T12:30:00Z'),
        }),
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'ALREADY_RESERVED' });
  });

  it('rechaza con ALREADY_RESERVED una segunda reserva aunque queden vidas', () => {
    expect(reserveLife(state({ totales: 5, reservadas: 1 }), NOW)).toEqual({
      ok: false,
      reason: 'ALREADY_RESERVED',
    });
  });
});

describe('settleReservation', () => {
  it('fallar con 5 vidas consume una e inicia el reloj', () => {
    expect(settleReservation(state({ reservadas: 1 }), 'FALLIDO', NOW)).toEqual(
      {
        ok: true,
        state: {
          totales: 4,
          reservadas: 0,
          proximaRegeneracionEn: at('2026-11-15T13:00:00Z'),
        },
      },
    );
  });

  it('abandonar mientras regenera consume una sin reiniciar el reloj', () => {
    const next = at('2026-11-15T12:20:00Z');
    expect(
      settleReservation(
        state({ totales: 3, reservadas: 1, proximaRegeneracionEn: next }),
        'ABANDONADO',
        NOW,
      ),
    ).toEqual({
      ok: true,
      state: { totales: 2, reservadas: 0, proximaRegeneracionEn: next },
    });
  });

  it.each(['APROBADO', 'CANCELADO'] as const)(
    '%s libera la reserva sin cambiar totales',
    (outcome) => {
      expect(settleReservation(state({ reservadas: 1 }), outcome, NOW)).toEqual(
        {
          ok: true,
          state: { totales: 5, reservadas: 0, proximaRegeneracionEn: null },
        },
      );
    },
  );

  it.each(['APROBADO', 'CANCELADO', 'FALLIDO', 'ABANDONADO'] as const)(
    '%s sin reserva se rechaza con NO_RESERVATION y no resta vidas',
    (outcome) => {
      expect(settleReservation(state(), outcome, NOW)).toEqual({
        ok: false,
        reason: 'NO_RESERVATION',
      });
    },
  );

  it('aplica la regeneración vencida antes de consumir', () => {
    expect(
      settleReservation(
        state({
          totales: 2,
          reservadas: 1,
          proximaRegeneracionEn: at('2026-11-15T11:00:00Z'),
        }),
        'FALLIDO',
        NOW,
      ),
    ).toEqual({
      ok: true,
      state: {
        // 11:00 y 12:00 regeneran dos (2 → 4); el fallo consume una.
        totales: 3,
        reservadas: 0,
        proximaRegeneracionEn: at('2026-11-15T13:00:00Z'),
      },
    });
  });
});
