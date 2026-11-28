import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { checkDatabaseConnection } from '../../src/database/postgres.connection.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
import { PostgresSessionAccessRepository } from '../../src/modules/security/repositories/session-access.repository.js';
import { PostgresPasswordRepository } from '../../src/modules/auth/repositories/password.repository.js';
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
  passwords = new PostgresPasswordRepository();
const player = '00000000-0000-4000-8000-000000000010',
  other = '00000000-0000-4000-8000-000000000011',
  admin = '00000000-0000-4000-8000-000000000001';
const at = new Date('2026-11-28T12:00:00Z'),
  end = new Date(at.getTime() + 600000);
const OLD = '$argon2id$FICTICIO_NO_AUTENTICABLE';
// Valid PHC shape with fictitious bytes. No plaintext or working password is needed by SQL tests.
const phc = (n: number) =>
  '$argon2id$v=19$m=65536,t=3,p=1$' +
  Buffer.alloc(16, n).toString('base64').replaceAll('=', '') +
  '$' +
  Buffer.alloc(32, n).toString('base64').replaceAll('=', '');
const NEW = phc(7),
  NEXT = phc(8),
  verifier = Buffer.alloc(32, 1),
  mail = Buffer.from('CIFRADO_FICTICIO_NO_DESCIFRABLE');
const system = <T>(work: (tx: PoolClient) => Promise<T>) =>
  runner.run({ tipo: 'SISTEMA', requestId: randomUUID() }, work);
const own = <T>(work: (tx: PoolClient) => Promise<T>) =>
  runner.run(
    { tipo: 'JUGADOR', actorId: player, requestId: randomUUID() },
    work,
  );
async function issue(accountId = player, hash = verifier) {
  const id = randomUUID();
  expect(
    await system((tx) =>
      passwords.createRecovery(
        tx,
        { challengeId: id, accountId, verifierHash: hash, encryptedMail: mail },
        () => at,
      ),
    ),
  ).toBe(true);
  return id;
}
const reset = (id: string, hash = verifier, next = NEW, clock = () => at) =>
  system((tx) => passwords.reset(tx, id, hash, next, clock));
