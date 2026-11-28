import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { checkDatabaseConnection } from '../../src/database/postgres.connection.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
import { PostgresPlayerAccountStateRepository } from '../../src/modules/accounts/repositories/player-account-state.repository.js';
import { PostgresPlayerProfileRepository } from '../../src/modules/accounts/repositories/player-profile.repository.js';
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
  states = new PostgresPlayerAccountStateRepository(),
  profiles = new PostgresPlayerProfileRepository();
const player = '00000000-0000-4000-8000-000000000010',
  other = '00000000-0000-4000-8000-000000000011',
  admin = '00000000-0000-4000-8000-000000000001';
const at = new Date('2026-11-28T12:00:00Z'),
  before = new Date(at.getTime() - 1000),
  after = new Date(at.getTime() + 1000);
const read = (id = player, instant = at) =>
  runner.read((tx) => states.getOwned(tx, id, instant));
const administrative = <T>(work: (tx: PoolClient) => Promise<T>) =>
  runner.run(
    { tipo: 'ADMINISTRADOR', actorId: admin, requestId: randomUUID() },
    work,
  );
async function sanction({
  id = randomUUID(),
  who = player,
  tipo = 'TEMPORAL',
  inicio = before,
  vence = after,
  levantada = null,
}: {
  id?: string;
  who?: string;
  tipo?: 'TEMPORAL' | 'BLOQUEO';
  inicio?: Date;
  vence?: Date | null;
  levantada?: Date | null;
} = {}) {
  await administrative((tx) =>
    tx.query(
      `INSERT INTO criterika.sanciones(id,jugador_id,tipo,motivo,administrador_id,inicio,vence_en,levantada_en)
     VALUES($1,$2,$3,'Motivo privado ficticio',$4,$5,$6,$7)`,
      [id, who, tipo, admin, inicio, vence, levantada],
    ),
  );
}
async function restriction({
  who = player,
  codigo = 'cuenta',
  aplicada = before,
  levantada = null,
}: {
  who?: string;
  codigo?: string;
  aplicada?: Date;
  levantada?: Date | null;
} = {}) {
  const requestId = randomUUID(),
    resolution = randomUUID();
  await administrative(async (tx) => {
    await tx.query(
      `INSERT INTO criterika.solicitudes_privacidad(id,folio,titular_cuenta_id,nombre_solicitante,correo_notificaciones,tipo,alcance,descripcion,limite_respuesta_en)
      VALUES($1::uuid,($1::uuid)::text,$2,'Solicitante ficticio','ficticio@example.invalid','OPOSICION','DATOS_ESPECIFICOS','Expediente privado ficticio',$3)`,
      [requestId, who, after],
    );
    await tx.query(
      `INSERT INTO criterika.resoluciones_privacidad(id,solicitud_id,resultado,motivo_privado,fundamento)
      VALUES($1,$2,'PROCEDENTE','Resolución privada ficticia','Fundamento ficticio')`,
      [resolution, requestId],
    );
    await tx.query(
      'INSERT INTO criterika.resolucion_finalidades(resolucion_id,finalidad_codigo) VALUES($1,$2)',
      [resolution, codigo],
    );
    await tx.query(
      `INSERT INTO criterika.restricciones_tratamiento(jugador_id,finalidad_codigo,resolucion_id,aplicada_en,levantada_en)
      VALUES($1,$2,$3,$4,$5)`,
      [who, codigo, resolution, aplicada, levantada],
    );
  });
}
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
  await administrative((tx) =>
    tx.query(`INSERT INTO criterika.finalidades(codigo,descripcion_base,necesaria)
    VALUES('cuenta','Finalidad ficticia de cuenta',true),('juego','Finalidad ficticia de juego',true)`),
  );
});
afterAll(async () => {
  await pool.end();
  await operator.end();
});
it('distingue jugador sin efectos de cuenta inexistente o administrativa', async () => {
  expect(await read()).toEqual({
    cuentaId: player,
    evaluadaEn: at,
    sanciones: [],
    finalidadesRestringidas: [],
  });
  for (const id of [admin, randomUUID()]) expect(await read(id)).toBeNull();
});
it('devuelve únicamente hechos mínimos sin motivos, expedientes, administradores ni credenciales', async () => {
  await sanction();
  await restriction();
  expect(await read()).toEqual({
    cuentaId: player,
    evaluadaEn: at,
    sanciones: [{ tipo: 'TEMPORAL', inicio: before, venceEn: after }],
    finalidadesRestringidas: ['cuenta'],
  });
});
it.each([
  ['inicio exacto', at, after, null, true],
  ['vigente', before, after, null, true],
  ['vencimiento exacto', before, at, null, false],
  ['vencida', before, before, null, false],
  ['levantamiento exacto', before, after, at, false],
  ['levantada', before, after, before, false],
  ['levantamiento posterior', before, after, after, true],
] as const)(
  'filtra sanción temporal: %s',
  async (_label, inicio, vence, levantada, active) => {
    // Keep temporal duration valid even when the chosen boundary is prior to the reference instant.
    const start = vence <= inicio ? new Date(vence.getTime() - 1000) : inicio;
    await sanction({ inicio: start, vence, levantada });
    expect((await read())?.sanciones).toHaveLength(active ? 1 : 0);
  },
);
it('excluye una sanción cuyo inicio realmente está en el futuro', async () => {
  await sanction({ inicio: after, vence: new Date(after.getTime() + 1000) });
  expect((await read())?.sanciones).toEqual([]);
});
it('conserva bloqueos indefinidos y excluye los levantados', async () => {
  await sanction({ tipo: 'BLOQUEO', vence: null });
  await sanction({ tipo: 'BLOQUEO', vence: null, levantada: at });
  expect((await read())?.sanciones).toEqual([
    { tipo: 'BLOQUEO', inicio: before, venceEn: null },
  ]);
});
it.each([
  ['antes de aplicación', after, null, false],
  ['aplicación exacta', at, null, true],
  ['activa', before, null, true],
  ['levantada', before, before, false],
  ['levantamiento exacto', before, at, false],
  ['levantamiento posterior', before, after, true],
] as const)(
  'filtra restricción: %s',
  async (_label, aplicada, levantada, active) => {
    await restriction({ aplicada, levantada });
    expect((await read())?.finalidadesRestringidas).toEqual(
      active ? ['cuenta'] : [],
    );
  },
);
it('no mezcla sanciones ni finalidades de otro jugador', async () => {
  await sanction({ who: other, tipo: 'BLOQUEO', vence: null });
  await restriction({ who: other });
  expect((await read())?.sanciones).toEqual([]);
  expect((await read())?.finalidadesRestringidas).toEqual([]);
  expect((await read(other))?.sanciones).toHaveLength(1);
  expect((await read(other))?.finalidadesRestringidas).toEqual(['cuenta']);
});
it('devuelve todas las sanciones simultáneas sin decidir cuál prevalece', async () => {
  await sanction({ tipo: 'BLOQUEO', vence: null });
  await sanction();
  expect((await read())?.sanciones.map((s) => s.tipo).sort()).toEqual([
    'BLOQUEO',
    'TEMPORAL',
  ]);
});
it('ordena y deduplica finalidades vigentes aunque haya historial', async () => {
  await restriction({ codigo: 'juego' });
  await restriction({ levantada: after });
  await restriction();
  expect((await read())?.finalidadesRestringidas).toEqual(['cuenta', 'juego']);
});
it('no oculta los efectos de una cuenta en cancelación', async () => {
  await sanction();
  await restriction();
  await administrative((tx) =>
    tx.query(
      "UPDATE criterika.cuentas SET situacion_operativa='CANCELACION_EN_PROCESO',version=version+1 WHERE id=$1",
      [player],
    ),
  );
  expect((await read())?.sanciones).toHaveLength(1);
  expect((await read())?.finalidadesRestringidas).toEqual(['cuenta']);
});
it.each([new Date(NaN), null, '2026-11-28'])(
  'rechaza instantes inválidos %s',
  async (invalid) => {
    await expect(read(player, invalid as Date)).rejects.toBeInstanceOf(
      PersistenceInvariantError,
    );
  },
);
it('usa parámetros para la identidad y rechaza texto que no es UUID', async () => {
  await expect(read("' OR true --")).rejects.toMatchObject({ code: '22P02' });
  expect((await read())?.sanciones).toEqual([]);
});
it('consulta efectos y perfil sin escrituras ni eventos nuevos', async () => {
  await sanction();
  await restriction();
  const previous = await operator.query(
    'SELECT id FROM criterika.eventos_auditoria ORDER BY id',
  );
  const result = await runner.read(async (tx) => ({
    profile: await profiles.getOwned(tx, player),
    state: await states.getOwned(tx, player, at),
  }));
  expect(result.profile?.version).toBe(1n);
  expect(result.state?.sanciones).toHaveLength(1);
  expect(
    (
      await operator.query(
        'SELECT id FROM criterika.eventos_auditoria ORDER BY id',
      )
    ).rows,
  ).toEqual(previous.rows);
});
it('conserva el snapshot de perfil y efectos mientras otra transacción confirma cambios', async () => {
  await runner.read(async (tx) => {
    const profile = await profiles.getOwned(tx, player);
    const initial = await states.getOwned(tx, player, at);
    await sanction();
    await restriction();
    await administrative((tx) =>
      tx.query(
        'UPDATE criterika.cuentas SET nombre=$2,version=version+1 WHERE id=$1',
        [player, 'Otro nombre ficticio'],
      ),
    );
    expect(await states.getOwned(tx, player, at)).toEqual(initial);
    expect(await profiles.getOwned(tx, player)).toEqual(profile);
  });
  expect((await read())?.sanciones).toHaveLength(1);
  expect((await read())?.finalidadesRestringidas).toEqual(['cuenta']);
  expect(
    (await runner.read((tx) => profiles.getOwned(tx, player)))?.version,
  ).toBe(2n);
});
