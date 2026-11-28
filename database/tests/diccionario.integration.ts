import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { TransactionRunner } from '../../src/database/transaction-runner.js';
import { checkDatabaseConnection } from '../../src/database/postgres.connection.js';
import {
  PostgresDictionaryReadRepository,
  DictionaryPositionError,
} from '../../src/modules/dictionary/repositories/dictionary-read.repository.js';
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
  dictionary = new PostgresDictionaryReadRepository();
const player = '00000000-0000-4000-8000-000000000011',
  other = '00000000-0000-4000-8000-000000000010';
const term = (n: number) =>
  '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
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
  await operator.query(`BEGIN;
    SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,gen_random_uuid(),'Datos ficticios de consulta de diccionario.');
    UPDATE criterika.terminos SET nombre_publicado=CASE WHEN id='00000000-0000-4000-8000-000000004001' THEN 'Alfa' ELSE 'Beta' END;
    INSERT INTO criterika.terminos(id,nombre_borrador,categoria_borrador,definicion_borrador,ejemplo_borrador,nombre_publicado,categoria_publicada,definicion_publicada,ejemplo_publicado,estado)
    VALUES ('00000000-0000-4000-8000-000000005001','Borrador privado','Privada','Definición privada','Ejemplo privado','Beta','Ética','Definición de Beta','Ejemplo de Beta','PUBLICADO'),
      ('00000000-0000-4000-8000-000000005002','Borrador privado','Privada','Definición privada','Ejemplo privado','Porcentaje % y guion _','Operación','Definición publicada','Ejemplo publicado','PUBLICADO'),
      ('00000000-0000-4000-8000-000000005003','Borrador privado','Privada','Definición privada','Ejemplo privado','Ámbito jurídico','Legislación','Definición publicada','Ejemplo publicado','PUBLICADO'),
      ('00000000-0000-4000-8000-000000005004','Término secreto','Privada','Definición secreta','Ejemplo secreto',NULL,NULL,NULL,NULL,'BORRADOR');
    INSERT INTO criterika.terminos_desbloqueados(jugador_id,termino_id,aprobacion_origen_id)
      SELECT '00000000-0000-4000-8000-000000000011',id,'00000000-0000-4000-8000-000000008001'
      FROM criterika.terminos WHERE estado='PUBLICADO';
    COMMIT;`);
});
afterAll(async () => {
  await pool.end();
  await operator.end();
});
it('devuelve solo campos públicos de términos adquiridos', async () => {
  const result = await runner.read((tx) => dictionary.list(tx, player));
  expect(result.items).toHaveLength(5);
  expect(Object.keys(result.items[0]).sort()).toEqual([
    'categoria',
    'definicion',
    'ejemplo',
    'fuenteUrl',
    'id',
    'nombre',
  ]);
  expect(result.items.find((r) => r.id === term(5001))).toEqual({
    id: term(5001),
    nombre: 'Beta',
    categoria: 'Ética',
    definicion: 'Definición de Beta',
    ejemplo: 'Ejemplo de Beta',
    fuenteUrl: null,
  });
  expect(JSON.stringify(result)).not.toMatch(/privad|secret/i);
});
it('pagina por nombre e ID con empates sin duplicar ni perder términos', async () => {
  const first = await runner.read((tx) => dictionary.list(tx, player, {}, 2));
  expect(first.items.map((r) => r.id)).toEqual([term(4001), term(4002)]);
  const second = await runner.read((tx) =>
    dictionary.list(tx, player, {}, 2, first.nextPosition!),
  );
  expect(second.items.map((r) => r.id)).toEqual([term(5001), term(5002)]);
  const last = await runner.read((tx) =>
    dictionary.list(tx, player, {}, 2, second.nextPosition!),
  );
  expect(last.items.map((r) => r.id)).toEqual([term(5003)]);
  expect(last.nextPosition).toBeNull();
});
it('oculta términos ajenos, no adquiridos e inexistentes con la misma ausencia', async () => {
  expect(
    await runner.read((tx) => dictionary.get(tx, other, term(5001))),
  ).toBeNull();
  expect(
    await runner.read((tx) => dictionary.get(tx, player, term(5004))),
  ).toBeNull();
  expect(
    await runner.read((tx) => dictionary.get(tx, player, term(9999))),
  ).toBeNull();
  expect(await runner.read((tx) => dictionary.list(tx, other))).toEqual({
    items: [],
    nextPosition: null,
  });
  expect(
    (
      await runner.read((tx) =>
        dictionary.list(tx, '00000000-0000-4000-8000-000000000001'),
      )
    ).items,
  ).toEqual([]);
});
it('mantiene disponible un término adquirido deshabilitado', async () => {
  await operator.query(
    "UPDATE criterika.terminos SET estado='DESHABILITADO' WHERE id=$1",
    [term(5001)],
  );
  expect(
    await runner.read((tx) => dictionary.get(tx, player, term(5001))),
  ).toMatchObject({ nombre: 'Beta' });
  expect(
    (await runner.read((tx) => dictionary.list(tx, player))).items.map(
      (r) => r.id,
    ),
  ).toContain(term(5001));
});
it('refleja correcciones publicadas y no las ediciones de borrador', async () => {
  await operator.query(
    "UPDATE criterika.terminos SET definicion_publicada='Corrección publicada',definicion_borrador='Secreto privado',fuente_publicada='https://example.invalid/referencia' WHERE id=$1",
    [term(5001)],
  );
  const result = await runner.read((tx) =>
    dictionary.get(tx, player, term(5001)),
  );
  expect(result).toMatchObject({
    definicion: 'Corrección publicada',
    fuenteUrl: 'https://example.invalid/referencia',
  });
  expect(JSON.stringify(result)).not.toContain('Secreto');
});
it('filtra búsqueda literal por nombre sin interpretar comodines o SQL', async () => {
  expect(
    (await runner.read((tx) => dictionary.list(tx, player, { q: 'BETA' })))
      .items,
  ).toHaveLength(2);
  expect(
    (
      await runner.read((tx) => dictionary.list(tx, player, { q: '%' }))
    ).items.map((r) => r.id),
  ).toEqual([term(5002)]);
  expect(
    (
      await runner.read((tx) => dictionary.list(tx, player, { q: '_' }))
    ).items.map((r) => r.id),
  ).toEqual([term(5002)]);
  expect(
    (
      await runner.read((tx) =>
        dictionary.list(tx, player, { q: "' OR true --" }),
      )
    ).items,
  ).toEqual([]);
  expect(
    (
      await runner.read((tx) => dictionary.list(tx, player, { q: 'Ámbito' }))
    ).items.map((r) => r.id),
  ).toEqual([term(5003)]);
});
it('combina categoría publicada y búsqueda y rechaza anclas de otro filtro', async () => {
  expect(
    (
      await runner.read((tx) =>
        dictionary.list(tx, player, { categoria: 'Ética', q: 'beta' }),
      )
    ).items,
  ).toHaveLength(2);
  expect(
    (
      await runner.read((tx) =>
        dictionary.list(tx, player, { categoria: 'Privada' }),
      )
    ).items,
  ).toEqual([]);
  await expect(
    runner.read((tx) =>
      dictionary.list(tx, player, { categoria: 'Operación' }, 2, {
        termId: term(4001),
      }),
    ),
  ).rejects.toBeInstanceOf(DictionaryPositionError);
});
it('rechaza anclas inexistentes, bloqueadas o de otro titular', async () => {
  for (const id of [term(5004), term(9999)])
    await expect(
      runner.read((tx) => dictionary.list(tx, player, {}, 2, { termId: id })),
    ).rejects.toBeInstanceOf(DictionaryPositionError);
  await expect(
    runner.read((tx) =>
      dictionary.list(tx, other, {}, 2, { termId: term(4001) }),
    ),
  ).rejects.toBeInstanceOf(DictionaryPositionError);
});
it('controla tamaño de página y límites de filtros', async () => {
  expect(
    (await runner.read((tx) => dictionary.list(tx, player, {}, 1))).items,
  ).toHaveLength(1);
  expect(
    (await runner.read((tx) => dictionary.list(tx, player, {}, 100)))
      .nextPosition,
  ).toBeNull();
  for (const limit of [0, 101, -1, 1.5, NaN])
    await expect(
      runner.read((tx) => dictionary.list(tx, player, {}, limit)),
    ).rejects.toThrow('Límite');
  for (const q of ['', 'x'.repeat(121), '\0'])
    await expect(
      runner.read((tx) => dictionary.list(tx, player, { q })),
    ).rejects.toThrow('Filtro');
  await expect(
    runner.read((tx) => dictionary.list(tx, player, { categoria: '' })),
  ).rejects.toThrow('Filtro');
});
it('detecta un desbloqueo inconsistente sin devolver campos de borrador', async () => {
  await operator.query(
    `INSERT INTO criterika.terminos_desbloqueados(jugador_id,termino_id,aprobacion_origen_id) VALUES ($1,$2,'00000000-0000-4000-8000-000000008001')`,
    [player, term(5004)],
  );
  await expect(
    runner.read((tx) => dictionary.get(tx, player, term(5004))),
  ).rejects.toThrow('sin publicación completa');
  await expect(
    runner.read((tx) => dictionary.list(tx, player)),
  ).rejects.toThrow('sin publicación completa');
});
