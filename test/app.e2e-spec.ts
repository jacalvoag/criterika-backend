import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { POSTGRES_POOL } from '../src/database/postgres.pool.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Las pruebas HTTP iniciales no dependen de credenciales ni de una BD real.
    for (const [key, value] of Object.entries({
      NODE_ENV: 'test',
      DB_HOST: '127.0.0.1',
      DB_NAME: 'criterika_prueba',
      DB_USER: 'criterika_api_prueba',
      DB_PASSWORD: 'ficticia',
      DB_TLS_MODE: 'disable-local',
      DB_CA_FILE: '',
      DB_PORT: '5432',
      DB_POOL_MAX: '10',
      PORT: '3000',
    }))
      vi.stubEnv(key, value);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(POSTGRES_POOL)
      .useValue({
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              version: 180006,
              schema_ready: true,
              role_allowed: true,
              tls: false,
              tls_version: null,
            },
          ],
        }),
        end: vi.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
});
