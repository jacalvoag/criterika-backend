import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { checkDatabaseConnection } from '../../src/database/postgres.connection.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
import { PostgresLegalRegistrationRepository } from '../../src/modules/legal/repositories/registration-legal.repository.js';
import { RegistrationLegalService } from '../../src/modules/legal/registration-legal.service.js';
import {
  PostgresLegalAcceptanceRepository,
  AcceptancePositionError,
} from '../../src/modules/legal/repositories/legal-acceptance.repository.js';
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
const runner = new TransactionRunner(pool);
const configuration = {
  responsibleName: 'Responsable ficticio',
  contactEmail: 'ficticio@example.invalid',
  postalAddress: 'Domicilio ficticio',
};
const documents = new PostgresLegalRegistrationRepository(configuration),
  acceptances = new PostgresLegalAcceptanceRepository(
    new RegistrationLegalService(documents),
  );
const player = '00000000-0000-4000-8000-000000000010',
  other = '00000000-0000-4000-8000-000000000011',
  admin = '00000000-0000-4000-8000-000000000001';
const terms = '00000000-0000-4000-8000-000000000101',
  privacy = '00000000-0000-4000-8000-000000000102';
const at = new Date('2026-11-28T12:00:00Z');
const body = () => ({
  terminosVersionId: terms,
  avisoVersionId: privacy,
  aceptaTerminos: true,
  reconoceAvisoPresentado: true,
  consienteFinalidadesIds: ['cuenta'],
});
const own = <T>(work: (tx: PoolClient) => Promise<T>, id = player) =>
  runner.run({ tipo: 'JUGADOR', actorId: id, requestId: randomUUID() }, work);
const system = <T>(work: (tx: PoolClient) => Promise<T>) =>
  runner.run({ tipo: 'SISTEMA', requestId: randomUUID() }, work);
const create = (input: unknown = body(), ip = '192.0.2.10', clock = () => at) =>
  own((tx) => acceptances.createOwned(tx, player, input, ip, clock));
const list = (id = player, limit = 20, after?: { acceptanceId: string }) =>
  runner.read((tx) => acceptances.listOwned(tx, id, limit, after));
