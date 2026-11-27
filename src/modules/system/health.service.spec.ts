import type { Pool } from 'pg';
import type { ApplicationSettings } from '../../config/environment.js';
import { HealthService } from './health.service.js';

it('agrupa consultas simultáneas pero no reutiliza el resultado en consultas posteriores', async () => {
  let finish!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const query = vi
    .fn()
    .mockReturnValueOnce(pending)
    .mockRejectedValue(new Error('base caída'));
  const service = new HealthService(
    { query } as unknown as Pool,
    { database: { tlsMode: 'verify-full' } } as ApplicationSettings,
  );
  const first = service.ready(),
    second = service.ready();
  expect(query).toHaveBeenCalledOnce();
  finish({
    rows: [
      {
        version: 180006,
        schema_ready: true,
        role_allowed: true,
        tls: true,
        tls_version: 'TLSv1.3',
      },
    ],
  });
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(await service.ready()).toBe(false);
  expect(query).toHaveBeenCalledTimes(2);
});
it('no inicia otra consulta durante el cierre', async () => {
  const query = vi.fn();
  const service = new HealthService(
    { query } as unknown as Pool,
    {} as ApplicationSettings,
  );
  service.onModuleDestroy();
  expect(await service.ready()).toBe(false);
  expect(query).not.toHaveBeenCalled();
});
