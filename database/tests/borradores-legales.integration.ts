import { randomUUID } from 'node:crypto';
import { legalPublicationFixture } from './helpers/legal-publication.fixture.js';
import { AdministrativeReadForbiddenError } from '../../src/database/administrative-read.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
import { AdminLegalPositionError } from '../../src/modules/legal/repositories/admin-legal-read.repository.js';
import type { LegalDraftInput } from '../../src/modules/legal/repositories/legal-document.types.js';
const {
  operator,
  runner,
  reads,
  drafts,
  documents,
  player,
  terms,
  privacy,
  admin,
  input,
  create,
  get,
  state,
} = legalPublicationFixture();
it('consulta publicados y borradores sin exponer el borrador en lectura pública', async () => {
  const draft = await create();
  expect(draft).toMatchObject({
    publicadoEn: null,
    sha256: null,
    versionRecurso: 1n,
    vigente: false,
  });
  expect(await get(terms)).toMatchObject({
    id: terms,
    versionRecurso: 1n,
    vigente: true,
  });
  expect(
    await runner.read((tx) => documents.getPublishedDocument(tx, draft.id)),
  ).toBeNull();
  expect(await get(randomUUID())).toBeNull();
});
it('rechaza lectura y escritura con contexto público o jugador', async () => {
  for (const context of [
    { tipo: 'SISTEMA' as const, requestId: randomUUID() },
    { tipo: 'JUGADOR' as const, actorId: player, requestId: randomUUID() },
  ]) {
    await expect(
      runner.run(context, (tx) => reads.list(tx)),
    ).rejects.toBeInstanceOf(AdministrativeReadForbiddenError);
    await expect(
      runner.run(context, (tx) => drafts.create(tx, input())),
    ).rejects.toBeInstanceOf(AdministrativeReadForbiddenError);
  }
});
it('pagina por UUID estable y rechaza anclas inexistentes', async () => {
  await create();
  const all = await admin((tx) => reads.list(tx));
  const found: string[] = [];
  let position: { documentId: string } | null = null;
  for (let n = 0; n < all.items.length; n++) {
    const page = await admin((tx) => reads.list(tx, 1, position ?? undefined));
    found.push(...page.items.map((d) => d.id));
    position = page.nextPosition;
  }
  expect(found).toEqual(all.items.map((d) => d.id));
  expect(position).toBeNull();
  await expect(
    admin((tx) => reads.list(tx, 20, { documentId: randomUUID() })),
  ).rejects.toBeInstanceOf(AdminLegalPositionError);
});
it.each([0, 101, 1.5])('rechaza límite %s', async (limit) => {
  await expect(admin((tx) => reads.list(tx, limit))).rejects.toBeInstanceOf(
    PersistenceInvariantError,
  );
});
it('conserva tipo y etiqueta únicos sin abortar el resto de la transacción', async () => {
  const draft = await create();
  await admin(async (tx) => {
    expect(await drafts.create(tx, input())).toEqual({
      kind: 'version_label_conflict',
    });
    expect((await tx.query('SELECT 1 AS value')).rows[0].value).toBe(1);
  });
  expect(await get(draft.id)).toEqual(draft);
  const notice = await create(input('AVISO_PRIVACIDAD'));
  expect(notice.version).toBe(draft.version);
});
it('reemplaza solo borrador con CAS y conserva el significado base de códigos existentes', async () => {
  const before = await create(input('AVISO_PRIVACIDAD'));
  const base = (
    await operator.query(
      "SELECT descripcion_base FROM criterika.finalidades WHERE codigo='cuenta'",
    )
  ).rows;
  const edited = {
    ...input('AVISO_PRIVACIDAD'),
    contenidoMarkdown:
      'Texto distinto ficticio y suficientemente largo para una segunda revisión.',
  };
  expect(
    await admin((tx) => drafts.replace(tx, before.id, 1n, edited)),
  ).toMatchObject({
    kind: 'saved',
    document: {
      contenidoMarkdown: edited.contenidoMarkdown,
      versionRecurso: 2n,
    },
  });
  expect(
    await admin((tx) => drafts.replace(tx, before.id, 1n, edited)),
  ).toEqual({ kind: 'version_conflict' });
  expect(
    (
      await operator.query(
        "SELECT descripcion_base FROM criterika.finalidades WHERE codigo='cuenta'",
      )
    ).rows,
  ).toEqual(base);
});
it('edición no colisiona con otra etiqueta ni cambia un publicado', async () => {
  const first = await create(),
    second = await create(input('TERMINOS', 'prueba-3'));
  const before = await state();
  expect(
    await admin((tx) => drafts.replace(tx, second.id, 1n, input())),
  ).toEqual({ kind: 'version_label_conflict' });
  expect(await state()).toEqual(before);
  expect(await admin((tx) => drafts.replace(tx, terms, 1n, input()))).toEqual({
    kind: 'already_published',
  });
  expect(
    await admin((tx) => drafts.replace(tx, randomUUID(), 1n, input())),
  ).toEqual({ kind: 'not_found' });
  expect(await get(first.id)).toEqual(first);
});
it('creaciones concurrentes con la misma etiqueta admiten solo un borrador', async () => {
  const results = await Promise.all([
    admin((tx) => drafts.create(tx, input())),
    admin((tx) => drafts.create(tx, input())),
  ]);
  expect(results.map((r) => r.kind).sort()).toEqual([
    'saved',
    'version_label_conflict',
  ]);
});
it('ediciones simultáneas con la misma versión admiten solo una', async () => {
  const draft = await create();
  const results = await Promise.all([
    admin((tx) =>
      drafts.replace(tx, draft.id, 1n, input('TERMINOS', 'cambio-a')),
    ),
    admin((tx) =>
      drafts.replace(tx, draft.id, 1n, input('TERMINOS', 'cambio-b')),
    ),
  ]);
  expect(results.map((r) => r.kind).sort()).toEqual([
    'saved',
    'version_conflict',
  ]);
});
it.each([
  null,
  { ...input(), version: '' },
  { ...input(), contenidoMarkdown: 'corto' },
  {
    ...input(),
    finalidades: [{ id: 'cuenta', descripcion: 'Texto', necesaria: true }],
  },
  {
    ...input('AVISO_PRIVACIDAD'),
    finalidades: [{ id: 'cuenta', descripcion: 'Texto', necesaria: false }],
  },
  {
    ...input('AVISO_PRIVACIDAD'),
    finalidades: [{ id: 'cuenta\n', descripcion: 'Texto', necesaria: true }],
  },
  { ...input(), requiereAceptacion: false },
  { ...input(), contenidoMarkdown: 'Texto\0'.repeat(20) },
])('rechaza entrada inválida %j', async (value) => {
  await expect(
    admin((tx) => drafts.create(tx, value as LegalDraftInput)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('revierte padre y finalidades si falla la inserción de un código', async () => {
  const before = await state();
  await operator.query(
    'ALTER TABLE criterika.documento_finalidades ADD CONSTRAINT prueba_borrador_falla CHECK(false) NOT VALID',
  );
  try {
    await expect(create(input('AVISO_PRIVACIDAD'))).rejects.toMatchObject({
      code: '23514',
    });
    expect(await state()).toEqual(before);
  } finally {
    await operator.query(
      'ALTER TABLE criterika.documento_finalidades DROP CONSTRAINT prueba_borrador_falla',
    );
  }
});
it('revierte edición y finalidades si falla la transacción exterior', async () => {
  const draft = await create(input('AVISO_PRIVACIDAD')),
    before = await state();
  await expect(
    admin(async (tx) => {
      await drafts.replace(tx, draft.id, 1n, input('TERMINOS'));
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(await state()).toEqual(before);
});
it('mantiene versiones bigint sin redondearlas', async () => {
  const draft = await create();
  await operator.query(
    'UPDATE criterika.versiones_documentos_legales SET version_recurso=9007199254740993 WHERE id=$1',
    [draft.id],
  );
  expect((await get(draft.id))?.versionRecurso).toBe(9007199254740993n);
  expect(
    await admin((tx) =>
      drafts.replace(tx, draft.id, 9007199254740993n, input()),
    ),
  ).toMatchObject({
    kind: 'saved',
    document: { versionRecurso: 9007199254740994n },
  });
});
