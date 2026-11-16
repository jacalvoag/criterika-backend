import type { Pool } from 'pg';
import { validateEnvironment } from '../config/environment.js';
import { PostgresService } from './postgres.service.js';

const settings = validateEnvironment({
  DB_HOST: '127.0.0.1',
  DB_NAME: 'criterika_prueba',
  DB_USER: 'criterika_api_prueba',
  DB_PASSWORD: 'ficticia',
  DB_TLS_MODE: 'disable-local',
});

describe('Ciclo de vida de PostgreSQL', () => {
  it('cierra el pool una sola vez al cerrar la aplicación', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          version: 180006,
          schema_ready: true,
          role_allowed: true,
          tls: false,
          tls_version: null,
        },
      ],
    });
    const service = new PostgresService(
      { query, end } as unknown as Pool,
      settings,
    );
    await service.onModuleInit();
    expect(service.connectionInfo().postgresqlMajor).toBe(18);
    await service.onModuleDestroy();
    await service.onModuleDestroy();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('libera las conexiones si falla la comprobación inicial', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const query = vi
      .fn()
      .mockRejectedValue(new Error('error privado del driver'));
    const service = new PostgresService(
      { query, end } as unknown as Pool,
      settings,
    );
    await expect(service.onModuleInit()).rejects.toMatchObject({
      code: 'DB_CONNECTION_FAILED',
    });
    expect(end).toHaveBeenCalledOnce();
  });
});
