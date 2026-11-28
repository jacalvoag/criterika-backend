import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { checkDatabaseConnection } from '../../src/database/postgres.connection.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
import {
  PostgresPlayerProfileRepository,
  ProfileOwnershipError,
  type PlayerProfileChanges,
} from '../../src/modules/accounts/repositories/player-profile.repository.js';
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
  profiles = new PostgresPlayerProfileRepository();
const player = '00000000-0000-4000-8000-000000000010',
  other = '00000000-0000-4000-8000-000000000011',
  admin = '00000000-0000-4000-8000-000000000001';
const own = <T>(work: (tx: PoolClient) => Promise<T>) =>
  runner.run(
    { tipo: 'JUGADOR', actorId: player, requestId: randomUUID() },
    work,
  );
const read = () => runner.read((tx) => profiles.getOwned(tx, player));
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
});
afterAll(async () => {
  await pool.end();
  await operator.end();
});

it('lee la proyección propia sin credenciales, sesiones ni saldos', async () => {
  const result = await read();
  expect(Object.keys(result!).sort()).toEqual(
    [
      'id',
      'nombre',
      'apellidos',
      'fechaNacimiento',
      'correo',
      'avatarMediaId',
      'situacionOperativa',
      'creadaEn',
      'version',
    ].sort(),
  );
  expect(result).toMatchObject({
    id: player,
    nombre: 'Cuenta ficticia 10',
    apellidos: 'Prueba',
    fechaNacimiento: '2000-01-01',
    correo: 'cuenta10@example.test',
    avatarMediaId: null,
    situacionOperativa: 'HABILITADA',
    version: 1n,
  });
  expect(result?.creadaEn).toBeInstanceOf(Date);
});
it('no proyecta administradores ni cuentas inexistentes como jugadores', async () => {
  for (const id of [admin, randomUUID()]) {
    expect(await runner.read((tx) => profiles.getOwned(tx, id))).toBeNull();
  }
});
it('edita nombre y apellidos sin tocar identidad, credenciales, avatar ni economía', async () => {
  const before = await operator.query(
    'SELECT to_jsonb(c) AS data FROM criterika.cuentas c WHERE id=$1',
    [player],
  );
  const economy = await operator.query(
    'SELECT * FROM criterika.estados_jugador WHERE cuenta_id=$1',
    [player],
  );
  const result = await own((tx) =>
    profiles.updateOwned(tx, player, 1n, {
      nombre: 'José',
      apellidos: 'Calvo Aguilar',
    }),
  );
  expect(result).toMatchObject({
    kind: 'updated',
    profile: { nombre: 'José', apellidos: 'Calvo Aguilar', version: 2n },
  });
  const after = await operator.query(
    'SELECT to_jsonb(c) AS data FROM criterika.cuentas c WHERE id=$1',
    [player],
  );
  expect(after.rows[0].data).toEqual({
    ...before.rows[0].data,
    nombre: 'José',
    apellidos: 'Calvo Aguilar',
    version: 2,
  });
  expect(
    (
      await operator.query(
        'SELECT * FROM criterika.estados_jugador WHERE cuenta_id=$1',
        [player],
      )
    ).rows,
  ).toEqual(economy.rows);
});
it.each(['nombre', 'apellidos'] as const)(
  'permite editar solo %s y devuelve el perfil completo',
  async (field) => {
    const before = await read();
    const result = await own((tx) =>
      profiles.updateOwned(tx, player, 1n, { [field]: 'Valor nuevo' }),
    );
    expect(result).toEqual({
      kind: 'updated',
      profile: { ...before, [field]: 'Valor nuevo', version: 2n },
    });
  },
);
it('conserva Unicode y trata cadenas con sintaxis SQL como valores', async () => {
  const nombre = "José'); DROP TABLE criterika.cuentas; --";
  const result = await own((tx) =>
    profiles.updateOwned(tx, player, 1n, {
      nombre,
      apellidos: '😀'.repeat(120),
    }),
  );
  expect(result).toMatchObject({
    kind: 'updated',
    profile: { nombre, apellidos: '😀'.repeat(120) },
  });
  expect(await read()).not.toBeNull();
});
it.each([
  {},
  { nombre: '' },
  { apellidos: 'a'.repeat(121) },
  { nombre: 'a\0b' },
  { nombre: undefined },
  { nombre: null },
  { nombre: 7 },
  { rol: 'ADMINISTRADOR' },
  { nombre: 'Permitido', correo: 'otro@example.invalid' },
  { version: 99 },
  { gemas_saldo: 999 },
  { fechaNacimiento: '1990-01-01' },
  { avatarMediaId: randomUUID() },
  [],
  null,
])(
  'rechaza edición inválida o campos ajenos al perfil: %j',
  async (changes) => {
    const before = await read();
    await expect(
      own((tx) =>
        profiles.updateOwned(tx, player, 1n, changes as PlayerProfileChanges),
      ),
    ).rejects.toBeInstanceOf(PersistenceInvariantError);
    expect(await read()).toEqual(before);
  },
);
it('rechaza editar el perfil ajeno aunque el actor sea un jugador válido', async () => {
  const before = await runner.read((tx) => profiles.getOwned(tx, other));
  await expect(
    own((tx) => profiles.updateOwned(tx, other, 1n, { nombre: 'Intrusión' })),
  ).rejects.toBeInstanceOf(ProfileOwnershipError);
  expect(await runner.read((tx) => profiles.getOwned(tx, other))).toEqual(
    before,
  );
});
it('no permite usar contexto de sistema, administrador ni conexión sin contexto', async () => {
  for (const context of [
    { tipo: 'SISTEMA' as const, requestId: randomUUID() },
    { tipo: 'ADMINISTRADOR' as const, actorId: admin, requestId: randomUUID() },
  ])
    await expect(
      runner.run(context, (tx) =>
        profiles.updateOwned(tx, player, 1n, { nombre: 'Intrusión' }),
      ),
    ).rejects.toBeInstanceOf(ProfileOwnershipError);
  const tx = await pool.connect();
  try {
    await expect(
      profiles.updateOwned(tx, player, 1n, { nombre: 'Intrusión' }),
    ).rejects.toBeInstanceOf(ProfileOwnershipError);
  } finally {
    tx.release();
  }
  expect((await read())?.version).toBe(1n);
});
it('detecta versión obsoleta sin modificar el perfil', async () => {
  await own((tx) =>
    profiles.updateOwned(tx, player, 1n, { nombre: 'Primera' }),
  );
  const before = await read();
  expect(
    await own((tx) =>
      profiles.updateOwned(tx, player, 1n, { nombre: 'Obsoleta' }),
    ),
  ).toEqual({ kind: 'version_conflict' });
  expect(await read()).toEqual(before);
});
it('serializa dos ediciones simultáneas y solo acepta una con la misma versión', async () => {
  const results = await Promise.all(
    ['Primera', 'Segunda'].map((nombre) =>
      own((tx) => profiles.updateOwned(tx, player, 1n, { nombre })),
    ),
  );
  expect(results.map((r) => r.kind).sort()).toEqual([
    'updated',
    'version_conflict',
  ]);
  const winner = results.find((r) => r.kind === 'updated');
  expect(await read()).toEqual(winner?.profile);
  expect((await read())?.version).toBe(2n);
});
it('revierte la edición y su versión si falla otra operación en la misma transacción', async () => {
  const before = await read();
  await expect(
    own(async (tx) => {
      await profiles.updateOwned(tx, player, 1n, { nombre: 'Se revierte' });
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(await read()).toEqual(before);
});
it('conserva bigint sin redondear versiones mayores que el entero seguro de JavaScript', async () => {
  await operator.query(
    "BEGIN; SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,gen_random_uuid(),'Fixture bigint'); UPDATE criterika.cuentas SET version=9007199254740993 WHERE id='" +
      player +
      "'; COMMIT;",
  );
  expect((await read())?.version).toBe(9007199254740993n);
  expect(
    await own((tx) =>
      profiles.updateOwned(tx, player, 9007199254740993n, {
        nombre: 'Precisa',
      }),
    ),
  ).toMatchObject({ kind: 'updated', profile: { version: 9007199254740994n } });
});
it.each([0n, -1n, 9223372036854775808n, 1 as unknown as bigint])(
  'rechaza versión inválida %s',
  async (version) => {
    await expect(
      own((tx) =>
        profiles.updateOwned(tx, player, version, { nombre: 'Inválida' }),
      ),
    ).rejects.toBeInstanceOf(PersistenceInvariantError);
  },
);
it('rechaza el agotamiento de bigint sin modificar el perfil', async () => {
  await operator.query(
    "BEGIN; SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,gen_random_uuid(),'Fixture límite'); UPDATE criterika.cuentas SET version=9223372036854775807 WHERE id='" +
      player +
      "'; COMMIT;",
  );
  const before = await read();
  await expect(
    own((tx) =>
      profiles.updateOwned(tx, player, 9223372036854775807n, {
        nombre: 'Sin espacio',
      }),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect(await read()).toEqual(before);
});
it('respeta la política SQL vigente: la edición propia no crea eventos administrativos', async () => {
  const audit = () =>
    operator.query('SELECT id FROM criterika.eventos_auditoria ORDER BY id');
  const before = (await audit()).rows;
  await own((tx) => profiles.updateOwned(tx, player, 1n, { nombre: 'Propia' }));
  expect((await audit()).rows).toEqual(before);
});
it('mantiene la situación de cancelación para que accounts aplique la política funcional', async () => {
  await runner.run(
    { tipo: 'ADMINISTRADOR', actorId: admin, requestId: randomUUID() },
    (tx) =>
      tx.query(
        "UPDATE criterika.cuentas SET situacion_operativa='CANCELACION_EN_PROCESO',version=version+1 WHERE id=$1",
        [player],
      ),
  );
  expect(await read()).toMatchObject({
    id: player,
    situacionOperativa: 'CANCELACION_EN_PROCESO',
    version: 2n,
  });
});
it('la auditoría administrativa conserva el vínculo al titular sin copiar nombres personales', async () => {
  const requestId = randomUUID();
  await runner.run({ tipo: 'ADMINISTRADOR', actorId: admin, requestId }, (tx) =>
    tx.query(
      'UPDATE criterika.cuentas SET nombre=$2,apellidos=$3,version=version+1 WHERE id=$1',
      [player, 'Dato personal nuevo', 'Apellido confidencial'],
    ),
  );
  const { rows } = await operator.query(
    `SELECT e.actor_tipo,e.administrador_id,e.accion,e.recurso_tipo,e.recurso_id,e.cambios_permitidos,s.cuenta_id
    FROM criterika.eventos_auditoria e JOIN criterika.auditoria_sujetos s ON s.evento_id=e.id
    WHERE e.request_id=$1 AND s.cuenta_id=$2`,
    [requestId, player],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    actor_tipo: 'ADMINISTRADOR',
    administrador_id: admin,
    accion: 'UPDATE',
    recurso_tipo: 'cuentas',
    recurso_id: player,
    cuenta_id: player,
  });
  const serialized = JSON.stringify(rows[0].cambios_permitidos);
  expect(serialized).toContain('nombre');
  expect(serialized).not.toContain('Dato personal nuevo');
  expect(serialized).not.toContain('Apellido confidencial');
});
it('revierte el cambio administrativo si falla el trigger de auditoría', async () => {
  const before = await read(),
    requestId = randomUUID();
  // Only the operator alters this disposable test database; never a migration or RDS.
  await operator.query(`ALTER TABLE criterika.eventos_auditoria ADD CONSTRAINT perfil_auditoria_falla
    CHECK (accion <> 'UPDATE' OR recurso_tipo <> 'cuentas') NOT VALID`);
  try {
    await expect(
      runner.run({ tipo: 'ADMINISTRADOR', actorId: admin, requestId }, (tx) =>
        tx.query(
          'UPDATE criterika.cuentas SET nombre=$2,version=version+1 WHERE id=$1',
          [player, 'Se revierte'],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await read()).toEqual(before);
    expect(
      (
        await operator.query(
          'SELECT id FROM criterika.eventos_auditoria WHERE request_id=$1',
          [requestId],
        )
      ).rows,
    ).toEqual([]);
  } finally {
    await operator.query(
      'ALTER TABLE criterika.eventos_auditoria DROP CONSTRAINT perfil_auditoria_falla',
    );
  }
});
