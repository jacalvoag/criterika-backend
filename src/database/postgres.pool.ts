import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { Pool, type PoolConfig } from 'pg';
import type { DatabaseSettings } from '../config/environment.js';

export const POSTGRES_POOL = Symbol('POSTGRES_POOL');

export function postgresPoolOptions(settings: DatabaseSettings): PoolConfig {
  let ca: string | undefined;
  if (settings.caFile) {
    try {
      ca = readFileSync(settings.caFile, 'utf8');
      if (!ca.trim()) throw new Error();
    } catch {
      throw new Error('DB_CA_FILE no se pudo leer o está vacío.');
    }
  }
  return {
    host: settings.host,
    port: settings.port,
    database: settings.name,
    user: settings.user,
    password: settings.password,
    ssl:
      settings.tlsMode === 'verify-full'
        ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
        : false,
    max: settings.poolMax,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    application_name: 'criterika-api',
    options: '-c timezone=UTC',
  };
}

export function createPostgresPool(settings: DatabaseSettings): Pool {
  const pool = new Pool(postgresPoolOptions(settings));
  const logger = new Logger('PostgreSQL');
  pool.on('error', () => {
    // Un error de pg puede incluir texto SQL o datos de conexión.
    logger.error('Error de conexión PostgreSQL en una sesión inactiva.');
  });
  return pool;
}
