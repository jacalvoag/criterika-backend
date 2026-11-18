import type {
  AttemptHeartbeatState,
  HeartbeatResolution,
} from './attempt-heartbeat.types.js';

/** Contract (info.description): 60 seconds without communication ends the attempt. */
export const HEARTBEAT_TIMEOUT_MS = 60_000;

const communicationDeadline = (lastSignalMs: number): Date =>
  new Date(lastSignalMs + HEARTBEAT_TIMEOUT_MS);

/**
 * Resolves a heartbeat following the heartbeatAttempt operation: an expired
 * attempt is abandoned before renewing and never revived, and a finished one
 * returns its terminal state without consuming another life.
 *
 * Consuming the life only once also requires persisting the terminal state
 * under the attempt lock, so a repeated heartbeat reads it as finished.
 */
export function resolveAttemptHeartbeat(
  attempt: AttemptHeartbeatState,
  serverNow: Date,
): HeartbeatResolution {
  const lastSignalMs = attempt.ultimaComunicacionEn.getTime();
  const nowMs = serverNow.getTime();

  if (attempt.estado !== 'EN_CURSO') {
    return {
      ok: false,
      resolucion: 'YA_TERMINADO',
      estado: attempt.estado,
      consumeVida: false,
      limiteComunicacionEn: communicationDeadline(lastSignalMs),
    };
  }

  if (nowMs - lastSignalMs >= HEARTBEAT_TIMEOUT_MS) {
    return {
      ok: false,
      resolucion: 'ABANDONADO_POR_TIMEOUT',
      estado: 'ABANDONADO',
      motivoFinalizacion: 'TIMEOUT',
      consumeVida: true,
      limiteComunicacionEn: communicationDeadline(lastSignalMs),
    };
  }

  // A server clock behind the last signal must not move the deadline backwards.
  const renewedSignalMs = Math.max(nowMs, lastSignalMs);

  return {
    ok: true,
    resolucion: 'RENOVADO',
    estado: 'EN_CURSO',
    ultimaComunicacionEn: new Date(renewedSignalMs),
    limiteComunicacionEn: communicationDeadline(renewedSignalMs),
  };
}
