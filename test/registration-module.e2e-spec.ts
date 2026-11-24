import { Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PublicRegistrationIdempotency } from '../src/database/public-registration-idempotency.js';
import { RegistrationPasswords } from '../src/infrastructure/registration/registration-crypto.js';
import { RegistrationInfrastructureModule } from '../src/infrastructure/registration/registration-infrastructure.module.js';
import { RegistrationLegalReader } from '../src/infrastructure/registration/registration-legal-reader.js';
import { RegistrationUnitOfWork } from '../src/infrastructure/registration/registration-unit-of-work.js';
import { RegistrationCommands } from '../src/modules/auth/registration-commands.js';
import { REGISTRATION_RATE_LIMITER } from '../src/modules/auth/registration-http.controller.js';
import { RegistrationHttpModule } from '../src/modules/auth/registration-http.module.js';

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
class TestInfrastructureModule {}

describe('RegistrationHttpModule', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app?.close();
  });

  it('compone el controlador con las capacidades exportadas y exige un limitador', async () => {
    const module = await Test.createTestingModule({
      imports: [
        RegistrationHttpModule.register({
          provide: REGISTRATION_RATE_LIMITER,
          useValue: { check: async () => ({ allowed: true }) },
        }),
      ],
    })
      .overrideModule(RegistrationInfrastructureModule)
      .useModule(TestInfrastructureModule)
      .compile();
    app = module.createNestApplication();
    await app.init();
    const result = await request(app.getHttpServer())
      .get('/api/v1/legal/documents/current')
      .expect(503);
    expect(result.body.code).toBe('LEGAL_CONFIGURATION_MISSING');
  });
});
