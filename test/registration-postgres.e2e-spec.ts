import { randomUUID } from 'node:crypto';
import { Mailer } from '@nestjs/mail';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { RegistrationMailWorker } from '../src/infrastructure/registration/registration-mail-worker.js';
import { RegistrationOperationsService } from '../src/infrastructure/registration/registration-operations.service.js';
import { RegistrationUnitOfWork } from '../src/infrastructure/registration/registration-unit-of-work.js';

const integrationEnabled = process.env['REGISTRATION_HTTP_TEST'] === '1';

describe.skipIf(!integrationEnabled)(
  'registro HTTP con PostgreSQL local desechable',
  () => {
    let app: INestApplication;
    const send = vi.fn().mockResolvedValue(undefined);

    beforeAll(async () => {
      if (
        process.env['NODE_ENV'] !== 'test' ||
        !['127.0.0.1', 'localhost', '::1'].includes(
          process.env['DB_HOST'] ?? '',
        ) ||
        !/^criterika_prueba_[a-z0-9_]+$/.test(process.env['DB_NAME'] ?? '')
      ) {
        throw new Error('La prueba HTTP requiere una base local desechable.');
      }
      const module = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(Mailer)
        .useValue({ send })
        .compile();
      app = module.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('registra, cuenta un error una sola vez y recupera la sesión tras verificaciones concurrentes', async () => {
      const api = request(app.getHttpServer());
      const health = await api.get('/api/v1/health').expect(200);
      expect(health.body.estado).toBe('OK');
      const documents = await api
        .get('/api/v1/legal/documents/current')
        .expect(200);
      const input = {
        nombre: 'Ana',
        apellidos: 'Prueba',
        fechaNacimiento: '2000-02-29',
        correo: 'http-test@example.invalid',
        contrasena: 'contraseña de prueba',
        aceptacion: {
          terminosVersionId: documents.body.terminos.id,
          avisoVersionId: documents.body.avisoPrivacidad.id,
          aceptaTerminos: true,
          reconoceAvisoPresentado: true,
          consienteFinalidadesIds: ['cuenta'],
        },
      };
      const startKey = randomUUID();
      const unitOfWork = vi.spyOn(app.get(RegistrationUnitOfWork), 'execute');
      const start = await api
        .post('/api/v1/auth/registrations')
        .set('Idempotency-Key', startKey)
        .send(input)
        .expect(202);
      expect(unitOfWork.mock.calls[0][4]).toBe(start.headers['x-request-id']);
      const replayStart = await api
        .post('/api/v1/auth/registrations')
        .set('Idempotency-Key', startKey)
        .send(input)
        .expect(202);
      expect(replayStart.body).toEqual(start.body);
      expect(replayStart.headers['idempotency-replayed']).toBe('true');

      const resend = await api
        .post(`/api/v1/auth/registrations/${start.body.id}/resend`)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(429);
      expect(Number(resend.headers['retry-after'])).toBeGreaterThan(0);

      const worker = app.get(RegistrationMailWorker);
      const stop = new AbortController();
      stop.abort();
      expect(await worker.drain(20, () => new Date(), stop.signal)).toEqual({
        sent: 0,
        failed: 0,
        skipped: 0,
      });
      expect(send).not.toHaveBeenCalled();
      expect(await worker.drain()).toMatchObject({ sent: 1, failed: 0 });
      const message = send.mock.calls[0][0].text as string;
      const code = /código de verificación es (\d{6})/.exec(message)?.[1];
      expect(code).toBeDefined();
      const wrongCode = code === '000000' ? '000001' : '000000';
      const wrongKey = randomUUID();
      const route = `/api/v1/auth/registrations/${start.body.id}/verify`;
      await api
        .post(route)
        .set('Idempotency-Key', wrongKey)
        .send({ codigo: wrongCode })
        .expect(401);
      const wrongReplay = await api
        .post(route)
        .set('Idempotency-Key', wrongKey)
        .send({ codigo: wrongCode })
        .expect(401);
      expect(wrongReplay.headers['idempotency-replayed']).toBe('true');
      const mismatch = await api
        .post(route)
        .set('Idempotency-Key', wrongKey)
        .send({ codigo: code })
        .expect(409);
      expect(mismatch.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      // Four distinct failed intentions leave the fifth and final attempt available.
      for (let index = 0; index < 3; index += 1) {
        await api
          .post(route)
          .set('Idempotency-Key', randomUUID())
          .send({ codigo: wrongCode })
          .expect(401);
      }

      const firstKey = randomUUID();
      const secondKey = randomUUID();
      const concurrent = await Promise.all([
        api.post(route).set('Idempotency-Key', firstKey).send({ codigo: code }),
        api
          .post(route)
          .set('Idempotency-Key', secondKey)
          .send({ codigo: code }),
      ]);
      expect(
        concurrent.map((item) => item.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      const successful =
        concurrent[0].status === 201 ? concurrent[0] : concurrent[1];
      const successfulKey = concurrent[0].status === 201 ? firstKey : secondKey;
      expect(successful.body.usuario.estado).toBe('ACTIVA');
      const replay = await api
        .post(route)
        .set('Idempotency-Key', successfulKey)
        .send({ codigo: code })
        .expect(201);
      expect(replay.body).toEqual(successful.body);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(await app.get(RegistrationOperationsService).cycle(1)).toEqual({
        status: 'ok',
        sent: 0,
        failed: 0,
        skipped: 0,
        responsesPruned: 0,
      });
      expect(send).toHaveBeenCalledOnce();
    });
  },
);
