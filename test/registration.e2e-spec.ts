import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RegistrationApplication } from '../src/modules/auth/registration-application.js';
import {
  REGISTRATION_RATE_LIMITER,
  RegistrationHttpController,
} from '../src/modules/auth/registration-http.controller.js';

describe('RegistrationHttpController', () => {
  let app: INestApplication;
  const application = {
    getCurrentDocuments: vi.fn(),
    start: vi.fn(),
    resend: vi.fn(),
    verify: vi.fn(),
  };
  const limiter = { check: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    limiter.check.mockResolvedValue({ allowed: true });
    const module = await Test.createTestingModule({
      controllers: [RegistrationHttpController],
      providers: [
        { provide: RegistrationApplication, useValue: application },
        { provide: REGISTRATION_RATE_LIMITER, useValue: limiter },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('entrega la respuesta sin usar la IP que envía el cliente en headers', async () => {
    application.start.mockResolvedValue({
      status: 202,
      body: { id: 'registration' },
      replayed: false,
    });
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/registrations')
      .set('X-Forwarded-For', '203.0.113.77')
      .set('Idempotency-Key', 'key')
      .send({ correo: 'user@example.invalid' })
      .expect(202);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-request-id']).toBeTruthy();
    expect(result.headers['idempotency-replayed']).toBe('false');
    expect(application.start.mock.calls[0][3]).not.toBe('203.0.113.77');
    expect(limiter.check.mock.calls[0][0]).toBe(
      application.start.mock.calls[0][3],
    );
  });

  it('presenta errores con problem+json y el tiempo de espera', async () => {
    application.resend.mockResolvedValue({
      status: 429,
      body: { code: 'RATE_LIMITED', retryAfterSeconds: 30 },
      replayed: false,
    });
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/registrations/example/resend')
      .send({})
      .expect(429);
    expect(result.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(result.headers['retry-after']).toBe('30');
    expect(result.body).toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      requestId: result.headers['x-request-id'],
    });
  });

  it('detiene la solicitud cuando el limitador la rechaza', async () => {
    limiter.check.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const result = await request(app.getHttpServer())
      .get('/api/v1/legal/documents/current')
      .expect(429);
    expect(result.headers['retry-after']).toBe('60');
    expect(application.getCurrentDocuments).not.toHaveBeenCalled();
  });
});
