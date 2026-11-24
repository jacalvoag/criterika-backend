import { RegistrationTransactionLocks } from '../../src/infrastructure/registration/registration-transaction-locks.js';
import 'reflect-metadata';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  randomUUID,
  generateKeyPairSync,
  createHash,
  verify as verifySignature,
} from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { Test } from '@nestjs/testing';
import { Mailer } from '@nestjs/mail';
import { PostgresRegistrationRepository } from '../../src/modules/auth/repositories/registration.repository.js';
import { PostgresAccountRegistrationRepository } from '../../src/modules/accounts/repositories/registration-account.repository.js';
import { PostgresLegalRegistrationRepository } from '../../src/modules/legal/repositories/registration-legal.repository.js';
import { PostgresPlayerSessionRepository } from '../../src/modules/security/repositories/registration-session.repository.js';
import { PostgresRegistrationMailRepository } from '../../src/modules/auth/repositories/registration-mail.repository.js';
import { RegistrationAccountService } from '../../src/modules/accounts/registration-account.service.js';
import { RegistrationLegalService } from '../../src/modules/legal/registration-legal.service.js';
import { RegistrationPlayerSessionsService } from '../../src/modules/security/registration-player-sessions.service.js';
import { RegistrationCommands } from '../../src/modules/auth/registration-commands.js';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { PublicRegistrationIdempotency } from '../../src/database/public-registration-idempotency.js';
import {
  RegistrationUnitOfWork,
  type RegistrationHttpResult,
} from '../../src/infrastructure/registration/registration-unit-of-work.js';
import { RegistrationLegalReader } from '../../src/infrastructure/registration/registration-legal-reader.js';
import {
  RegistrationJwtSigner,
  RegistrationPasswords,
  RegistrationMailProtection,
} from '../../src/infrastructure/registration/registration-crypto.js';
import { RegistrationMailWorker } from '../../src/infrastructure/registration/registration-mail-worker.js';
import { RegistrationInfrastructureModule } from '../../src/infrastructure/registration/registration-infrastructure.module.js';
import { POSTGRES_POOL } from '../../src/database/postgres.pool.js';
import type { JsonValue } from '../../src/database/persistence-values.js';

function testUrl(name: string) {
  const v = process.env[name];
  if (!v) throw new Error('Falta base local desechable de pruebas.');
  const u = new URL(v);
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ||
    !/^\/criterika_prueba_[a-z0-9_]+$/.test(u.pathname)
  )
    throw new Error('Solo se admite base local desechable criterika_prueba_*.');
  return u;
}
const appUrl = testUrl('PERSISTENCE_TEST_URL'),
  adminUrl = testUrl('PERSISTENCE_TEST_ADMIN_URL');
if (
  appUrl.host !== adminUrl.host ||
  appUrl.pathname !== adminUrl.pathname ||
  appUrl.username === adminUrl.username
)
  throw new Error('Separar operador y aplicación en la misma base local.');
const pool = new Pool({
  connectionString: appUrl.toString(),
  max: 8,
  statement_timeout: 6000,
});
const admin = new Pool({
  connectionString: adminUrl.toString(),
  max: 3,
  statement_timeout: 6000,
});
const runner = new TransactionRunner(pool);
const privacy = {
  responsibleName: 'Responsable ficticio',
  contactEmail: 'privacidad@example.invalid',
  postalAddress: 'Domicilio ficticio de pruebas',
};
const repo = new PostgresRegistrationRepository(),
  accountRepo = new PostgresAccountRegistrationRepository(),
  sessionRepo = new PostgresPlayerSessionRepository();
