import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Module } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { POSTGRES_POOL } from '../src/database/postgres.pool.js';
import { PublicRegistrationIdempotency } from '../src/database/public-registration-idempotency.js';
import { RegistrationPasswords } from '../src/infrastructure/registration/registration-crypto.js';
import { RegistrationInfrastructureModule } from '../src/infrastructure/registration/registration-infrastructure.module.js';
import { RegistrationLegalReader } from '../src/infrastructure/registration/registration-legal-reader.js';
import { RegistrationUnitOfWork } from '../src/infrastructure/registration/registration-unit-of-work.js';
import { RegistrationCommands } from '../src/modules/auth/registration-commands.js';

@Module({
  providers: [
    { provide: RegistrationCommands, useValue: {} },
    { provide: RegistrationPasswords, useValue: {} },
    { provide: PublicRegistrationIdempotency, useValue: {} },
    { provide: RegistrationUnitOfWork, useValue: {} },
    {
      provide: RegistrationLegalReader,
      useValue: {
        getCurrentDocuments: async () => ({
          ok: false,
          reason: 'LEGAL_CONFIGURATION_MISSING',
        }),
      },
    },
  ],
  exports: [
    RegistrationCommands,
    RegistrationPasswords,
    PublicRegistrationIdempotency,
    RegistrationUnitOfWork,
    RegistrationLegalReader,
  ],
})
class TestRegistrationInfrastructureModule {}

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
      .overrideModule(RegistrationInfrastructureModule)
      .useModule(TestRegistrationInfrastructureModule)
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

  it('activa la consulta legal con el limitador real de registro', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/legal/documents/current')
      .expect(503)
      .expect('Content-Type', /application\/problem\+json/);
  });

  it('limita los inicios de registro desde la misma dirección', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/registrations')
        .send({})
        .expect(400);
    }
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/registrations')
      .send({})
      .expect(429);
    expect(response.body.code).toBe('RATE_LIMITED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
});
