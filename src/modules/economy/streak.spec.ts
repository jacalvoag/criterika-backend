import { calculateStreak, type StreakState } from './streak.js';

const MEXICO = 'America/Mexico_City';

const streak = (
  dias: number,
  ultimaFechaLocalAprobada: string | null,
  zonaHoraria: string = MEXICO,
): StreakState => ({ dias, ultimaFechaLocalAprobada, zonaHoraria });

describe('calculateStreak', () => {
  describe('reglas de acreditación', () => {
    it('empieza en uno con la primera aprobación y adopta la zona del intento', () => {
      const result = calculateStreak({
        racha: streak(0, null, 'Etc/UTC'),
        aprobadaEn: new Date('2026-11-15T19:00:00Z'),
        zonaHoraria: MEXICO,
      });

      expect(result).toEqual({
        ok: true,
        racha: streak(1, '2026-11-15'),
      });
    });

    it('no suma cuando la fecha local es igual a la última', () => {
      const result = calculateStreak({
        racha: streak(3, '2026-11-15'),
        aprobadaEn: new Date('2026-11-15T23:00:00Z'),
        zonaHoraria: MEXICO,
      });

      expect(result).toEqual({ ok: true, racha: streak(3, '2026-11-15') });
    });

    it('conserva la zona del hito acreditado cuando la fecha es igual', () => {
      const result = calculateStreak({
        racha: streak(3, '2026-11-15'),
        aprobadaEn: new Date('2026-11-15T23:00:00Z'),
        zonaHoraria: 'America/Bogota',
      });

      expect(result).toEqual({ ok: true, racha: streak(3, '2026-11-15') });
    });

    it('suma uno cuando la fecha local es la siguiente', () => {
      const result = calculateStreak({
        racha: streak(3, '2026-11-15'),
        aprobadaEn: new Date('2026-11-16T19:00:00Z'),
        zonaHoraria: MEXICO,
      });

      expect(result).toEqual({ ok: true, racha: streak(4, '2026-11-16') });
    });

    it('actualiza la zona cuando acredita un día nuevo', () => {
      const result = calculateStreak({
        racha: streak(3, '2026-11-15'),
        aprobadaEn: new Date('2026-11-16T19:00:00Z'),
        zonaHoraria: 'America/Bogota',
      });

      expect(result).toEqual({
        ok: true,
        racha: streak(4, '2026-11-16', 'America/Bogota'),
      });
    });

    it('reinicia a uno cuando hay un salto de días', () => {
      const result = calculateStreak({
        racha: streak(7, '2026-11-15'),
        aprobadaEn: new Date('2026-11-17T19:00:00Z'),
        zonaHoraria: MEXICO,
      });

      expect(result).toEqual({ ok: true, racha: streak(1, '2026-11-17') });
    });

    it('no suma ni retrocede la última fecha cuando la fecha local es anterior', () => {
      const result = calculateStreak({
        racha: streak(3, '2026-11-15', 'Asia/Tokyo'),
        aprobadaEn: new Date('2026-11-15T05:00:00Z'),
        zonaHoraria: 'Pacific/Honolulu',
      });

      expect(result).toEqual({
        ok: true,
        racha: streak(3, '2026-11-15', 'Asia/Tokyo'),
      });
    });

    it('no modifica el estado recibido', () => {
      const racha = streak(3, '2026-11-15');

      calculateStreak({
        racha,
        aprobadaEn: new Date('2026-11-16T19:00:00Z'),
        zonaHoraria: 'America/Bogota',
      });

      expect(racha).toEqual(streak(3, '2026-11-15'));
    });
  });

  describe('calendario', () => {
    it.each([
      ['cambio de mes', '2026-11-30', '2026-12-01T19:00:00Z', '2026-12-01'],
      ['cambio de año', '2026-12-31', '2027-01-01T19:00:00Z', '2027-01-01'],
      [
        'febrero sin bisiesto',
        '2027-02-28',
        '2027-03-01T19:00:00Z',
        '2027-03-01',
      ],
      [
        'llegada al 29 de febrero',
        '2028-02-28',
        '2028-02-29T19:00:00Z',
        '2028-02-29',
      ],
      [
        'salida del 29 de febrero',
        '2028-02-29',
        '2028-03-01T19:00:00Z',
        '2028-03-01',
      ],
    ])('suma uno en %s', (_caso, ultimaFecha, aprobadaEn, fechaEsperada) => {
      const result = calculateStreak({
        racha: streak(2, ultimaFecha),
        aprobadaEn: new Date(aprobadaEn),
        zonaHoraria: MEXICO,
      });

      expect(result).toEqual({ ok: true, racha: streak(3, fechaEsperada) });
    });

    it('reinicia cuando 2028 es bisiesto y se omite el 29 de febrero', () => {
      const result = calculateStreak({
        racha: streak(5, '2028-02-28'),
        aprobadaEn: new Date('2028-03-01T19:00:00Z'),
        zonaHoraria: MEXICO,
      });

      expect(result).toEqual({ ok: true, racha: streak(1, '2028-03-01') });
    });

    it('suma uno en el día con cambio de horario de verano', () => {
      const result = calculateStreak({
        racha: streak(2, '2026-03-07', 'America/New_York'),
        aprobadaEn: new Date('2026-03-08T12:00:00Z'),
        zonaHoraria: 'America/New_York',
      });

      expect(result).toEqual({
        ok: true,
        racha: streak(3, '2026-03-08', 'America/New_York'),
      });
    });
  });

  describe('fecha local frente a UTC', () => {
    it('usa la fecha local cuando en UTC ya es el día siguiente', () => {
      const result = calculateStreak({
        racha: streak(2, '2026-11-14'),
        aprobadaEn: new Date('2026-11-16T03:00:00Z'),
        zonaHoraria: MEXICO,
      });

      expect(result).toEqual({ ok: true, racha: streak(3, '2026-11-15') });
    });

    it('usa la fecha local cuando en UTC todavía es el día anterior', () => {
      const result = calculateStreak({
        racha: streak(2, '2026-11-15', 'Asia/Tokyo'),
        aprobadaEn: new Date('2026-11-15T16:00:00Z'),
        zonaHoraria: 'Asia/Tokyo',
      });

      expect(result).toEqual({
        ok: true,
        racha: streak(3, '2026-11-16', 'Asia/Tokyo'),
      });
    });
  });

  describe('zona horaria', () => {
    it.each(['Mars/Phobos', '', '+01:00', '-06:00'])(
      'rechaza la zona inválida "%s"',
      (zonaHoraria) => {
        const result = calculateStreak({
          racha: streak(3, '2026-11-15'),
          aprobadaEn: new Date('2026-11-16T19:00:00Z'),
          zonaHoraria,
        });

        expect(result).toEqual({ ok: false, reason: 'INVALID_TIME_ZONE' });
      },
    );

    it('conserva Etc/UTC tal como se recibió', () => {
      const result = calculateStreak({
        racha: streak(0, null, 'Etc/UTC'),
        aprobadaEn: new Date('2026-11-15T19:00:00Z'),
        zonaHoraria: 'Etc/UTC',
      });

      expect(result).toEqual({
        ok: true,
        racha: streak(1, '2026-11-15', 'Etc/UTC'),
      });
    });
  });

  describe('escenarios del contrato', () => {
    it('Repetir nivel completado y aprobar: la repetición mantiene la racha', () => {
      const result = calculateStreak({
        racha: streak(4, '2026-11-15'),
        aprobadaEn: new Date('2026-11-16T19:00:00Z'),
        zonaHoraria: MEXICO,
      });

      expect(result).toEqual({ ok: true, racha: streak(5, '2026-11-16') });
    });

    it('Cambio de fecha local hacia atrás por zona: no aumenta ni retrocede la última fecha', () => {
      const result = calculateStreak({
        racha: streak(6, '2026-11-16', 'Pacific/Kiritimati'),
        aprobadaEn: new Date('2026-11-15T12:00:00Z'),
        zonaHoraria: 'Pacific/Honolulu',
      });

      expect(result).toEqual({
        ok: true,
        racha: streak(6, '2026-11-16', 'Pacific/Kiritimati'),
      });
    });
  });
});
