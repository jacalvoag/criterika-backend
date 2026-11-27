import {
  registrationWorkerOptions,
  runRegistrationLoop,
} from './registration-loop.js';
it('no solapa ciclos y continúa tras un fallo sin copiar el error privado', async () => {
  const stop = new AbortController();
  const results: unknown[] = [];
  let calls = 0,
    active = 0;
  const cycle = async () => {
    active++;
    expect(active).toBe(1);
    calls++;
    active--;
    if (calls === 1) throw new Error('SQL o secreto que no debe salir');
    stop.abort();
    return { status: 'ok' };
  };
  await runRegistrationLoop(cycle, 1, stop.signal, (r) => results.push(r));
  expect(results).toEqual([
    { status: 'error', code: 'REGISTRATION_WORK_FAILED' },
    { status: 'ok' },
  ]);
  expect(calls).toBe(2);
});
it('interrumpe la espera al solicitar cierre', async () => {
  const stop = new AbortController();
  const cycle = vi.fn(async () => ({ status: 'ok' }));
  await runRegistrationLoop(cycle, 60000, stop.signal, () => stop.abort());
  expect(cycle).toHaveBeenCalledOnce();
});
it('rechaza intervalos y lotes fuera de rango sin mostrar el valor', () => {
  expect(registrationWorkerOptions({})).toEqual({
    limit: 20,
    intervalMs: 5000,
  });
  expect(() =>
    registrationWorkerOptions({ REGISTRATION_WORK_BATCH: 'PRIVATE' }),
  ).toThrow('Configuración inválida: REGISTRATION_WORK_BATCH.');
  expect(() =>
    registrationWorkerOptions({ REGISTRATION_WORK_INTERVAL_MS: '0' }),
  ).toThrow('REGISTRATION_WORK_INTERVAL_MS');
});