const snapshot = async () => ({
  accounts: (
    await operator.query(
      'SELECT id,contrasena_hash,version::text FROM criterika.cuentas ORDER BY id',
    )
  ).rows,
  sessions: (
    await operator.query('SELECT * FROM criterika.sesiones ORDER BY id')
  ).rows,
  challenges: (
    await operator.query(
      'SELECT * FROM criterika.desafios_verificacion ORDER BY id',
    )
  ).rows,
});
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
      new URL('../fixtures/01_flujo_jugable.sql', import.meta.url),
      'utf8',
    ),
  );
  await operator.query(`BEGIN; SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,gen_random_uuid(),'Fixture de contraseñas');
    UPDATE criterika.cuentas SET correo_confirmado_en='2026-11-28T11:00:00Z';
    UPDATE criterika.sesiones SET identidad_confirmada_en='2026-11-28T11:00:00Z'; COMMIT;`);
});
afterAll(async () => {
  await pool.end();
  await operator.end();
});
it('guarda solo verificador y mensaje cifrado, con vencimiento exacto de diez minutos', async () => {
  const id = await issue();
  const { rows } = await operator.query(
    'SELECT * FROM criterika.desafios_verificacion WHERE id=$1',
    [id],
  );
  expect(rows[0]).toMatchObject({
    clase: 'ENLACE_RECUPERACION',
    finalidad: 'RECUPERACION',
    cuenta_id: player,
    correo_destino: 'cuenta10@example.test',
    verificador_hash: verifier,
    mensaje_envio_cifrado: mail,
    creado_en: at,
    expira_en: end,
    usado_en: null,
    estado_envio: 'PENDIENTE',
  });
});
it('restablece hash, sube versión, consume todos los enlaces y revoca solo sesiones del titular', async () => {
  const id = await issue(),
    second = await issue();
  await issue(other);
  expect(await reset(id)).toBe(true);
  const account = await operator.query(
    'SELECT contrasena_hash,version::text FROM criterika.cuentas WHERE id=$1',
    [player],
  );
  expect(account.rows[0]).toEqual({ contrasena_hash: NEW, version: '2' });
  const sessions = await operator.query(
    'SELECT cuenta_id,revocada_en,identidad_confirmada_en FROM criterika.sesiones ORDER BY cuenta_id',
  );
  expect(sessions.rows.find((s) => s.cuenta_id === player)).toMatchObject({
    revocada_en: at,
    identidad_confirmada_en: null,
  });
  expect(sessions.rows.find((s) => s.cuenta_id === other)).toMatchObject({
    revocada_en: null,
  });
  const links = await operator.query(
    'SELECT id,usado_en,mensaje_envio_cifrado FROM criterika.desafios_verificacion WHERE cuenta_id=$1',
    [player],
  );
  expect(links.rows).toHaveLength(2);
  for (const row of links.rows)
    expect(row).toMatchObject({ usado_en: at, mensaje_envio_cifrado: null });
  expect(await reset(second)).toBe(false);
  expect(
    (
      await operator.query(
        'SELECT usado_en FROM criterika.desafios_verificacion WHERE cuenta_id=$1',
        [other],
      )
    ).rows[0].usado_en,
  ).toBeNull();
});
it('rechaza reutilización sin cambiar la nueva credencial', async () => {
  const id = await issue();
  expect(await reset(id)).toBe(true);
  const before = await snapshot();
  expect(await reset(id, verifier, NEXT)).toBe(false);
  expect(await snapshot()).toEqual(before);
});
it('rechaza verificador equivocado o handle inexistente sin efectos', async () => {
  const id = await issue(),
    before = await snapshot();
  expect(await reset(id, Buffer.alloc(32, 2))).toBe(false);
  expect(await reset(randomUUID())).toBe(false);
  expect(await snapshot()).toEqual(before);
});
it.each([
  ['antes de creación', new Date(at.getTime() - 1)],
  ['vencimiento exacto', end],
  ['vencido', new Date(end.getTime() + 1)],
] as const)('rechaza enlace %s', async (_label, now) => {
  const id = await issue(),
    before = await snapshot();
  expect(await reset(id, verifier, NEW, () => now)).toBe(false);
  expect(await snapshot()).toEqual(before);
});
it('acepta justo antes de vencer', async () => {
  const id = await issue();
  expect(
    await reset(id, verifier, NEW, () => new Date(end.getTime() - 1)),
  ).toBe(true);
});
it.each(['clase', 'finalidad'] as const)(
  'no consume desafíos de otra %s',
  async (column) => {
    const id = await issue();
    await system((tx) =>
      tx.query(
        column === 'clase'
          ? "UPDATE criterika.desafios_verificacion SET clase='CODIGO' WHERE id=$1"
          : "UPDATE criterika.desafios_verificacion SET finalidad='LOGIN_ADMIN' WHERE id=$1",
        [id],
      ),
    );
    const before = await snapshot();
    expect(await reset(id)).toBe(false);
    expect(await snapshot()).toEqual(before);
  },
);
it('mantiene los desafíos de otras finalidades al restablecer', async () => {
  const id = await issue(),
    adminChallenge = await issue();
  await system((tx) =>
    tx.query(
      "UPDATE criterika.desafios_verificacion SET finalidad='LOGIN_ADMIN',clase='CODIGO' WHERE id=$1",
      [adminChallenge],
    ),
  );
  expect(await reset(id)).toBe(true);
  expect(
    (
      await operator.query(
        'SELECT usado_en,mensaje_envio_cifrado FROM criterika.desafios_verificacion WHERE id=$1',
        [adminChallenge],
      )
    ).rows[0],
  ).toEqual({ usado_en: null, mensaje_envio_cifrado: mail });
});
it('no emite ni consume recuperación para cuentas en cancelación o correo sin confirmar', async () => {
  for (const column of ['situacion_operativa', 'correo_confirmado_en']) {
    const id = await issue();
    await system((tx) =>
      tx.query(
        column === 'situacion_operativa'
          ? "UPDATE criterika.cuentas SET situacion_operativa='CANCELACION_EN_PROCESO' WHERE id=$1"
          : 'UPDATE criterika.cuentas SET correo_confirmado_en=NULL WHERE id=$1',
        [player],
      ),
    );
    const before = await snapshot();
    expect(await reset(id)).toBe(false);
    expect(
      await system((tx) =>
        passwords.createRecovery(
          tx,
          {
            challengeId: randomUUID(),
            accountId: player,
            verifierHash: verifier,
            encryptedMail: mail,
          },
          () => at,
        ),
      ),
    ).toBe(false);
    expect(await snapshot()).toEqual(before);
    await system((tx) =>
      tx.query(
        "UPDATE criterika.cuentas SET situacion_operativa='HABILITADA',correo_confirmado_en=$2 WHERE id=$1",
        [player, at],
      ),
    );
  }
});
it('no crea desafíos para cuentas inexistentes y permite recuperar administradores sin cambiar su rol', async () => {
  expect(
    await system((tx) =>
      passwords.createRecovery(
        tx,
        {
          challengeId: randomUUID(),
          accountId: randomUUID(),
          verifierHash: verifier,
          encryptedMail: mail,
        },
        () => at,
      ),
    ),
  ).toBe(false);
  expect(await reset(await issue(admin))).toBe(true);
  expect(
    (
      await operator.query(
        'SELECT rol,contrasena_hash FROM criterika.cuentas WHERE id=$1',
        [admin],
      )
    ).rows[0],
  ).toEqual({ rol: 'ADMINISTRADOR', contrasena_hash: NEW });
});
it('dos consumos simultáneos del mismo enlace solo aplican uno', async () => {
  const id = await issue();
  const results = await Promise.all([
    reset(id, verifier, NEW),
    reset(id, verifier, NEXT),
  ]);
  expect(results.sort()).toEqual([false, true]);
  expect(
    (
      await operator.query(
        'SELECT version::text FROM criterika.cuentas WHERE id=$1',
        [player],
      )
    ).rows[0].version,
  ).toBe('2');
});
it('dos enlaces de una cuenta compiten por un único restablecimiento', async () => {
  const a = await issue(),
    b = await issue();
  expect(
    (await Promise.all([reset(a), reset(b, verifier, NEXT)])).sort(),
  ).toEqual([false, true]);
});
it('cambia contraseña propia y revoca también la sesión actual y enlaces pendientes', async () => {
  const id = await issue();
  expect(
    await own((tx) => passwords.changeOwned(tx, player, OLD, NEW, () => at)),
  ).toBe('changed');
  expect(await reset(id)).toBe(false);
  expect(
    (
      await operator.query(
        'SELECT revocada_en FROM criterika.sesiones WHERE cuenta_id=$1',
        [player],
      )
    ).rows[0].revocada_en,
  ).toEqual(at);
});
it('rechaza un hash observado obsoleto sin sobrescribir una recuperación posterior', async () => {
  expect(await reset(await issue())).toBe(true);
  const before = await snapshot();
  expect(
    await own((tx) => passwords.changeOwned(tx, player, OLD, NEXT, () => at)),
  ).toBe('credential_conflict');
  expect(await snapshot()).toEqual(before);
});
it('cambio autenticado y recuperación concurrentes no pisan credenciales verificadas previamente', async () => {
  const id = await issue();
  const results = await Promise.all([
    own((tx) => passwords.changeOwned(tx, player, OLD, NEXT, () => at)),
    reset(id),
  ]);
  expect([
    ['changed', false],
    ['credential_conflict', true],
  ]).toContainEqual(results);
  expect(
    (
      await operator.query(
        'SELECT version::text FROM criterika.cuentas WHERE id=$1',
        [player],
      )
    ).rows[0].version,
  ).toBe('2');
});
it('rechaza editar al otro jugador o usar un contexto público para cambio propio', async () => {
  const before = await snapshot();
  await expect(
    own((tx) => passwords.changeOwned(tx, other, OLD, NEW, () => at)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  await expect(
    system((tx) => passwords.changeOwned(tx, player, OLD, NEW, () => at)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  await expect(
    own((tx) => passwords.reset(tx, randomUUID(), verifier, NEW, () => at)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect(await snapshot()).toEqual(before);
});
it('revoca también sesiones vencidas o fechadas después del instante de cambio', async () => {
  await system((tx) =>
    tx.query(
      'UPDATE criterika.sesiones SET creada_en=$2,expira_en=$3 WHERE cuenta_id=$1',
      [player, end, new Date(end.getTime() + 1000)],
    ),
  );
  expect(await reset(await issue())).toBe(true);
  expect(
    (
      await operator.query(
        'SELECT revocada_en FROM criterika.sesiones WHERE cuenta_id=$1',
        [player],
      )
    ).rows[0].revocada_en,
  ).toEqual(at);
});
it('revierte consumo, hash, versión y sesiones si la transacción exterior falla', async () => {
  const id = await issue(),
    before = await snapshot();
  await expect(
    system(async (tx) => {
      expect(await passwords.reset(tx, id, verifier, NEW, () => at)).toBe(true);
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(await snapshot()).toEqual(before);
  expect(await reset(id)).toBe(true);
});
it('revierte cambios previos si falla la revocación de sesiones', async () => {
  const id = await issue(),
    before = await snapshot();
  await operator.query(
    'ALTER TABLE criterika.sesiones ADD CONSTRAINT prueba_password_revocacion CHECK(revocada_en IS NULL) NOT VALID',
  );
  try {
    await expect(reset(id)).rejects.toMatchObject({ code: '23514' });
    expect(await snapshot()).toEqual(before);
  } finally {
    await operator.query(
      'ALTER TABLE criterika.sesiones DROP CONSTRAINT prueba_password_revocacion',
    );
  }
});
it('revierte todo si falla la invalidación de otro enlace pendiente', async () => {
  const id = await issue(),
    second = await issue(),
    before = await snapshot();
  await operator.query(
    `ALTER TABLE criterika.desafios_verificacion ADD CONSTRAINT prueba_password_enlace CHECK(id<>'${second}'::uuid OR usado_en IS NULL) NOT VALID`,
  );
  try {
    await expect(reset(id)).rejects.toMatchObject({ code: '23514' });
    expect(await snapshot()).toEqual(before);
  } finally {
    await operator.query(
      'ALTER TABLE criterika.desafios_verificacion DROP CONSTRAINT prueba_password_enlace',
    );
  }
});
it.each([Buffer.alloc(16), Buffer.alloc(0)])(
  'rechaza verificadores de longitud inválida',
  async (hash) => {
    await expect(reset(randomUUID(), hash)).rejects.toBeInstanceOf(
      PersistenceInvariantError,
    );
  },
);
it.each(['texto en claro', '', '$argon2id$incompleto'])(
  'rechaza hash nuevo inválido sin consumir el enlace',
  async (next) => {
    const id = await issue(),
      before = await snapshot();
    await expect(reset(id, verifier, next)).rejects.toBeInstanceOf(
      PersistenceInvariantError,
    );
    expect(await snapshot()).toEqual(before);
  },
);
it('rechaza reloj inválido y revierte cambios sin gastar el enlace', async () => {
  const id = await issue(),
    before = await snapshot();
  await expect(
    reset(id, verifier, NEW, () => new Date(NaN)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect(await snapshot()).toEqual(before);
});
it('lee el hash propio para comparación interna y no proyecta administradores', async () => {
  expect(
    await runner.read((tx) => passwords.findOwnedCredential(tx, player)),
  ).toBe(OLD);
  for (const id of [admin, randomUUID()])
    expect(
      await runner.read((tx) => passwords.findOwnedCredential(tx, id)),
    ).toBeNull();
});
it('rechaza mensaje vacío al emitir y hash idéntico al cambiar', async () => {
  const before = await snapshot();
  await expect(
    system((tx) =>
      passwords.createRecovery(
        tx,
        {
          challengeId: randomUUID(),
          accountId: player,
          verifierHash: verifier,
          encryptedMail: Buffer.alloc(0),
        },
        () => at,
      ),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  await expect(
    own((tx) => passwords.changeOwned(tx, player, NEW, NEW, () => at)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect(await snapshot()).toEqual(before);
});
it('una rotación concurrente de refresh no deja la sesión utilizable tras restablecer', async () => {
  const id = await issue(),
    sessions = new PostgresSessionAccessRepository();
  const sessionId = '00000000-0000-4000-8000-000000000510';
  const results = await Promise.all([
    reset(id),
    system((tx) =>
      sessions.rotateRefresh(
        tx,
        player,
        sessionId,
        Buffer.alloc(32, 0xab),
        Buffer.alloc(32, 9),
        () => at,
      ),
    ),
  ]);
  expect(results[0]).toBe(true);
  expect(
    await runner.read((tx) =>
      sessions.findActive(tx, player, sessionId, 'JUGADOR', at),
    ),
  ).toBeNull();
});
it('vuelve a evaluar el vencimiento después de esperar el bloqueo de cuenta', async () => {
  const id = await issue(),
    blocker = await operator.connect();
  let observed = at;
  const clock = vi.fn(() => observed);
  let announce!: (pid: number) => void;
  const started = new Promise<number>((resolve) => {
    announce = resolve;
  });
  let attempt: Promise<boolean> | undefined;
  let released = false;
  try {
    await blocker.query('BEGIN');
    await blocker.query(
      'SELECT id FROM criterika.cuentas WHERE id=$1 FOR UPDATE',
      [player],
    );
    attempt = system(async (tx) => {
      const { rows } = await tx.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      announce(rows[0].pid);
      return passwords.reset(tx, id, verifier, NEW, clock);
    });
    const pid = await started;
    let blocked = false;
    // Poll the actual server lock condition, without time-based sleeps or mocked SQL.
    for (let n = 0; n < 100 && !blocked; n++) {
      const { rows } = await operator.query<{ blocked: boolean }>(
        "SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",
        [pid],
      );
      blocked = rows[0]?.blocked === true;
    }
    expect(blocked).toBe(true);
    expect(clock).not.toHaveBeenCalled();
    observed = end;
    await blocker.query('COMMIT');
    released = true;
    expect(await attempt).toBe(false);
    expect(clock).toHaveBeenCalledOnce();
    expect(
      (
        await operator.query(
          'SELECT usado_en FROM criterika.desafios_verificacion WHERE id=$1',
          [id],
        )
      ).rows[0].usado_en,
    ).toBeNull();
  } finally {
    if (!released) await blocker.query('ROLLBACK');
    blocker.release();
    if (attempt) await attempt.catch(() => {});
  }
});
