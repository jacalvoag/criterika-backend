import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/modules/system/health.module.js';
import { HealthService } from '../src/modules/system/health.service.js';
import { POSTGRES_POOL } from '../src/database/postgres.pool.js';
import { PostgresService } from '../src/database/postgres.service.js';

const row = {
  version: 180006,
  schema_ready: true,
  role_allowed: true,
  tls: true,
  tls_version: 'TLSv1.3',
};
describe('GET /api/v1/health', () => {
  let app: INestApplication;
  const query = vi.fn();
  beforeEach(async () => {
    for (const [key, value] of Object.entries({
      NODE_ENV: 'test',
      DB_HOST: 'db.example.invalid',
      DB_NAME: 'criterika_prueba_health',
      DB_USER: 'ficticio',
      DB_PASSWORD: 'ficticia',
      DB_TLS_MODE: 'verify-full',
      DB_CA_FILE: '',
      DB_PORT: '5432',
      DB_POOL_MAX: '10',
      PORT: '3000',
    }))
      vi.stubEnv(key, value);
    query.mockReset().mockResolvedValue({ rows: [row] });
    const module = await Test.createTestingModule({ imports: [HealthModule] })
      .overrideProvider(POSTGRES_POOL)
      .useValue({ query })
      .overrideProvider(PostgresService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  it('devuelve solo el estado y fecha UTC, sin autenticación ni caché y con UUID propio', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const r = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', id)
      .expect(200);
    expect(Object.keys(r.body).sort()).toEqual(['estado', 'fechaServidor']);
    expect(r.body.estado).toBe('OK');
    expect(new Date(r.body.fechaServidor).toISOString()).toBe(
      r.body.fechaServidor,
    );
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.headers['x-request-id']).not.toBe(id);
  });
  it('responde 503 sin detalles privados y vuelve a comprobar tras recuperarse', async () => {
    query.mockRejectedValueOnce(
      new Error('password=PRIVATE_SECRET host=privado SQL=SELECT'),
    );
    const r = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);
    expect(r.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(r.body).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      requestId: r.headers['x-request-id'],
    });
    expect(JSON.stringify(r.body)).not.toMatch(/PRIVATE|privado|SQL|password/);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rechaza una conexión remota sin TLS o un rol que ya no es admisible', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...row, tls: false }] });
    await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    query.mockResolvedValueOnce({ rows: [{ ...row, role_allowed: false }] });
    await request(app.getHttpServer()).get('/api/v1/health').expect(503);
  });
  it('limita antes de consultar PostgreSQL e ignora IP reenviada sin proxy de confianza', async () => {
    for (let i = 0; i < 60; i++) {
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', `192.0.2.${i + 1}`)
        .expect(200);
    }
    const r = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(429);
    expect(r.body.code).toBe('RATE_LIMITED');
    expect(r.body.requestId).toBe(r.headers['x-request-id']);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['retry-after']).toBe('60');
    expect(query).toHaveBeenCalledTimes(60);
  });
  it('normaliza un fallo inesperado como Problem sin copiar la excepción', async () => {
    vi.spyOn(app.get(HealthService), 'ready').mockRejectedValueOnce(
      new Error('PRIVATE_EXCEPTION'),
    );
    const r = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(500);
    expect(r.body.code).toBe('INTERNAL_ERROR');
    expect(r.body.requestId).toBe(r.headers['x-request-id']);
    expect(JSON.stringify(r.body)).not.toContain('PRIVATE_EXCEPTION');
  });
});
