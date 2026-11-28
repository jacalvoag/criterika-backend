import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import { PostgresAdminTermReadRepository } from '../../src/modules/dictionary/repositories/admin-term-read.repository.js';
import { PostgresAdminTermWriteRepository } from '../../src/modules/dictionary/repositories/admin-term-write.repository.js';
import { PostgresDictionaryReadRepository } from '../../src/modules/dictionary/repositories/dictionary-read.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
import { AdministrativeReadForbiddenError } from '../../src/database/administrative-read.js';
const { operator, runner, admin, system, player } = playerPersistenceFixture(),
  reads = new PostgresAdminTermReadRepository(),
  writes = new PostgresAdminTermWriteRepository();
const input = () => ({
  nombre: 'Término ficticio',
  categoria: 'Ética',
  definicion: 'Definición ficticia',
  ejemplo: 'Ejemplo ficticio',
  fuenteUrl: 'https://example.invalid/fuente',
});
async function create() {
  const value = await admin((tx) => writes.create(tx, input()));
  if (!value) throw new Error('Falta borrador');
  return value;
}
it('crea borrador y lo publica sin perder los textos', async () => {
  const draft = await create();
  expect(draft.estado).toBe('BORRADOR');
  expect(await admin((tx) => writes.publish(tx, draft.id, 1n))).toMatchObject({
    kind: 'saved',
    term: { estado: 'PUBLICADO', version: 2n },
  });
});
it('corrige borrador sin cambiar la publicación hasta promoverlo', async () => {
  const draft = await create();
  await admin((tx) => writes.publish(tx, draft.id, 1n));
  await admin((tx) =>
    writes.patch(tx, draft.id, 2n, {
      definicion: 'Corrección publicada después',
    }),
  );
  expect(
    (
      await operator.query(
        'SELECT definicion_publicada FROM criterika.terminos WHERE id=$1',
        [draft.id],
      )
    ).rows[0].definicion_publicada,
  ).toBe(input().definicion);
  await admin((tx) => writes.publish(tx, draft.id, 3n));
  expect(
    (
      await operator.query(
        'SELECT definicion_publicada FROM criterika.terminos WHERE id=$1',
        [draft.id],
      )
    ).rows[0].definicion_publicada,
  ).toBe('Corrección publicada después');
});
it('ediciones concurrentes respetan CAS', async () => {
  const draft = await create();
  const results = await Promise.all([
    admin((tx) => writes.patch(tx, draft.id, 1n, { nombre: 'Uno' })),
    admin((tx) => writes.patch(tx, draft.id, 1n, { nombre: 'Dos' })),
  ]);
  expect(results.map((r) => r.kind).sort()).toEqual([
    'saved',
    'version_conflict',
  ]);
});
it('solo elimina término nunca publicado y sin referencias', async () => {
  const draft = await create();
  expect(await admin((tx) => writes.remove(tx, draft.id, 1n))).toEqual({
    kind: 'deleted',
  });
  const another = await create();
  await admin((tx) => writes.publish(tx, another.id, 1n));
  expect(await admin((tx) => writes.remove(tx, another.id, 2n))).toEqual({
    kind: 'in_use',
  });
});
it('deshabilitar conserva términos adquiridos', async () => {
  const term = '00000000-0000-4000-8000-000000004001';
  await operator.query(
    `INSERT INTO criterika.terminos_desbloqueados(jugador_id,termino_id,aprobacion_origen_id) VALUES($1,$2,'00000000-0000-4000-8000-000000008001')`,
    [player, term],
  );
  const old = await admin((tx) => reads.get(tx, term));
  expect(old).not.toBeNull();
  await admin((tx) => writes.setEnabled(tx, term, old!.version, false));
  expect(
    await runner.read((tx) =>
      new PostgresDictionaryReadRepository().get(tx, player, term),
    ),
  ).not.toBeNull();
});
it('distingue ausente y cursor fuera de filtros', async () => {
  expect(await admin((tx) => reads.get(tx, randomUUID()))).toBeNull();
  const draft = await create();
  await expect(
    admin((tx) =>
      reads.list(tx, { q: 'Inexistente' }, 1, { termId: draft.id }),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('rechaza escritura pública', async () => {
  await expect(
    system((tx) => writes.create(tx, input())),
  ).rejects.toBeInstanceOf(AdministrativeReadForbiddenError);
});
it('permite borrar una referencia URL explícita sin confundir ausencia con null', async () => {
  const draft = await create();
  await admin((tx) => writes.patch(tx, draft.id, 1n, { fuenteUrl: null }));
  expect((await admin((tx) => reads.get(tx, draft.id)))?.fuenteUrl).toBeNull();
});
it.each([{}, { nombre: '' }, { definicion: 'a\0b' }, { estado: 'PUBLICADO' }])(
  'rechaza parche inválido %j',
  async (value) => {
    const draft = await create();
    await expect(
      admin((tx) => writes.patch(tx, draft.id, 1n, value)),
    ).rejects.toBeInstanceOf(PersistenceInvariantError);
  },
);
it('auditoría y publicación revierten juntas', async () => {
  const draft = await create();
  await operator.query(
    `ALTER TABLE criterika.eventos_auditoria ADD CONSTRAINT lote_termino_falla CHECK(recurso_id<>'${draft.id}'::uuid OR accion<>'UPDATE') NOT VALID`,
  );
  try {
    await expect(
      admin((tx) => writes.publish(tx, draft.id, 1n)),
    ).rejects.toMatchObject({ code: '23514' });
    expect((await admin((tx) => reads.get(tx, draft.id)))?.estado).toBe(
      'BORRADOR',
    );
  } finally {
    await operator.query(
      'ALTER TABLE criterika.eventos_auditoria DROP CONSTRAINT lote_termino_falla',
    );
  }
});