const evidence = async () => ({
  rows: (
    await operator.query(
      'SELECT * FROM criterika.aceptaciones_legales ORDER BY id',
    )
  ).rows,
  purposes: (
    await operator.query(
      'SELECT * FROM criterika.aceptacion_finalidades ORDER BY aceptacion_id,finalidad_codigo',
    )
  ).rows,
});
async function seed(id: string, stamp: string) {
  await system(async (tx) => {
    await tx.query(
      `INSERT INTO criterika.aceptaciones_legales(id,cuenta_id,terminos_version_id,aviso_version_id,acepta_terminos,reconoce_aviso_presentado,aceptada_en,ip)
      VALUES($1,$2,$3,$4,true,true,$5::timestamptz,'192.0.2.20')`,
      [id, player, terms, privacy, stamp],
    );
    await tx.query(
      'INSERT INTO criterika.aceptacion_finalidades(aceptacion_id,aviso_version_id,finalidad_codigo) VALUES($1,$2,$3)',
      [id, privacy, 'cuenta'],
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
      new URL('../fixtures/02_registro.sql', import.meta.url),
      'utf8',
    ),
  );
  await operator.query(`BEGIN; SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,gen_random_uuid(),'Fixtures de aceptaciones');
    INSERT INTO criterika.cuentas(id,rol,correo_normalizado,correo_presentacion,contrasena_hash,nombre,apellidos,fecha_nacimiento)
      SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'JUGADOR','persona'||n||'@example.invalid','persona'||n||'@example.invalid','$argon2id$FICTICIO_NO_AUTENTICABLE','Nombre ficticio','Prueba','2000-01-01' FROM generate_series(10,11) n;
    INSERT INTO criterika.estados_jugador(cuenta_id) SELECT id FROM criterika.cuentas WHERE rol='JUGADOR'; COMMIT;`);
});
afterAll(async () => {
  await pool.end();
  await operator.end();
});
it('reutiliza consulta por versión publicada, incluidos documentos que ya no son vigentes', async () => {
  const initial = await runner.read((tx) =>
    documents.getPublishedDocument(tx, terms),
  );
  expect(initial?.sha256).toEqual(
    createHash('sha256').update(initial!.markdown, 'utf8').digest(),
  );
  await operator.query(
    `UPDATE criterika.versiones_documentos_legales SET es_vigente=false WHERE id='${terms}'`,
  );
  expect(
    await runner.read((tx) => documents.getPublishedDocument(tx, terms)),
  ).toEqual(initial);
});
it('no expone borradores ni documentos inexistentes', async () => {
  const id = randomUUID();
  await operator.query(
    `INSERT INTO criterika.versiones_documentos_legales(id,tipo,etiqueta_version,contenido_markdown,tipo_cambio,requiere_aceptacion)
    VALUES($1,'TERMINOS','borrador-ficticio','Texto privado ficticio de borrador.','CONTRACTUAL',true)`,
    [id],
  );
  for (const value of [id, randomUUID()])
    expect(
      await runner.read((tx) => documents.getPublishedDocument(tx, value)),
    ).toBeNull();
});
it('crea evidencia explícita con IP y hora del servidor y sus finalidades', async () => {
  const result = await create();
  expect(result).toMatchObject({
    ok: true,
    value: {
      usuarioId: player,
      aceptadaEn: at,
      ip: '192.0.2.10',
      terminosVersionId: terms,
      avisoVersionId: privacy,
      aceptaTerminos: true,
      reconoceAvisoPresentado: true,
      consienteFinalidadesIds: ['cuenta'],
    },
  });
  expect((await list()).items).toEqual(result.ok ? [result.value] : []);
});
it('conserva cada manifestación sin sobrescribir evidencia anterior', async () => {
  const first = await create(),
    second = await create(
      body(),
      '2001:db8::1',
      () => new Date(at.getTime() + 1),
    );
  expect(first.ok && second.ok && first.value.id !== second.value.id).toBe(
    true,
  );
  expect((await list()).items.map((item) => item.ip)).toEqual([
    '2001:db8::1',
    '192.0.2.10',
  ]);
});
it.each([
  null,
  {},
  { ...body(), aceptaTerminos: false },
  { ...body(), reconoceAvisoPresentado: false },
  { ...body(), usuarioId: other },
  { ...body(), ip: '203.0.113.1' },
  { ...body(), aceptadaEn: '2000-01-01T00:00:00Z' },
  { ...body(), consienteFinalidadesIds: [] },
  { ...body(), consienteFinalidadesIds: ['cuenta', 'cuenta'] },
])('rechaza manifestaciones o campos no permitidos %j', async (input) => {
  expect(await create(input)).toEqual({
    ok: false,
    reason: 'INVALID_ACCEPTANCE',
  });
  expect((await evidence()).rows).toEqual([]);
});
it('rechaza una finalidad ajena al aviso sin insertar evidencia parcial', async () => {
  expect(
    await create({ ...body(), consienteFinalidadesIds: ['ajena'] }),
  ).toEqual({ ok: false, reason: 'INVALID_PURPOSES' });
  expect((await evidence()).rows).toEqual([]);
});
it('exige todas las finalidades necesarias declaradas en el aviso vigente', async () => {
  await operator.query(`BEGIN; UPDATE criterika.versiones_documentos_legales SET publicada_en=NULL,es_vigente=false WHERE id='${privacy}';
    INSERT INTO criterika.finalidades(codigo,descripcion_base,necesaria) VALUES('aprendizaje','Finalidad ficticia',true);
    INSERT INTO criterika.documento_finalidades(documento_version_id,finalidad_codigo,descripcion_presentada) VALUES('${privacy}','aprendizaje','Texto ficticio presentado');
    UPDATE criterika.versiones_documentos_legales SET publicada_en='2026-11-23T00:00:00Z',es_vigente=true WHERE id='${privacy}'; COMMIT;`);
  expect(await create()).toEqual({ ok: false, reason: 'INVALID_PURPOSES' });
  const result = await create({
    ...body(),
    consienteFinalidadesIds: ['cuenta', 'aprendizaje'],
  });
  expect(result).toMatchObject({
    ok: true,
    value: { consienteFinalidadesIds: ['aprendizaje', 'cuenta'] },
  });
});
it('rechaza versiones desactualizadas o tipos intercambiados', async () => {
  for (const input of [
    { ...body(), terminosVersionId: randomUUID() },
    { ...body(), terminosVersionId: privacy, avisoVersionId: terms },
  ])
    expect(await create(input)).toEqual({
      ok: false,
      reason: 'LEGAL_VERSION_OUTDATED',
    });
  expect((await evidence()).rows).toEqual([]);
});
it('falla cerrado si faltan documentos vigentes o configuración operativa', async () => {
  const missing = new PostgresLegalAcceptanceRepository(
    new RegistrationLegalService(
      new PostgresLegalRegistrationRepository({
        ...configuration,
        contactEmail: '',
      }),
    ),
  );
  expect(
    await own((tx) =>
      missing.createOwned(tx, player, body(), '192.0.2.10', () => at),
    ),
  ).toEqual({ ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' });
  await operator.query(
    `UPDATE criterika.versiones_documentos_legales SET es_vigente=false WHERE id='${privacy}'`,
  );
  expect(await create()).toEqual({
    ok: false,
    reason: 'LEGAL_CONFIGURATION_MISSING',
  });
});
it('no mezcla historial ni acepta cursores de otro titular', async () => {
  const first = await create();
  await own(
    (tx) => acceptances.createOwned(tx, other, body(), '192.0.2.30', () => at),
    other,
  );
  expect((await list()).items).toHaveLength(1);
  expect((await list(other)).items).toHaveLength(1);
  if (!first.ok) throw new Error('Falta evidencia');
  await expect(
    list(other, 1, { acceptanceId: first.value.id }),
  ).rejects.toBeInstanceOf(AcceptancePositionError);
});
it('rechaza actor ajeno, público o administrativo para crear aceptación de jugador', async () => {
  await expect(
    own((tx) =>
      acceptances.createOwned(tx, other, body(), '192.0.2.10', () => at),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  await expect(
    system((tx) =>
      acceptances.createOwned(tx, player, body(), '192.0.2.10', () => at),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  await expect(
    runner.run(
      { tipo: 'ADMINISTRADOR', actorId: admin, requestId: randomUUID() },
      (tx) =>
        acceptances.createOwned(tx, player, body(), '192.0.2.10', () => at),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect((await evidence()).rows).toEqual([]);
});
it.each(['192.0.2.10/24', 'correo@example.invalid', ''])(
  'rechaza IP no individual %s',
  async (ip) => {
    await expect(create(body(), ip)).rejects.toBeInstanceOf(
      PersistenceInvariantError,
    );
    expect((await evidence()).rows).toEqual([]);
  },
);
it('rechaza reloj inválido sin crear filas', async () => {
  await expect(
    create(body(), '192.0.2.10', () => new Date(NaN)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect((await evidence()).rows).toEqual([]);
});
it('pagina sin omitir microsegundos dentro del mismo milisegundo', async () => {
  const ids = [
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000203',
  ];
  for (let i = 0; i < 3; i++)
    await seed(ids[i], `2026-11-28T12:00:00.00000${i + 1}Z`);
  const found: string[] = [];
  let position: { acceptanceId: string } | null = null;
  for (let i = 0; i < 3; i++) {
    const page = await list(player, 1, position ?? undefined);
    found.push(...page.items.map((row) => row.id));
    position = page.nextPosition;
  }
  expect(found).toEqual([...ids].reverse());
  expect(position).toBeNull();
});
it('desempata fechas iguales por UUID descendente', async () => {
  for (let i = 1; i <= 3; i++)
    await seed(
      '00000000-0000-4000-8000-' + String(300 + i).padStart(12, '0'),
      at.toISOString(),
    );
  const first = await list(player, 2),
    second = await list(player, 2, first.nextPosition!);
  expect([...first.items, ...second.items].map((r) => r.id)).toEqual(
    [303, 302, 301].map(
      (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'),
    ),
  );
  expect(second.nextPosition).toBeNull();
});
it.each([0, 101, 1.5, NaN])('rechaza límite inválido %s', async (limit) => {
  await expect(list(player, limit)).rejects.toBeInstanceOf(
    PersistenceInvariantError,
  );
});
it('devuelve vacío para cuenta inexistente o administrativa y rechaza ancla inexistente', async () => {
  for (const id of [randomUUID(), admin])
    expect((await list(id)).items).toEqual([]);
  await expect(
    list(player, 20, { acceptanceId: randomUUID() }),
  ).rejects.toBeInstanceOf(AcceptancePositionError);
});
it('revierte evidencia y finalidades si falla la transacción exterior', async () => {
  await expect(
    own(async (tx) => {
      expect(
        (
          await acceptances.createOwned(
            tx,
            player,
            body(),
            '192.0.2.10',
            () => at,
          )
        ).ok,
      ).toBe(true);
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(await evidence()).toEqual({ rows: [], purposes: [] });
});
it('revierte la cabecera de aceptación si falla la inserción de finalidades', async () => {
  await operator.query(
    'ALTER TABLE criterika.aceptacion_finalidades ADD CONSTRAINT prueba_aceptacion_falla CHECK(false) NOT VALID',
  );
  try {
    await expect(create()).rejects.toMatchObject({ code: '23514' });
    expect(await evidence()).toEqual({ rows: [], purposes: [] });
  } finally {
    await operator.query(
      'ALTER TABLE criterika.aceptacion_finalidades DROP CONSTRAINT prueba_aceptacion_falla',
    );
  }
});
it('protege evidencia histórica frente a modificaciones del rol de aplicación', async () => {
  const result = await create();
  if (!result.ok) throw new Error('Falta evidencia');
  await expect(
    own((tx) =>
      tx.query('UPDATE criterika.aceptaciones_legales SET ip=$2 WHERE id=$1', [
        result.value.id,
        '192.0.2.40',
      ]),
    ),
  ).rejects.toMatchObject({ code: '55000' });
  await expect(
    own((tx) =>
      tx.query('DELETE FROM criterika.aceptaciones_legales WHERE id=$1', [
        result.value.id,
      ]),
    ),
  ).rejects.toMatchObject({ code: '55000' });
  expect((await list()).items).toEqual([result.value]);
});
it('dos manifestaciones explícitas diferentes conservan ambas evidencias', async () => {
  const results = await Promise.all([create(), create()]);
  expect(results.every((r) => r.ok)).toBe(true);
  expect((await list()).items).toHaveLength(2);
});
it('una nueva aceptación no levanta restricciones de privacidad existentes', async () => {
  const request = randomUUID(),
    resolution = randomUUID();
  await runner.run(
    { tipo: 'ADMINISTRADOR', actorId: admin, requestId: randomUUID() },
    async (tx) => {
      await tx.query(
        `INSERT INTO criterika.solicitudes_privacidad(id,folio,titular_cuenta_id,nombre_solicitante,correo_notificaciones,tipo,alcance,descripcion,limite_respuesta_en)
      VALUES($1::uuid,($1::uuid)::text,$2,'Solicitante ficticio','ficticio@example.invalid','OPOSICION','DATOS_ESPECIFICOS','Solicitud ficticia',$3)`,
        [request, player, at],
      );
      await tx.query(
        `INSERT INTO criterika.resoluciones_privacidad(id,solicitud_id,resultado,motivo_privado,fundamento)
      VALUES($1,$2,'PROCEDENTE','Motivo ficticio','Fundamento ficticio')`,
        [resolution, request],
      );
      await tx.query(
        "INSERT INTO criterika.resolucion_finalidades(resolucion_id,finalidad_codigo) VALUES($1,'cuenta')",
        [resolution],
      );
      await tx.query(
        "INSERT INTO criterika.restricciones_tratamiento(jugador_id,finalidad_codigo,resolucion_id) VALUES($1,'cuenta',$2)",
        [player, resolution],
      );
    },
  );
  const before = (
    await operator.query(
      'SELECT * FROM criterika.restricciones_tratamiento ORDER BY id',
    )
  ).rows;
  expect((await create()).ok).toBe(true);
  expect(
    (
      await operator.query(
        'SELECT * FROM criterika.restricciones_tratamiento ORDER BY id',
      )
    ).rows,
  ).toEqual(before);
});
it.each([false, true])(
  'espera publicación legal y revalida después del bloqueo (cambia versión: %s)',
  async (changeVersion) => {
    const previous = await create(),
      nextTerms = randomUUID(),
      publisher = await operator.connect();
    let released = false;
    let attempt: ReturnType<typeof create> | undefined;
    let announce!: (pid: number) => void;
    const started = new Promise<number>((resolve) => {
      announce = resolve;
    });
    const later = new Date(at.getTime() + 5000),
      clock = vi.fn(() => later);
    try {
      await publisher.query('BEGIN');
      await publisher.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('criterika:legal:current:v1',0))",
      );
      if (changeVersion) {
        await publisher.query(
          'UPDATE criterika.versiones_documentos_legales SET es_vigente=false WHERE id=$1',
          [terms],
        );
        await publisher.query(
          `INSERT INTO criterika.versiones_documentos_legales
        (id,tipo,etiqueta_version,contenido_markdown,tipo_cambio,requiere_aceptacion,sha256,publicada_en,es_vigente)
        VALUES($1,'TERMINOS','prueba-2','Nuevos términos ficticios publicados para probar concurrencia.','CONTRACTUAL',true,
          sha256(convert_to('Nuevos términos ficticios publicados para probar concurrencia.','UTF8')),$2,true)`,
          [nextTerms, at],
        );
      }
      attempt = own(async (tx) => {
        const { rows } = await tx.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );
        announce(rows[0].pid);
        return acceptances.createOwned(tx, player, body(), '192.0.2.50', clock);
      });
      const pid = await started;
      let blocked = false;
      for (let n = 0; n < 100 && !blocked; n++) {
        const { rows } = await operator.query<{ blocked: boolean }>(
          "SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",
          [pid],
        );
        blocked = rows[0]?.blocked === true;
      }
      expect(blocked).toBe(true);
      expect(clock).not.toHaveBeenCalled();
      await publisher.query('COMMIT');
      released = true;
      const result = await attempt;
      if (changeVersion) {
        expect(result).toEqual({ ok: false, reason: 'LEGAL_VERSION_OUTDATED' });
        expect(clock).not.toHaveBeenCalled();
        expect((await list()).items).toEqual(
          previous.ok ? [previous.value] : [],
        );
        expect(
          (await create({ ...body(), terminosVersionId: nextTerms })).ok,
        ).toBe(true);
      } else {
        expect(result).toMatchObject({
          ok: true,
          value: { aceptadaEn: later },
        });
        expect(clock).toHaveBeenCalledOnce();
      }
      if (!previous.ok) throw new Error('Falta evidencia previa');
      expect(
        (await list()).items.find((row) => row.id === previous.value.id),
      ).toEqual(previous.value);
    } finally {
      if (!released) await publisher.query('ROLLBACK');
      publisher.release();
      if (attempt) await attempt.catch(() => {});
    }
  },
);
