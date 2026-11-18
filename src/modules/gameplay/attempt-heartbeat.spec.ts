import {
  HEARTBEAT_TIMEOUT_MS,
  resolveAttemptHeartbeat,
} from './attempt-heartbeat.js';
import type {
  AttemptHeartbeatState,
  TerminalAttemptStatus,
} from './attempt-heartbeat.types.js';

const LAST_SIGNAL = new Date('2026-11-15T19:00:00.000Z');
const DEADLINE = new Date('2026-11-15T19:01:00.000Z');

const after = (ms: number) => new Date(LAST_SIGNAL.getTime() + ms);

const activeAttempt: AttemptHeartbeatState = {
  estado: 'EN_CURSO',
  ultimaComunicacionEn: LAST_SIGNAL,
};

describe('resolveAttemptHeartbeat', () => {
  it('usa un vencimiento de 60 segundos', () => {
    expect(HEARTBEAT_TIMEOUT_MS).toBe(60_000);
  });

  it('renueva el intento justo antes de 60 s', () => {
    const serverNow = after(59_999);

    expect(resolveAttemptHeartbeat(activeAttempt, serverNow)).toEqual({
      ok: true,
      resolucion: 'RENOVADO',
      estado: 'EN_CURSO',
      ultimaComunicacionEn: serverNow,
      limiteComunicacionEn: new Date(serverNow.getTime() + 60_000),
    });
  });

  it('resuelve abandono por timeout a exactamente 60 s', () => {
    expect(resolveAttemptHeartbeat(activeAttempt, after(60_000))).toEqual({
      ok: false,
      resolucion: 'ABANDONADO_POR_TIMEOUT',
      estado: 'ABANDONADO',
      motivoFinalizacion: 'TIMEOUT',
      consumeVida: true,
      limiteComunicacionEn: DEADLINE,
    });
  });

  it('resuelve abandono por timeout después de 60 s', () => {
    expect(resolveAttemptHeartbeat(activeAttempt, after(60_001))).toEqual({
      ok: false,
      resolucion: 'ABANDONADO_POR_TIMEOUT',
      estado: 'ABANDONADO',
      motivoFinalizacion: 'TIMEOUT',
      consumeVida: true,
      limiteComunicacionEn: DEADLINE,
    });
  });

  it('no retrocede el límite si la hora del servidor es anterior a la última señal', () => {
    expect(resolveAttemptHeartbeat(activeAttempt, after(-5_000))).toEqual({
      ok: true,
      resolucion: 'RENOVADO',
      estado: 'EN_CURSO',
      ultimaComunicacionEn: LAST_SIGNAL,
      limiteComunicacionEn: DEADLINE,
    });
  });

  describe('intento ya terminado', () => {
    const terminalStatuses: TerminalAttemptStatus[] = [
      'APROBADO',
      'FALLIDO',
      'ABANDONADO',
      'CANCELADO',
    ];

    it.each(terminalStatuses)(
      'devuelve %s sin renovar ni consumir vida dentro de la ventana',
      (estado) => {
        expect(
          resolveAttemptHeartbeat(
            { estado, ultimaComunicacionEn: LAST_SIGNAL },
            after(10_000),
          ),
        ).toEqual({
          ok: false,
          resolucion: 'YA_TERMINADO',
          estado,
          consumeVida: false,
          limiteComunicacionEn: DEADLINE,
        });
      },
    );

    it.each(terminalStatuses)(
      'devuelve %s sin consumir vida aunque hayan pasado más de 60 s',
      (estado) => {
        expect(
          resolveAttemptHeartbeat(
            { estado, ultimaComunicacionEn: LAST_SIGNAL },
            after(600_000),
          ),
        ).toEqual({
          ok: false,
          resolucion: 'YA_TERMINADO',
          estado,
          consumeVida: false,
          limiteComunicacionEn: DEADLINE,
        });
      },
    );
  });

  describe('escenario del contrato: Timeout ya vencido y heartbeat tardío', () => {
    it('no revive el intento y registra una sola pérdida', () => {
      const lateHeartbeat = resolveAttemptHeartbeat(
        activeAttempt,
        after(90_000),
      );

      expect(lateHeartbeat.ok).toBe(false);
      expect(lateHeartbeat.estado).toBe('ABANDONADO');
      expect(lateHeartbeat).toHaveProperty('consumeVida', true);

      const persisted: AttemptHeartbeatState = {
        estado: lateHeartbeat.estado,
        ultimaComunicacionEn: LAST_SIGNAL,
      };
      const repeatedHeartbeat = resolveAttemptHeartbeat(
        persisted,
        after(105_000),
      );

      expect(repeatedHeartbeat).toEqual({
        ok: false,
        resolucion: 'YA_TERMINADO',
        estado: 'ABANDONADO',
        consumeVida: false,
        limiteComunicacionEn: DEADLINE,
      });
    });
  });
});
