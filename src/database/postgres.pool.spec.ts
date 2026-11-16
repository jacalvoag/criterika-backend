import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateEnvironment } from '../config/environment.js';
import { postgresPoolOptions } from './postgres.pool.js';

const base = validateEnvironment({
  DB_HOST: '127.0.0.1',
  DB_NAME: 'criterika_prueba',
  DB_USER: 'criterika_api_prueba',
  DB_PASSWORD: 'ficticia',
}).database;

describe('Opciones del pool PostgreSQL', () => {
  it('verifica el certificado usando el almacén de confianza predeterminado', () => {
    const options = postgresPoolOptions(base);
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(options.connectionTimeoutMillis).toBe(5000);
    expect(options.query_timeout).toBeGreaterThan(
      Number(options.statement_timeout),
    );
  });

  it('carga la CA indicada y mantiene la verificación de certificado', () => {
    const dir = mkdtempSync(join(tmpdir(), 'criterika-ca-'));
    try {
      const path = join(dir, 'ca.pem');
      writeFileSync(
        path,
        'CA ficticia para comprobar lectura, no es un certificado real.',
      );
      expect(postgresPoolOptions({ ...base, caFile: path }).ssl).toEqual({
        rejectUnauthorized: true,
        ca: 'CA ficticia para comprobar lectura, no es un certificado real.',
      });
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('informa una CA inaccesible sin copiar el error original', () => {
    expect(() =>
      postgresPoolOptions({ ...base, caFile: '/ruta/inexistente/ca.pem' }),
    ).toThrow('DB_CA_FILE no se pudo leer o está vacío.');
  });

  it('solo desactiva TLS cuando la configuración validada lo solicita', () => {
    expect(postgresPoolOptions({ ...base, tlsMode: 'disable-local' }).ssl).toBe(
      false,
    );
  });
});
