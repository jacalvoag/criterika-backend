import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { AdministrativeReadForbiddenError } from '../../src/database/administrative-read.js';
import { PostgresAuditReadRepository } from '../../src/modules/audit/repositories/audit-read.repository.js';
import { PostgresMaintenanceReadRepository } from '../../src/modules/system/repositories/maintenance-read.repository.js';
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
  max: 1,
  statement_timeout: 6000,
});
const operator = new Pool({
  connectionString: adminUrl.toString(),
  max: 1,
  statement_timeout: 6000,
});
const runner = new TransactionRunner(pool),
  audit = new PostgresAuditReadRepository(),
  maintenance = new PostgresMaintenanceReadRepository();
const adminId = '00000000-0000-4000-8000-000000000001';
const eventId = (n: number) =>
  '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const asAdmin = <T>(work: (tx: PoolClient) => Promise<T>) =>
  runner.run(
    { tipo: 'ADMINISTRADOR', actorId: adminId, requestId: randomUUID() },
    work,
  );
beforeAll(async () => {
  await checkDatabaseConnection(pool, false);
});
beforeEach(async () => {
  const { rows } = await operator.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='criterika'",
  );
  if (rows.length !== 53)
    throw new Error('Preparar la migración 0001 en una base desechable.');
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
  await operator.query(
    readFileSync(
      new URL('../migrations/0001_inicial/60_datos_base.sql', import.meta.url),
      'utf8',
    ),
  );
  await operator.query(
    `INSERT INTO criterika.eventos_auditoria
    (id,actor_tipo,administrador_id,accion,recurso_tipo,ocurrido_en,request_id,resultado,expira_en)
    SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ADMINISTRADOR',$1::uuid,
      'PRUEBA_LECTURA','PRUEBA',stamp,gen_random_uuid(),'CONFIRMADO',stamp+interval '1 day'
    FROM generate_series(201,204) n
    CROSS JOIN LATERAL (SELECT date_trunc('second',transaction_timestamp()) +
      (CASE WHEN n>202 THEN 2 ELSE 1 END)*interval '1 microsecond' AS stamp) s`,
    [adminId],
  );
  await operator.query(
    `INSERT INTO criterika.eventos_auditoria
    (id,actor_tipo,accion,recurso_tipo,ocurrido_en,request_id,resultado,expira_en)
    VALUES ($1,'SISTEMA','PRUEBA_LECTURA','PRUEBA',transaction_timestamp()-interval '2 days',
      gen_random_uuid(),'CONFIRMADO',transaction_timestamp()-interval '1 day')`,
    [eventId(205)],
  );
});
afterAll(async () => {
  await pool.end();
  await operator.end();
});
it('pagina establemente por fecha e ID sin perder precisión de microsegundos', async () => {
  const first = await asAdmin((tx) =>
    audit.list(tx, { accion: 'PRUEBA_LECTURA' }, 2),
  );
  expect(first.items.map((r) => r.id)).toEqual([eventId(204), eventId(203)]);
  expect(first.nextPosition?.ocurridoEn).toMatch(/\.000002Z$/);
  const second = await asAdmin((tx) =>
    audit.list(tx, { accion: 'PRUEBA_LECTURA' }, 2, first.nextPosition!),
  );
  expect(second.items.map((r) => r.id)).toEqual([eventId(202), eventId(201)]);
  expect(second.nextPosition).toBeNull();
  expect(first.items[0]).not.toHaveProperty('cursorFecha');
});
it('filtra con parámetros y no interpreta entradas de texto como SQL', async () => {
  const full = await asAdmin((tx) =>
    audit.list(tx, {
      administradorId: adminId,
      recursoTipo: 'PRUEBA',
      accion: 'PRUEBA_LECTURA',
      desde: new Date(Date.now() - 86400000),
      hasta: new Date(Date.now() + 86400000),
    }),
  );
  expect(full.items).toHaveLength(4);
  expect(
    (
      await asAdmin((tx) =>
        audit.list(tx, {
          accion: "x' OR true; DROP TABLE criterika.cuentas; --",
        }),
      )
    ).items,
  ).toEqual([]);
  expect(
    (await asAdmin((tx) => audit.list(tx, { recursoTipo: 'inexistente' })))
      .items,
  ).toEqual([]);
});
it('devuelve detalle o ausencia y excluye evidencia vencida', async () => {
  expect(await asAdmin((tx) => audit.get(tx, eventId(204)))).toMatchObject({
    id: eventId(204),
    administradorId: adminId,
    cambios: [],
  });
  expect(await asAdmin((tx) => audit.get(tx, eventId(205)))).toBeNull();
  expect(await asAdmin((tx) => audit.get(tx, randomUUID()))).toBeNull();
});
it('rechaza consultas sin contexto administrativo y no hereda el contexto de otro uso del pool', async () => {
  await expect(
    runner.run({ tipo: 'SISTEMA', requestId: randomUUID() }, (tx) =>
      audit.list(tx, {}),
    ),
  ).rejects.toBeInstanceOf(AdministrativeReadForbiddenError);
  await asAdmin((tx) => audit.get(tx, eventId(201)));
  const cleared = await pool.query(
    "SELECT nullif(current_setting('criterika.actor_tipo',true),'') AS tipo",
  );
  expect(cleared.rows[0].tipo).toBeNull();
  await expect(
    runner.run({ tipo: 'SISTEMA', requestId: randomUUID() }, (tx) =>
      maintenance.get(tx),
    ),
  ).rejects.toBeInstanceOf(AdministrativeReadForbiddenError);
});
it('no confunde una cuenta deshabilitada con un administrador habilitado', async () => {
  await operator.query(
    "UPDATE criterika.cuentas SET situacion_operativa='CANCELACION_EN_PROCESO' WHERE id=$1",
    [adminId],
  );
  await expect(asAdmin((tx) => audit.list(tx, {}))).rejects.toBeInstanceOf(
    AdministrativeReadForbiddenError,
  );
});
it('rechaza límites e intervalos inválidos', async () => {
  await expect(asAdmin((tx) => audit.list(tx, {}, 101))).rejects.toThrow(
    'Límite',
  );
  await expect(
    asAdmin((tx) =>
      audit.list(tx, {
        desde: new Date('2030-01-01'),
        hasta: new Date('2020-01-01'),
      }),
    ),
  ).rejects.toThrow('Intervalo');
});
it('conserva las cinco tareas pendientes sin simular ejecuciones exitosas', async () => {
  const result = await asAdmin((tx) => maintenance.get(tx));
  expect(result.tareas).toHaveLength(5);
  for (const r of result.tareas)
    expect(r).toMatchObject({
      estado: 'PENDIENTE',
      ultimaEjecucionEn: null,
      ultimoExitoEn: null,
      pendientes: 0,
      codigoError: null,
    });
});
it('muestra un fallo técnico sin filtrar texto privado almacenado como error', async () => {
  await operator.query(`UPDATE criterika.estados_tareas SET estado='ERROR',pendientes=7,
    ultima_ejecucion_en=transaction_timestamp(),codigo_error='password=PRIVATE_SECRET correo@example.invalid' WHERE nombre='INTENTOS'`);
  const result = await asAdmin((tx) => maintenance.get(tx));
  expect(result.tareas[0]).toMatchObject({
    nombre: 'INTENTOS',
    estado: 'ERROR',
    pendientes: 7,
    codigoError: 'TASK_FAILED',
    ultimoExitoEn: null,
  });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_SECRET');
});
it('no inventa una tarea faltante ni devuelve un estado incompleto', async () => {
  await operator.query(
    "DELETE FROM criterika.estados_tareas WHERE nombre='INTENTOS'",
  );
  await expect(asAdmin((tx) => maintenance.get(tx))).rejects.toThrow(
    'Falta el catálogo',
  );
});