const legalRepo = new PostgresLegalRegistrationRepository(privacy);
const legal = new RegistrationLegalService(legalRepo),
  accounts = new RegistrationAccountService(accountRepo);
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const signer = new RegistrationJwtSigner(
  rsa.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  'test-issuer',
  'test-audience',
  'test-v1',
);
const protection = new RegistrationMailProtection(
  Buffer.alloc(32, 33),
  Buffer.alloc(32, 44),
);
const sessions = new RegistrationPlayerSessionsService(sessionRepo, signer);
const commands = new RegistrationCommands(
  repo,
  legal,
  protection,
  accounts,
  sessions,
);
const idempotency = new PublicRegistrationIdempotency(
  Buffer.alloc(32, 11),
  Buffer.alloc(32, 22),
);
const uow = new RegistrationUnitOfWork(
  runner,
  idempotency,
  sessionRepo,
  new RegistrationTransactionLocks(repo, legalRepo),
);
const fixture = readFileSync(
  new URL('../fixtures/02_registro.sql', import.meta.url),
  'utf8',
);
const now = new Date('2026-11-23T19:00:00Z');
const input = {
  normalizedEmail: 'jugador@example.invalid',
  name: 'Ana',
  surnames: 'Prueba',
  birthDate: '2000-02-29',
  passwordHash: '$argon2id$FICTICIO_NO_AUTENTICABLE',
  acceptedAt: new Date(now.getTime() - 3000),
  ip: '2001:db8::42',
  legalSelection: {
    termsVersionId: '00000000-0000-4000-8000-000000000101',
    privacyVersionId: '00000000-0000-4000-8000-000000000102',
    purposeCodes: ['cuenta'],
  },
};
const system = <T>(f: (tx: PoolClient) => Promise<T>) =>
  runner.run({ tipo: 'SISTEMA', requestId: randomUUID() }, f);
