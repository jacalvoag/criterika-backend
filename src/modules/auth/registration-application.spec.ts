import type { PoolClient } from 'pg';
import { RegistrationApplication } from './registration-application.js';
import type { RegistrationCommands } from './registration-commands.js';

const tx = {} as PoolClient;
const now = new Date('2026-11-23T12:00:00.000Z');
const key = '880113ab-a5d9-48f3-b190-aa91eae352f9';
const registrationId = 'abcdef12-3456-4000-8000-123456789abc';
const body = {
  nombre: 'Ana',
  apellidos: 'Pérez',
  fechaNacimiento: '2000-01-01',
  correo: 'ANA@example.com',
  contrasena: ' contraseña segura ',
  aceptacion: {
    terminosVersionId: key,
    avisoVersionId: registrationId,
    aceptaTerminos: true,
    reconoceAvisoPresentado: true,
    consienteFinalidadesIds: ['perfil', 'cuenta'],
  },
};

function setup() {
  const start = vi.fn().mockResolvedValue({
    kind: 'success',
    value: {
      id: registrationId,
      expiraEn: now.toISOString(),
      reenvioDisponibleEn: now.toISOString(),
      vigenciaSegundos: 600,
      maximoIntentos: 5,
    },
  });
  const resend = vi.fn();
  const verify = vi.fn();
  const hash = vi.fn().mockResolvedValue('$argon2id$test');
  const getCurrentDocuments = vi
    .fn()
    .mockResolvedValue({ ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' });
  const fingerprint = vi.fn().mockReturnValue(Buffer.alloc(32));
  const execute = vi.fn(async (_intention, _fingerprint, work) => ({
    kind: 'EXECUTED' as const,
    ...(await work(tx, () => now)),
  }));
  const app = new RegistrationApplication({
    commands: { start, resend, verify } as unknown as Pick<
      RegistrationCommands,
      'start' | 'resend' | 'verify'
    >,
    passwords: { hash },
    legalReader: { getCurrentDocuments },
    idempotency: { fingerprint },
    unitOfWork: { execute },
  });
  return {
    app,
    start,
    resend,
    verify,
    hash,
    fingerprint,
    execute,
    getCurrentDocuments,
  };
}

describe('RegistrationApplication', () => {
  it('entrega documentos solo cuando están configurados y publicados', async () => {
    const { app, getCurrentDocuments } = setup();
    await expect(app.getCurrentDocuments()).resolves.toEqual({
      status: 503,
      body: { code: 'LEGAL_CONFIGURATION_MISSING' },
    });
    getCurrentDocuments.mockResolvedValue({
      ok: true,
      value: { terminos: {}, avisoPrivacidad: {} },
    });
    await expect(app.getCurrentDocuments()).resolves.toEqual({
      status: 200,
      body: { terminos: {}, avisoPrivacidad: {} },
    });
  });
  it('normaliza la intención y genera el hash después de la huella y antes de la transacción', async () => {
    const { app, hash, fingerprint, execute, start } = setup();
    const result = await app.start(body, key, now, '192.0.2.1');
    expect(result.status).toBe(202);
    expect(fingerprint).toHaveBeenCalledBefore(hash);
    expect(hash).toHaveBeenCalledBefore(execute);
    expect(fingerprint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        password: body.contrasena,
        normalizedEmail: 'ana@example.com',
        legalSelection: expect.objectContaining({
          purposeCodes: ['cuenta', 'perfil'],
        }),
      }),
    );
    expect(start).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        passwordHash: '$argon2id$test',
        acceptedAt: now,
        ip: '192.0.2.1',
      }),
      now,
    );
    expect(start.mock.calls[0][1]).not.toHaveProperty('password');
  });

  it('recupera un replay sin repetir la operación ni alterar la respuesta', async () => {
    const { app, execute, resend } = setup();
    execute.mockResolvedValueOnce({
      kind: 'REPLAY',
      status: 202,
      body: { id: registrationId },
    });
    await expect(
      app.resend(registrationId.toUpperCase(), key),
    ).resolves.toEqual({
      status: 202,
      body: { id: registrationId },
      replayed: true,
    });
    expect(resend).not.toHaveBeenCalled();
  });

  it('vincula la respuesta sensible únicamente a la cuenta y sesión emitidas', async () => {
    const { app, execute, verify } = setup();
    verify.mockResolvedValue({
      kind: 'success',
      value: {
        usuario: { id: 'player' },
        sessionId: 'session',
        accessToken: 'access',
        refreshToken: 'refresh',
      },
    });
    const result = await app.verify(registrationId, key, { codigo: '001234' });
    expect(result.status).toBe(201);
    const work = execute.mock.calls[0][2];
    const prepared = await work(tx, () => now);
    expect(prepared.sessionBinding).toEqual({
      accountId: 'player',
      sessionId: 'session',
    });
  });

  it('rechaza entradas inválidas sin consultar persistencia', async () => {
    const { app, execute } = setup();
    expect((await app.start(body, undefined, now, '192.0.2.1')).body).toEqual({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(
      (await app.verify(registrationId, key, { codigo: 'abc' })).body,
    ).toEqual({ code: 'VALIDATION_FAILED' });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ['MISMATCH', 409, 'IDEMPOTENCY_KEY_REUSED'],
    ['IN_PROGRESS', 409, 'REQUEST_IN_PROGRESS'],
    ['EXPIRED', 409, 'STATE_CONFLICT'],
    ['REPLAY_DENIED', 403, 'OPERATION_FORBIDDEN'],
  ] as const)(
    'traduce %s sin volver a ejecutar el reenvío',
    async (kind, status, code) => {
      const { app, execute, resend } = setup();
      execute.mockResolvedValueOnce({ kind });
      await expect(app.resend(registrationId, key)).resolves.toEqual({
        status,
        body: { code },
        replayed: false,
      });
      expect(resend).not.toHaveBeenCalled();
    },
  );

  it('conserva el tiempo de espera del reenvío para el borde HTTP', async () => {
    const { app, resend } = setup();
    resend.mockResolvedValue({
      kind: 'rejected',
      code: 'RATE_LIMITED',
      retryAfterSeconds: 30,
    });
    await expect(app.resend(registrationId, key)).resolves.toEqual({
      status: 429,
      body: { code: 'RATE_LIMITED', retryAfterSeconds: 30 },
      replayed: false,
    });
  });
});
