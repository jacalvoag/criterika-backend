import type { Pool } from 'pg';

export class DatabaseConnectionError extends Error {
  constructor(readonly code: string) {
    super(`PostgreSQL no está disponible para la aplicación (${code}).`);
    this.name = 'DatabaseConnectionError';
  }
}

export interface DatabaseConnectionInfo {
  postgresqlMajor: number;
  tls: boolean;
  tlsVersion: string | null;
}

interface ConnectionRow {
  version: number;
  schema_ready: boolean;
  role_allowed: boolean;
  tls: boolean;
  tls_version: string | null;
}

export async function checkDatabaseConnection(
  pool: Pool,
  requireTls: boolean,
): Promise<DatabaseConnectionInfo> {
  try {
    const result = await pool.query<ConnectionRow>(`
      SELECT current_setting('server_version_num')::integer AS version,
        (to_regclass('criterika.cuentas') IS NOT NULL AND
         to_regprocedure('criterika.establecer_contexto(text,uuid,uuid,text)') IS NOT NULL) AS schema_ready,
        (NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND
         NOT r.rolreplication AND NOT r.rolbypassrls AND
         pg_has_role(current_user, 'criterika_app', 'USAGE') AND
         NOT pg_has_role(current_user, 'criterika_owner', 'MEMBER') AND
         NOT pg_has_role(current_user, 'criterika_maintenance', 'MEMBER')) AS role_allowed,
        coalesce(s.ssl, false) AS tls, s.version AS tls_version
      FROM pg_roles r
      LEFT JOIN pg_stat_ssl s ON s.pid = pg_backend_pid()
      WHERE r.rolname = current_user
    `);
    const row = result.rows[0];
    if (!row) throw new DatabaseConnectionError('DB_CONNECTION_FAILED');
    if (row.version < 180000)
      throw new DatabaseConnectionError('DB_VERSION_UNSUPPORTED');
    if (!row.schema_ready)
      throw new DatabaseConnectionError('DB_SCHEMA_NOT_READY');
    if (!row.role_allowed)
      throw new DatabaseConnectionError('DB_ROLE_NOT_ALLOWED');
    if (requireTls && !row.tls)
      throw new DatabaseConnectionError('DB_TLS_REQUIRED');
    return {
      postgresqlMajor: Math.floor(row.version / 10000),
      tls: row.tls,
      tlsVersion: row.tls_version,
    };
  } catch (error) {
    if (error instanceof DatabaseConnectionError) throw error;
    throw new DatabaseConnectionError('DB_CONNECTION_FAILED');
  }
}