beforeEach(async () => {
  const { rows } = await admin.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='criterika'",
  );
  if (rows.length !== 53) throw new Error('Aplicar primero la migración 0001.');
  await admin.query(
    'TRUNCATE ' +
      rows
        .map((r) => 'criterika."' + r.tablename.replaceAll('"', '""') + '"')
        .join(',') +
      ' CASCADE',
  );
  await admin.query(fixture);
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
async function pending() {
  const out = await system((tx) => commands.start(tx, input, now));
  if (out.kind !== 'success')
    throw new Error('No se pudo preparar registro ficticio');
  const { rows } = await admin.query(
    'SELECT id,mensaje_envio_cifrado FROM criterika.desafios_verificacion WHERE registro_id=$1',
    [out.value.id],
  );
  return {
    id: out.value.id,
    challengeId: rows[0].id as string,
    code: protection.recoverMail(rows[0].id, rows[0].mensaje_envio_cifrado)
      .code,
    response: out.value,
  };
}
async function verify(id: string, code: string, key = randomUUID(), at = now) {
  const intention = { key, route: `/api/v1/auth/registrations/${id}/verify` };
  return uow.execute(
    intention,
    idempotency.fingerprint(intention, { codigo: code }),
    async (tx, clock) => {
      // Acquire every blocking dependency before passing the clock to the functional command.
      await repo.findPendingForUpdate(tx, id);
      await repo.findLatestChallengeForUpdate(tx, id);
      await legalRepo.getCurrentForShare(tx);
      const result = await commands.verify(tx, id, code, clock);
      if (result.kind === 'success')
        return {
          status: 201,
          body: result.value as JsonValue,
          sessionBinding: {
            accountId: result.value.usuario.id,
            sessionId: result.value.sessionId,
          },
        };
      return {
        status: result.code === 'CODE_INVALID' ? 401 : 409,
        body: { code: result.code },
      };
    },
    () => at,
  );
}
async function count(table: string) {
  const allowed = [
    'cuentas',
    'estados_jugador',
    'sesiones',
    'aceptaciones_legales',
    'registros_pendientes',
    'desafios_verificacion',
    'controles_idempotencia',
  ];
  if (!allowed.includes(table)) throw new Error('Tabla de prueba inválida');
  return Number(
    (await admin.query('SELECT count(*) FROM criterika.' + table)).rows[0]
      .count,
  );
}

it('lee documentos consistentes y devuelve falta de configuración sin texto sustituto', async () => {
  const reader = new RegistrationLegalReader(runner, legalRepo);
  const v = await reader.getCurrentDocuments();
  expect(v.ok).toBe(true);
  const absent = new RegistrationLegalReader(
    runner,
    new PostgresLegalRegistrationRepository({
      ...privacy,
      responsibleName: '',
    }),
  );
  expect(await absent.getCurrentDocuments()).toEqual({
    ok: false,
    reason: 'LEGAL_CONFIGURATION_MISSING',
  });
});
it('inicio conserva aceptación original y código protegido, sin crear jugador o sesión', async () => {
  const p = await pending();
  expect(p.response.id).toBe(p.id);
  expect(p.id).not.toBe(p.challengeId);
  const loaded = await system((tx) => repo.findPendingForUpdate(tx, p.id));
  expect(loaded?.acceptance).toEqual({
    ...input.legalSelection,
    acceptedAt: input.acceptedAt,
    ip: input.ip,
  });
  expect(loaded?.birthDate).toBe('2000-02-29');
  expect(await count('cuentas')).toBe(3);
  expect(await count('sesiones')).toBe(0);
  const row = (
    await admin.query('SELECT * FROM criterika.desafios_verificacion')
  ).rows[0];
  expect(row.verificador_hash).toHaveLength(32);
  expect(row.mensaje_envio_cifrado.toString()).not.toContain(p.code);
});
it('idempotencia normaliza objetos y detecta otro cuerpo, sin usar correo/IP como ámbito', async () => {
  const i = { key: randomUUID(), route: '/api/v1/auth/registrations' };
  const work = async (tx: PoolClient) => {
    const r = await commands.start(tx, input, now);
    return { status: 202, body: r } as RegistrationHttpResult;
  };
  const [a, b] = await Promise.all([
    uow.execute(i, idempotency.fingerprint(i, { a: 1, b: 2 }), work, () => now),
    uow.execute(i, idempotency.fingerprint(i, { b: 2, a: 1 }), work, () => now),
  ]);
  expect([a.kind, b.kind].sort()).toEqual(['EXECUTED', 'REPLAY']);
  expect(await count('registros_pendientes')).toBe(1);
  expect(await count('desafios_verificacion')).toBe(1);
  expect(
    (
      await uow.execute(
        i,
        idempotency.fingerprint(i, { a: 2, b: 2 }),
        work,
        () => now,
      )
    ).kind,
  ).toBe('MISMATCH');
});
it('confirma una sola alta con estado inicial, aceptación y sesión reales', async () => {
  const p = await pending();
  const result = await verify(p.id, p.code);
  expect(result.kind).toBe('EXECUTED');
  expect(await count('cuentas')).toBe(4);
  expect(await count('sesiones')).toBe(1);
  const state = (await admin.query('SELECT * FROM criterika.estados_jugador'))
    .rows[0];
  expect(state).toMatchObject({
    gemas_saldo: '0',
    xp_total: '0',
    vidas_totales: 5,
    proxima_regeneracion_en: null,
    racha_ultimo_dia: null,
    racha_contador_hito: 0,
    racha_zona: 'Etc/UTC',
  });
  const acceptance = (
    await admin.query(
      'SELECT *,host(ip) AS address FROM criterika.aceptaciones_legales',
    )
  ).rows[0];
  expect(acceptance.aceptada_en).toEqual(input.acceptedAt);
  expect(acceptance.address).toBe(input.ip);
  if (result.kind !== 'EXECUTED') throw new Error();
  const body = result.body as Record<string, JsonValue>;
  const parts = (body.accessToken as string).split('.');
  expect(
    verifySignature(
      'RSA-SHA256',
      Buffer.from(parts[0] + '.' + parts[1]),
      signer.publicKey,
      Buffer.from(parts[2], 'base64url'),
    ),
  ).toBe(true);
  const s = (await admin.query('SELECT * FROM criterika.sesiones')).rows[0];
  expect(s.refresh_hash).toEqual(
    createHash('sha256')
      .update(body.refreshToken as string, 'ascii')
      .digest(),
  );
  expect(s.expira_en.getTime() - s.creada_en.getTime()).toBe(30 * 86400000);
  expect(
    (
      await admin.query(
        'SELECT cuenta_creada_id FROM criterika.registros_pendientes',
      )
    ).rows[0].cuenta_creada_id,
  ).toBe(s.cuenta_id);
  expect(
    (
      await admin.query(
        'SELECT mensaje_envio_cifrado,usado_en FROM criterika.desafios_verificacion',
      )
    ).rows[0],
  ).toEqual({ mensaje_envio_cifrado: null, usado_en: now });
});
it('reproduce tokens originales antes del código consumido y no duplica sesión', async () => {
  const p = await pending(),
    key = randomUUID();
  const first = await verify(p.id, p.code, key);
  const replay = await verify(p.id, p.code, key);
  expect(replay.kind).toBe('REPLAY');
  if (first.kind !== 'EXECUTED' || replay.kind !== 'REPLAY') throw new Error();
  expect(replay.body).toEqual(first.body);
  expect(await count('sesiones')).toBe(1);
});
it('dos verificaciones con claves distintas producen una sola cuenta y sesión', async () => {
  const p = await pending();
  const results = await Promise.all([
    verify(p.id, p.code),
    verify(p.id, p.code),
  ]);
  expect(
    results.filter((r) => r.kind === 'EXECUTED' && r.status === 201),
  ).toHaveLength(1);
  expect(await count('cuentas')).toBe(4);
  expect(await count('sesiones')).toBe(1);
});
it('replay equivocado no revela tokens y mismo error cuenta una sola intención', async () => {
  const p = await pending(),
    key = randomUUID();
  const wrong = p.code === '000000' ? '999999' : '000000';
  expect((await verify(p.id, wrong, key)).kind).toBe('EXECUTED');
  expect((await verify(p.id, wrong, key)).kind).toBe('REPLAY');
  expect((await verify(p.id, p.code, key)).kind).toBe('MISMATCH');
  expect(
    (
      await admin.query(
        'SELECT intentos_fallidos FROM criterika.desafios_verificacion',
      )
    ).rows[0].intentos_fallidos,
  ).toBe(1);
});
it('cinco códigos incorrectos saturan el contador sin sexto ni alta', async () => {
  const p = await pending();
  for (let n = 0; n < 6; n++)
    await verify(p.id, p.code === '000000' ? '999999' : '000000');
  expect(
    (
      await admin.query(
        'SELECT intentos_fallidos FROM criterika.desafios_verificacion',
      )
    ).rows[0].intentos_fallidos,
  ).toBe(5);
  expect(await count('cuentas')).toBe(3);
});
it('reenvío invalida y borra el mensaje anterior sin extender el pendiente', async () => {
  const p = await pending();
  const later = new Date(now.getTime() + 60000);
  const r = await system((tx) => commands.resend(tx, p.id, () => later));
  expect(r.kind).toBe('success');
  const rows = (
    await admin.query(
      'SELECT * FROM criterika.desafios_verificacion ORDER BY creado_en',
    )
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows[0].usado_en).toEqual(later);
  expect(rows[0].mensaje_envio_cifrado).toBeNull();
  expect(
    (await admin.query('SELECT expira_en FROM criterika.registros_pendientes'))
      .rows[0].expira_en,
  ).toEqual(new Date(now.getTime() + 86400000));
});
it('reenvío prematuro no agrega códigos', async () => {
  const p = await pending();
  const r = await system((tx) =>
    commands.resend(tx, p.id, () => new Date(now.getTime() + 59000)),
  );
  expect(r).toMatchObject({ kind: 'rejected', code: 'RATE_LIMITED' });
  expect(await count('desafios_verificacion')).toBe(1);
});
it('código vencido no crea cuenta', async () => {
  const p = await pending();
  const r = await verify(
    p.id,
    p.code,
    randomUUID(),
    new Date(now.getTime() + 600000),
  );
  expect(r.kind).toBe('EXECUTED');
  if (r.kind === 'EXECUTED') expect(r.body).toEqual({ code: 'CODE_EXPIRED' });
  expect(await count('cuentas')).toBe(3);
});
it('correo ocupado es conflicto controlado y conserva utilizable la transacción', async () => {
  const p = await pending();
  await verify(p.id, p.code);
  const q = await pending();
  const r = await verify(q.id, q.code);
  expect(r.kind).toBe('EXECUTED');
  if (r.kind === 'EXECUTED') expect(r.body).toEqual({ code: 'STATE_CONFLICT' });
  expect(await count('cuentas')).toBe(4);
  expect(await count('sesiones')).toBe(1);
});
it('un fallo al crear la sesión revierte cuenta, estado, aceptación y consumo', async () => {
  const p = await pending();
  const broken = new RegistrationCommands(repo, legal, protection, accounts, {
    issueForNewPlayer: async () => {
      throw new Error('Fallo técnico ficticio');
    },
  });
  await expect(
    system((tx) => broken.verify(tx, p.id, p.code, () => now)),
  ).rejects.toThrow('Fallo técnico');
  expect(await count('cuentas')).toBe(3);
  expect(await count('estados_jugador')).toBe(0);
  expect(await count('aceptaciones_legales')).toBe(0);
  expect(
    (await system((tx) => repo.findPendingForUpdate(tx, p.id)))
      ?.completedAccountId,
  ).toBeNull();
  expect(
    (await admin.query('SELECT usado_en FROM criterika.desafios_verificacion'))
      .rows[0].usado_en,
  ).toBeNull();
});
it('replay se niega después de revocar sesión', async () => {
  const p = await pending(),
    key = randomUUID();
  await verify(p.id, p.code, key);
  await admin.query('UPDATE criterika.sesiones SET revocada_en=$1', [now]);
  expect((await verify(p.id, p.code, key)).kind).toBe('REPLAY_DENIED');
});
it('replay se niega al iniciar cancelación de cuenta', async () => {
  const p = await pending(),
    key = randomUUID();
  await verify(p.id, p.code, key);
  await admin.query(
    "UPDATE criterika.cuentas SET situacion_operativa='CANCELACION_EN_PROCESO' WHERE rol='JUGADOR'",
  );
  expect((await verify(p.id, p.code, key)).kind).toBe('REPLAY_DENIED');
});
it('tokens expiran a cinco minutos y no se reemiten por repetir', async () => {
  const p = await pending(),
    key = randomUUID();
  await verify(p.id, p.code, key);
  expect(
    (await verify(p.id, p.code, key, new Date(now.getTime() + 300000))).kind,
  ).toBe('EXPIRED');
  expect(await count('sesiones')).toBe(1);
  const control = (
    await admin.query('SELECT * FROM criterika.controles_idempotencia')
  ).rows[0];
  expect(control.respuesta_cifrada).toBeNull();
});
it('rollback de idempotencia permite ejecutar la intención que nunca confirmó', async () => {
  const i = { key: randomUUID(), route: '/api/v1/auth/registrations' },
    hash = idempotency.fingerprint(
      { key: '', route: '/api/v1/auth/registrations' },
      {},
    );
  await expect(
    uow.execute(
      i,
      hash,
      async () => {
        throw new Error('Fallo ficticio');
      },
      () => now,
    ),
  ).rejects.toThrow('Fallo ficticio');
  expect(await count('controles_idempotencia')).toBe(0);
  expect(
    (
      await uow.execute(
        i,
        hash,
        async () => ({ status: 202, body: { ok: true } }),
        () => now,
      )
    ).kind,
  ).toBe('EXECUTED');
});
it('una publicación incompatible bloquea confirmación y exige nueva aceptación', async () => {
  const p = await pending();
  await admin.query(
    `UPDATE criterika.versiones_documentos_legales SET es_vigente=false WHERE tipo='TERMINOS'`,
  );
  await admin.query(
    `INSERT INTO criterika.versiones_documentos_legales (tipo,etiqueta_version,contenido_markdown,tipo_cambio,requiere_aceptacion,publicada_en,es_vigente,sha256)
  VALUES ('TERMINOS','prueba-2','Otro texto ficticio','CONTRACTUAL',true,$1,true,sha256(convert_to('Otro texto ficticio','UTF8')))`,
    [now],
  );
  const r = await verify(p.id, p.code);
  if (r.kind !== 'EXECUTED') throw new Error();
  expect(r.body).toEqual({ code: 'LEGAL_VERSION_OUTDATED' });
  expect(await count('cuentas')).toBe(3);
});
it('el GET no cambia filas ni renueva pendientes', async () => {
  await pending();
  const before = (
    await admin.query(
      'SELECT row_to_json(r) AS r FROM criterika.registros_pendientes r',
    )
  ).rows;
  await new RegistrationLegalReader(runner, legalRepo).getCurrentDocuments();
  expect(
    (
      await admin.query(
        'SELECT row_to_json(r) AS r FROM criterika.registros_pendientes r',
      )
    ).rows,
  ).toEqual(before);
});
it('correo fallido queda recuperable y el reintento conserva el mismo código', async () => {
  const p = await pending();
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error('Proveedor con datos que no deben salir'))
    .mockResolvedValue({});
  const worker = new RegistrationMailWorker(
    pool,
    new PostgresRegistrationMailRepository(),
    protection,
    { send },
  );
  expect(await worker.drain(20, () => now)).toEqual({
    sent: 0,
    failed: 1,
    skipped: 0,
  });
  expect(
    (
      await admin.query(
        'SELECT estado_envio FROM criterika.desafios_verificacion',
      )
    ).rows[0].estado_envio,
  ).toBe('ERROR');
  expect(await worker.drain(20, () => now)).toEqual({
    sent: 1,
    failed: 0,
    skipped: 0,
  });
  expect(send.mock.calls[0][0].text).toContain(p.code);
  expect(send.mock.calls[1][0].text).toBe(send.mock.calls[0][0].text);
  expect(
    (
      await admin.query(
        'SELECT mensaje_envio_cifrado FROM criterika.desafios_verificacion',
      )
    ).rows[0].mensaje_envio_cifrado,
  ).toBeNull();
});
it('dos emisores concurrentes solo procesan una entrega', async () => {
  await pending();
  const send = vi.fn().mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 25));
    return {};
  });
  const worker = () =>
    new RegistrationMailWorker(
      pool,
      new PostgresRegistrationMailRepository(),
      protection,
      { send },
    );
  const r = await Promise.all([
    worker().drain(20, () => now),
    worker().drain(20, () => now),
  ]);
  expect(r.reduce((n, x) => n + x.sent, 0)).toBe(1);
  expect(send).toHaveBeenCalledTimes(1);
});
it('el emisor descarta códigos vencidos y borra el mensaje', async () => {
  await pending();
  const send = vi.fn();
  const worker = new RegistrationMailWorker(
    pool,
    new PostgresRegistrationMailRepository(),
    protection,
    { send },
  );
  await worker.drain(20, () => new Date(now.getTime() + 600000));
  expect(send).not.toHaveBeenCalled();
  expect(
    (
      await admin.query(
        'SELECT mensaje_envio_cifrado FROM criterika.desafios_verificacion',
      )
    ).rows[0].mensaje_envio_cifrado,
  ).toBeNull();
});
it('composición Nest resuelve los proveedores reales sin duplicar los servicios', async () => {
  const module = await Test.createTestingModule({
    imports: [RegistrationInfrastructureModule],
  })
    .overrideProvider(POSTGRES_POOL)
    .useValue(new Pool({ connectionString: appUrl.toString() }))
    .compile();
  try {
    expect(module.get(RegistrationCommands)).toBeInstanceOf(
      RegistrationCommands,
    );
    expect(module.get(Mailer)).toBeDefined();
    expect(module.get(RegistrationPasswords)).toBeInstanceOf(
      RegistrationPasswords,
    );
  } finally {
    await module.close();
  }
});

