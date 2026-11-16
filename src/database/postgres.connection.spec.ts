import type { Pool } from 'pg';
import { checkDatabaseConnection } from './postgres.connection.js';

const row = {
  version: 180006,
  schema_ready: true,
  role_allowed: true,
  tls: true,
  tls_version: 'TLSv1.3',
};
const poolWith = (value: typeof row): Pool =>
  ({ query: vi.fn().mockResolvedValue({ rows: [value] }) }) as unknown as Pool;

describe('Comprobación PostgreSQL', () => {
  it('devuelve únicamente información técnica de la conexión', async () => {
    await expect(checkDatabaseConnection(poolWith(row), true)).resolves.toEqual(
      {
        postgresqlMajor: 18,
        tls: true,
        tlsVersion: 'TLSv1.3',
      },
    );
  });

  it.each([
    [{ ...row, version: 170005 }, 'DB_VERSION_UNSUPPORTED'],
    [{ ...row, schema_ready: false }, 'DB_SCHEMA_NOT_READY'],
    [{ ...row, role_allowed: false }, 'DB_ROLE_NOT_ALLOWED'],
    [{ ...row, tls: false }, 'DB_TLS_REQUIRED'],
  ])('rechaza una conexión que incumple el arranque', async (value, code) => {
    await expect(
      checkDatabaseConnection(poolWith(value), true),
    ).rejects.toMatchObject({ code });
  });

  it('no expone el mensaje original del driver', async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValue(new Error('contraseña_ficticia_secreta')),
    } as unknown as Pool;
    await expect(checkDatabaseConnection(pool, true)).rejects.toThrow(
      'PostgreSQL no está disponible para la aplicación (DB_CONNECTION_FAILED).',
    );
  });
});
