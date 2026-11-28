import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { PostgresLoginAccountRepository } from '../../src/modules/accounts/repositories/login-account.repository.js';
import { PostgresSessionAccessRepository } from '../../src/modules/security/repositories/session-access.repository.js';
import { PostgresPlayerSessionRepository } from '../../src/modules/security/repositories/registration-session.repository.js';
import { checkDatabaseConnection } from '../../src/database/postgres.connection.js';
function testUrl(name: string) {
  const value = process.env[name];
  if (!value) throw new Error('Falta base local desechable.');
  const u = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ||
    !/^\/criterika_prueba_[a-z0-9_]+$/.test(u.pathname)
  )
    throw new Error(
      'Solo se admite PostgreSQL local desechable criterika_prueba_*.',
    );
  return u;
}
const appUrl = testUrl('PERSISTENCE_TEST_URL'),
  adminUrl = testUrl('PERSISTENCE_TEST_ADMIN_URL');
if (
  appUrl.host !== adminUrl.host ||
  appUrl.pathname !== adminUrl.pathname ||
  appUrl.username === adminUrl.username
)
  throw new Error(
    'Separar operador y aplicación sobre la misma base de pruebas.',
  );
const pool = new Pool({
  connectionString: appUrl.toString(),
  max: 4,
  statement_timeout: 6000,
});
const operator = new Pool({
  connectionString: adminUrl.toString(),
  max: 4,
  statement_timeout: 6000,
});
const runner = new TransactionRunner(pool),
  accounts = new PostgresLoginAccountRepository(),
  sessions = new PostgresSessionAccessRepository(),
  creation = new PostgresPlayerSessionRepository();
const player = '00000000-0000-4000-8000-000000000010',
  other = '00000000-0000-4000-8000-000000000011';
const id = '00000000-0000-4000-8000-000000000510';
const at = new Date('2026-11-27T12:00:00Z'),
  expires = new Date('2026-11-28T12:00:00Z');
const current = Buffer.alloc(32, 1),
  next = Buffer.alloc(32, 2);
const system = <T>(work: (tx: PoolClient) => Promise<T>) =>
  runner.run({ tipo: 'SISTEMA', requestId: randomUUID() }, work);