it('el transporte SMTP real entrega por TLS y borra el mensaje protegido', async () => {
  const { createServer } = await import('node:tls');
  const { MailModule, SmtpTransport } = await import('@nestjs/mail');
  // Generate a disposable TLS pair; no private key is stored in Git.
  const temporary = mkdtempSync(join(tmpdir(), 'criterika-smtp-test-'));
  const keyPath = join(temporary, 'private.pem'),
    certPath = join(temporary, 'certificate.pem');
  let cert: Buffer, key: Buffer;
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      { stdio: 'ignore' },
    );
    cert = readFileSync(certPath);
    key = readFileSync(keyPath);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  const messages: string[] = [];
  const sockets = new Set<import('node:tls').TLSSocket>();
  const server = createServer({ key, cert }, (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setEncoding('utf8');
    socket.write('220 localhost test SMTP\r\n');
    let buffer = '',
      data = false,
      message = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') {
            messages.push(message);
            message = '';
            data = false;
            socket.write('250 accepted\r\n');
          } else message += line + '\r\n';
          continue;
        }
        if (line.startsWith('EHLO'))
          socket.write('250-localhost\r\n250 SIZE 100000\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 send data\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error();
  const module = await Test.createTestingModule({
    imports: [
      MailModule.forRoot({
        from: 'criterika@example.invalid',
        retry: false,
        transport: new SmtpTransport({
          url: `smtps://127.0.0.1:${address.port}`,
          tls: { ca: cert },
        }),
      }),
    ],
  }).compile();
  try {
    const p = await pending();
    const worker = new RegistrationMailWorker(
      pool,
      new PostgresRegistrationMailRepository(),
      protection,
      module.get(Mailer),
    );
    expect(await worker.drain(20, () => now)).toEqual({
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(p.code);
    expect(
      (
        await admin.query(
          'SELECT mensaje_envio_cifrado FROM criterika.desafios_verificacion',
        )
      ).rows[0].mensaje_envio_cifrado,
    ).toBeNull();
  } finally {
    await module.close();
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it('rechaza confirmar una respuesta con tokens sin vincular cuenta y sesión', async () => {
  const intention = { key: randomUUID(), route: '/api/v1/auth/registrations' };
  await expect(
    uow.execute(
      intention,
      idempotency.fingerprint(intention, {}),
      async () => ({ status: 201, body: { accessToken: 'ficticio' } }),
      () => now,
    ),
  ).rejects.toThrow('Respuesta sensible sin vinculación');
  expect(await count('controles_idempotencia')).toBe(0);
});
it('depura respuestas vencidas sin permitir otra confirmación de registro', async () => {
  const p = await pending(),
    key = randomUUID();
  await verify(p.id, p.code, key);
  const later = new Date(now.getTime() + 300000);
  expect(
    await system((tx) => idempotency.pruneExpiredResponses(tx, later)),
  ).toBe(1);
  expect((await verify(p.id, p.code, key, later)).kind).toBe('EXPIRED');
  expect(await count('sesiones')).toBe(1);
});
it('la publicación exclusiva espera al lector transaccional de documentos', async () => {
  let notifyRead!: () => void, releaseRead!: () => void;
  const readLocked = new Promise<void>((resolve) => {
    notifyRead = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const reading = system(async (tx) => {
    await legalRepo.getCurrentForShare(tx);
    notifyRead();
    await release;
  });
  await readLocked;
  const other = await admin.connect();
  try {
    await other.query('BEGIN');
    const check = await other.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended('criterika:legal:current:v1',0)) AS acquired",
    );
    expect(check.rows[0].acquired).toBe(false);
  } finally {
    await other.query('ROLLBACK');
    other.release();
    releaseRead();
    await reading;
  }
});
it('revalida el vencimiento del token después de esperar el bloqueo de cuenta', async () => {
  const p = await pending(),
    key = randomUUID();
  await verify(p.id, p.code, key);
  let calls = 0;
  const at = () => {
    calls++;
    return calls < 4 ? now : new Date(now.getTime() + 300000);
  };
  const i = { key, route: `/api/v1/auth/registrations/${p.id}/verify` };
  const result = await uow.execute(
    i,
    idempotency.fingerprint(i, { codigo: p.code }),
    async () => {
      throw new Error('No debe reejecutarse');
    },
    at,
  );
  expect(result.kind).toBe('EXPIRED');
  expect(await count('sesiones')).toBe(1);
});
it('el emisor no entrega después de una verificación o reenvío confirmado', async () => {
  const p = await pending();
  await verify(p.id, p.code);
  const send = vi.fn();
  const worker = new RegistrationMailWorker(
    pool,
    new PostgresRegistrationMailRepository(),
    protection,
    { send },
  );
  expect(await worker.drain(20, () => now)).toEqual({
    sent: 0,
    failed: 0,
    skipped: 0,
  });
  expect(send).not.toHaveBeenCalled();
});
it('replay se niega si la fecha rectificada ya no cumple la mayoría de edad', async () => {
  const p = await pending(),
    key = randomUUID();
  await verify(p.id, p.code, key);
  await admin.query(
    "UPDATE criterika.cuentas SET fecha_nacimiento='2020-02-29' WHERE rol='JUGADOR'",
  );
  expect((await verify(p.id, p.code, key)).kind).toBe('REPLAY_DENIED');
});
