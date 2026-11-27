import { setTimeout as delay } from 'node:timers/promises';

export function registrationWorkerOptions(env: Record<string, unknown>) {
  const number = (name: string, fallback: number, min: number, max: number) => {
    const value = env[name] ?? String(fallback);
    if (
      typeof value !== 'string' ||
      !/^\d+$/.test(value) ||
      Number(value) < min ||
      Number(value) > max
    )
      throw new Error(`Configuración inválida: ${name}.`);
    return Number(value);
  };
  return {
    limit: number('REGISTRATION_WORK_BATCH', 20, 1, 100),
    intervalMs: number('REGISTRATION_WORK_INTERVAL_MS', 5000, 1000, 60000),
  };
}

/** Sequential cycles with an interruptible wait: no overlapping setInterval callbacks. */
export async function runRegistrationLoop(
  cycle: () => Promise<unknown>,
  intervalMs: number,
  signal: AbortSignal,
  onResult: (result: unknown) => void,
) {
  while (!signal.aborted) {
    try {
      onResult(await cycle());
    } catch {
      onResult({ status: 'error', code: 'REGISTRATION_WORK_FAILED' });
    }
    try {
      await delay(intervalMs, undefined, { signal });
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}