beforeAll(async () => {
  await checkDatabaseConnection(pool, false);
});
beforeEach(async () => {
  const { rows } = await operator.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='criterika'",
  );
  if (rows.length !== 53)
    throw new Error('Preparar la base desechable con migración 0001.');
  await operator.query(
    'TRUNCATE ' +
      rows
        .map((r) => 'criterika."' + r.tablename.replaceAll('"', '""') + '"')
        .join(',') +
      ' CASCADE',
  );
  await operator.query(
    readFileSync(
      new URL('../fixtures/02_registro.sql', import.meta.url),
      'utf8',
    ),
  );
  await operator.query(`BEGIN;
    SELECT criterika.establecer_contexto('SISTEMA',NULL,gen_random_uuid(),NULL);
    INSERT INTO criterika.cuentas(id,rol,correo_normalizado,correo_presentacion,contrasena_hash,nombre,apellidos,fecha_nacimiento)
    SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'JUGADOR',
      'persona'||n||'@example.invalid','persona'||n||'@example.invalid','$argon2id$FICTICIO_NO_AUTENTICABLE','Nombre ficticio','Prueba','2000-01-01'
    FROM generate_series(10,11) n;
    INSERT INTO criterika.estados_jugador(cuenta_id) SELECT id FROM criterika.cuentas WHERE rol='JUGADOR'; COMMIT;`);
  await system((tx) =>
    creation.create(tx, {
      accountId: player,
      sessionId: id,
      refreshHash: current,
      createdAt: at,
      expiresAt: expires,
    }),
  );
});
afterAll(async () => {
  await pool.end();
  await operator.end();
});
it('consulta credencial interna por correo normalizado y rol sin interpretar SQL', async () => {
  const account = await runner.read((tx) =>
    accounts.findByNormalizedEmail(tx, 'persona10@example.invalid', 'JUGADOR'),
  );
  expect(account).toMatchObject({
    id: player,
    fechaNacimiento: '2000-01-01',
    contrasenaHash: '$argon2id$FICTICIO_NO_AUTENTICABLE',
  });
  expect(
    await runner.read((tx) =>
      accounts.findByNormalizedEmail(
        tx,
        'persona10@example.invalid',
        'ADMINISTRADOR',
      ),
    ),
  ).toBeNull();
  expect(
    await runner.read((tx) =>
      accounts.findByNormalizedEmail(tx, "' OR true --", 'JUGADOR'),
    ),
  ).toBeNull();
  expect(
    await runner.read((tx) =>
      accounts.findByNormalizedEmail(
        tx,
        'admin1@example.invalid',
        'ADMINISTRADOR',
      ),
    ),
  ).not.toBeNull();
});
it('consulta sesión por titular y rol, sin devolver verificadores', async () => {
  const found = await runner.read((tx) =>
    sessions.findActive(tx, player, id, 'JUGADOR', at),
  );
  expect(found).toMatchObject({ id, cuentaId: player, expiraEn: expires });
  expect(found).not.toHaveProperty('refreshHash');
  expect(
    await runner.read((tx) =>
      sessions.findActive(tx, other, id, 'JUGADOR', at),
    ),
  ).toBeNull();
  expect(
    await runner.read((tx) =>
      sessions.findActive(tx, player, id, 'ADMINISTRADOR', at),
    ),
  ).toBeNull();
});
it('rechaza sesión futura o vencida en el instante exacto del límite', async () => {
  expect(
    await runner.read((tx) =>
      sessions.findActive(
        tx,
        player,
        id,
        'JUGADOR',
        new Date(at.getTime() - 1),
      ),
    ),
  ).toBeNull();
  expect(
    await runner.read((tx) =>
      sessions.findActive(tx, player, id, 'JUGADOR', expires),
    ),
  ).toBeNull();
});
it('no habilita una sesión para una cuenta en cancelación', async () => {
  await operator.query(
    "UPDATE criterika.cuentas SET situacion_operativa='CANCELACION_EN_PROCESO' WHERE id=$1",
    [player],
  );
  expect(
    await runner.read((tx) =>
      sessions.findActive(tx, player, id, 'JUGADOR', at),
    ),
  ).toBeNull();
  expect(
    await system((tx) =>
      sessions.rotateRefresh(tx, player, id, current, next, () => at),
    ),
  ).toBe(false);
});
it('rota una vez, conserva el vencimiento absoluto y reconoce el hash anterior', async () => {
  expect(
    await system((tx) =>
      sessions.rotateRefresh(tx, player, id, current, next, () => at),
    ),
  ).toBe(true);
  expect(
    await system((tx) =>
      sessions.rotateRefresh(
        tx,
        player,
        id,
        current,
        Buffer.alloc(32, 3),
        () => at,
      ),
    ),
  ).toBe(false);
  expect(
    await runner.read((tx) => sessions.findRefreshCandidate(tx, current)),
  ).toEqual({ id, cuentaId: player, coincidencia: 'ANTERIOR' });
  expect(
    await runner.read((tx) => sessions.findRefreshCandidate(tx, next)),
  ).toEqual({ id, cuentaId: player, coincidencia: 'ACTUAL' });
  expect(
    (
      await runner.read((tx) =>
        sessions.findActive(tx, player, id, 'JUGADOR', at),
      )
    )?.expiraEn,
  ).toEqual(expires);
});
it('serializa dos rotaciones concurrentes y solo una consume el verificador actual', async () => {
  const results = await Promise.all([
    system((tx) =>
      sessions.rotateRefresh(tx, player, id, current, next, () => at),
    ),
    system((tx) =>
      sessions.rotateRefresh(
        tx,
        player,
        id,
        current,
        Buffer.alloc(32, 3),
        () => at,
      ),
    ),
  ]);
  expect(results.sort()).toEqual([false, true]);
});
it('no revive una sesión vencida o revocada mediante rotación', async () => {
  expect(
    await system((tx) =>
      sessions.rotateRefresh(tx, player, id, current, next, () => expires),
    ),
  ).toBe(false);
  await system((tx) => sessions.revokeOwned(tx, player, id, () => at));
  expect(
    await system((tx) =>
      sessions.rotateRefresh(tx, player, id, current, next, () => at),
    ),
  ).toBe(false);
  expect(
    await runner.read((tx) =>
      sessions.findActive(tx, player, id, 'JUGADOR', at),
    ),
  ).toBeNull();
});
it('revoca solo el titular y conserva la primera fecha de revocación', async () => {
  expect(
    await system((tx) => sessions.revokeOwned(tx, other, id, () => at)),
  ).toBe(false);
  expect(
    await system((tx) => sessions.revokeOwned(tx, player, id, () => at)),
  ).toBe(true);
  expect(
    await system((tx) => sessions.revokeOwned(tx, player, id, () => expires)),
  ).toBe(false);
  const { rows } = await operator.query(
    'SELECT revocada_en FROM criterika.sesiones WHERE id=$1',
    [id],
  );
  expect(rows[0].revocada_en).toEqual(at);
});
it('revoca todas las sesiones de una cuenta sin afectar otra y es repetible', async () => {
  await system((tx) =>
    creation.create(tx, {
      accountId: other,
      sessionId: randomUUID(),
      refreshHash: next,
      createdAt: at,
      expiresAt: expires,
    }),
  );
  expect(await system((tx) => sessions.revokeAll(tx, player, () => at))).toBe(
    1,
  );
  expect(await system((tx) => sessions.revokeAll(tx, player, () => at))).toBe(
    0,
  );
  const { rows } = await operator.query(
    'SELECT revocada_en FROM criterika.sesiones WHERE cuenta_id=$1',
    [other],
  );
  expect(rows[0].revocada_en).toBeNull();
});
it('revierte la rotación cuando la intención completa falla', async () => {
  await expect(
    system(async (tx) => {
      await sessions.rotateRefresh(tx, player, id, current, next, () => at);
      throw new Error('Fallo ficticio');
    }),
  ).rejects.toThrow('Fallo ficticio');
  expect(
    (await runner.read((tx) => sessions.findRefreshCandidate(tx, current)))
      ?.coincidencia,
  ).toBe('ACTUAL');
});
it('rechaza verificadores inválidos o ambiguos', async () => {
  await expect(
    system((tx) =>
      sessions.rotateRefresh(tx, player, id, current, current, () => at),
    ),
  ).rejects.toThrow('nuevo verificador');
  await expect(
    runner.read((tx) => sessions.findRefreshCandidate(tx, Buffer.alloc(16))),
  ).rejects.toThrow('Verificador');
  await system((tx) =>
    creation.create(tx, {
      accountId: other,
      sessionId: randomUUID(),
      refreshHash: current,
      createdAt: at,
      expiresAt: expires,
    }),
  );
  await expect(
    runner.read((tx) => sessions.findRefreshCandidate(tx, current)),
  ).rejects.toThrow('ambiguo');
});
