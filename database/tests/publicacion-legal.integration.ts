import { randomUUID, createHash } from 'node:crypto';
import { legalPublicationFixture } from './helpers/legal-publication.fixture.js';
import { PostgresLegalPublicationRepository } from '../../src/modules/legal/repositories/legal-publication.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
import { AdministrativeReadForbiddenError } from '../../src/database/administrative-read.js';
const {
  operator,
  runner,
  configuration,
  publication,
  drafts,
  acceptances,
  actor,
  player,
  terms,
  privacy,
  at,
  admin,
  input,
  create,
  get,
  publish,
  state,
} = legalPublicationFixture();
it('publica bytes UTF-8 exactos y sustituye solo la vigente del mismo tipo', async () => {
  const original = await get(terms),
    notice = await get(privacy);
  const markdown = 'Ética, privacidad y criterios. 😀\r\n'.repeat(5),
    draft = await create({ ...input(), contenidoMarkdown: markdown });
  expect(await publish(draft.id)).toMatchObject({
    kind: 'saved',
    document: {
      id: draft.id,
      publicadoEn: at,
      sha256: createHash('sha256').update(markdown, 'utf8').digest('hex'),
      versionRecurso: 2n,
      vigente: true,
      requiereAceptacion: true,
    },
  });
  expect(await get(terms)).toEqual({
    ...original,
    vigente: false,
    versionRecurso: 2n,
  });
  expect(await get(privacy)).toEqual(notice);
});
it('no publica sin configuración operativa ni motivo válido', async () => {
  const draft = await create(),
    before = await state();
  const missing = new PostgresLegalPublicationRepository({
    ...configuration,
    contactEmail: '',
  });
  expect(
    await admin((tx) => missing.publish(tx, draft.id, 1n, true, () => at)),
  ).toEqual({ kind: 'legal_configuration_missing' });
  await expect(
    admin((tx) => publication.publish(tx, draft.id, 1n, true, () => at), {
      motivo: '',
    }),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect(await state()).toEqual(before);
});
it('rechaza contexto público o jugador para publicar', async () => {
  const draft = await create();
  for (const context of [
    { tipo: 'SISTEMA' as const, requestId: randomUUID() },
    { tipo: 'JUGADOR' as const, actorId: player, requestId: randomUUID() },
  ])
    await expect(
      runner.run(context, (tx) =>
        publication.publish(tx, draft.id, 1n, true, () => at),
      ),
    ).rejects.toBeInstanceOf(AdministrativeReadForbiddenError);
});
it('clasifica inexistente, versión obsoleta y revisión ya publicada sin cambiar datos', async () => {
  const draft = await create();
  expect(await publish(randomUUID())).toEqual({ kind: 'not_found' });
  expect(await publish(draft.id, 2n)).toEqual({ kind: 'version_conflict' });
  expect((await publish(draft.id)).kind).toBe('saved');
  const before = await state();
  expect(await publish(draft.id, 2n)).toEqual({ kind: 'already_published' });
  expect(await state()).toEqual(before);
});
it.each(['CONTRACTUAL', 'NUEVA_FINALIDAD'] as const)(
  'impide publicar %s sin nueva aceptación',
  async (change) => {
    const draft = await create(input('TERMINOS', 'prueba-2', change)),
      before = await state();
    expect(await publish(draft.id, 1n, false)).toEqual({
      kind: 'invalid_acceptance_policy',
    });
    expect(await state()).toEqual(before);
  },
);
it.each(['TERMINOS', 'AVISO_PRIVACIDAD'] as const)(
  'permite decisión editorial sin nueva finalidad para %s',
  async (type) => {
    const draft = await create(input(type, 'prueba-2', 'EDITORIAL'));
    expect(await publish(draft.id, 1n, false)).toMatchObject({
      kind: 'saved',
      document: { requiereAceptacion: false },
    });
  },
);
it('exige aceptar una finalidad nueva aunque el borrador se declare editorial', async () => {
  const value = input('AVISO_PRIVACIDAD', 'prueba-2', 'EDITORIAL');
  value.finalidades.push({
    id: 'aprendizaje',
    descripcion: 'Nueva finalidad ficticia estable.',
    necesaria: true,
  });
  const draft = await create(value);
  expect(await publish(draft.id, 1n, false)).toEqual({
    kind: 'invalid_acceptance_policy',
  });
  expect(await publish(draft.id, 1n, true)).toMatchObject({
    kind: 'saved',
    document: {
      requiereAceptacion: true,
      finalidades: [{ id: 'aprendizaje' }, { id: 'cuenta' }],
    },
  });
});
it('no publica un aviso sin finalidades necesarias', async () => {
  const draft = await create({ ...input('AVISO_PRIVACIDAD'), finalidades: [] });
  expect(await publish(draft.id)).toEqual({ kind: 'invalid_purposes' });
});
it('protege contenido y finalidades publicados contra modificaciones directas', async () => {
  const draft = await create(input('AVISO_PRIVACIDAD'));
  expect((await publish(draft.id)).kind).toBe('saved');
  await expect(
    admin((tx) =>
      tx.query(
        'UPDATE criterika.versiones_documentos_legales SET contenido_markdown=$2 WHERE id=$1',
        [draft.id, 'Cambio ilegítimo'],
      ),
    ),
  ).rejects.toMatchObject({ code: '55000' });
  await expect(
    admin((tx) =>
      tx.query(
        'DELETE FROM criterika.documento_finalidades WHERE documento_version_id=$1',
        [draft.id],
      ),
    ),
  ).rejects.toMatchObject({ code: '55000' });
});
it('confirma auditoría de ambas revisiones con autor y motivo sin copiar contenido', async () => {
  const draft = await create(),
    requestId = randomUUID(),
    motivo = 'Actualización ficticia para probar auditoría.';
  expect(
    (
      await admin(
        (tx) => publication.publish(tx, draft.id, 1n, true, () => at),
        { requestId, motivo },
      )
    ).kind,
  ).toBe('saved');
  const { rows } = await operator.query(
    'SELECT * FROM criterika.eventos_auditoria WHERE request_id=$1 ORDER BY recurso_id',
    [requestId],
  );
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row).toMatchObject({
      actor_tipo: 'ADMINISTRADOR',
      administrador_id: actor,
      accion: 'UPDATE',
      motivo,
    });
    expect(JSON.stringify(row.cambios_permitidos)).not.toContain(
      draft.contenidoMarkdown,
    );
  }
  expect(rows.map((r) => r.recurso_id).sort()).toEqual(
    [terms, draft.id].sort(),
  );
});
it('un fallo de auditoría del documento nuevo revierte también la retirada del anterior', async () => {
  const draft = await create(),
    before = await state();
  await operator.query(
    `ALTER TABLE criterika.eventos_auditoria ADD CONSTRAINT prueba_publicacion_auditoria CHECK(recurso_id<>'${draft.id}'::uuid OR accion<>'UPDATE') NOT VALID`,
  );
  try {
    await expect(publish(draft.id)).rejects.toMatchObject({ code: '23514' });
    expect(await state()).toEqual(before);
  } finally {
    await operator.query(
      'ALTER TABLE criterika.eventos_auditoria DROP CONSTRAINT prueba_publicacion_auditoria',
    );
  }
});
it('revierte estado vigente, hash, fechas y auditoría si falla la transacción exterior', async () => {
  const draft = await create(),
    before = await state();
  await expect(
    admin(async (tx) => {
      await publication.publish(tx, draft.id, 1n, true, () => at);
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(await state()).toEqual(before);
});
it('dos publicaciones del mismo borrador aceptan una sola versión', async () => {
  const draft = await create();
  const results = await Promise.all([publish(draft.id), publish(draft.id)]);
  expect(results.map((r) => r.kind).sort()).toEqual([
    'saved',
    'version_conflict',
  ]);
});
it('publicaciones distintas del mismo tipo mantienen una única vigente', async () => {
  const first = await create(),
    second = await create(input('TERMINOS', 'prueba-3'));
  expect(
    (await Promise.all([publish(first.id), publish(second.id)])).map(
      (r) => r.kind,
    ),
  ).toEqual(['saved', 'saved']);
  const { rows } = await operator.query(
    "SELECT id FROM criterika.versiones_documentos_legales WHERE tipo='TERMINOS' AND es_vigente",
  );
  expect(rows).toHaveLength(1);
  expect([first.id, second.id]).toContain(rows[0].id);
  expect((await get(terms))?.publicadoEn).not.toBeNull();
});
it('edición y publicación concurrentes respetan la versión observada', async () => {
  const draft = await create();
  const results = await Promise.all([
    admin((tx) =>
      drafts.replace(tx, draft.id, 1n, input('TERMINOS', 'editada')),
    ),
    publish(draft.id),
  ]);
  expect(results.map((r) => r.kind).sort()).toEqual([
    'saved',
    'version_conflict',
  ]);
});
it.each([0n, 9223372036854775807n])(
  'rechaza versión no utilizable %s',
  async (version) => {
    const draft = await create();
    await expect(publish(draft.id, version)).rejects.toBeInstanceOf(
      PersistenceInvariantError,
    );
  },
);
it('rechaza reloj inválido sin retirar la vigente', async () => {
  const draft = await create(),
    before = await state();
  await expect(
    admin((tx) =>
      publication.publish(tx, draft.id, 1n, true, () => new Date(NaN)),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect(await state()).toEqual(before);
});
it('la publicación espera a la aceptación en curso y conserva su evidencia histórica', async () => {
  const draft = await create();
  let release!: () => void,
    announce!: () => void,
    announcePid!: (pid: number) => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      announce = resolve;
    }),
    started = new Promise<number>((resolve) => {
      announcePid = resolve;
    });
  const acceptance = runner.run(
    { tipo: 'JUGADOR', actorId: player, requestId: randomUUID() },
    async (tx) => {
      const result = await acceptances.createOwned(
        tx,
        player,
        {
          terminosVersionId: terms,
          avisoVersionId: privacy,
          aceptaTerminos: true,
          reconoceAvisoPresentado: true,
          consienteFinalidadesIds: ['cuenta'],
        },
        '192.0.2.10',
        () => at,
      );
      announce();
      await gate;
      return result;
    },
  );
  let publishing: ReturnType<typeof publish> | undefined;
  try {
    await ready;
    const clock = vi.fn(() => new Date(at.getTime() + 1000));
    publishing = admin(async (tx) => {
      const { rows } = await tx.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      announcePid(rows[0].pid);
      return publication.publish(tx, draft.id, 1n, true, clock);
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
    release();
    const evidence = await acceptance;
    expect(evidence.ok).toBe(true);
    expect((await publishing).kind).toBe('saved');
    expect(clock).toHaveBeenCalledOnce();
    if (!evidence.ok) throw new Error('Falta evidencia de aceptación');
    const history = await runner.read((tx) =>
      acceptances.listOwned(tx, player),
    );
    expect(history.items).toEqual([evidence.value]);
    expect(evidence.value.terminosVersionId).toBe(terms);
    expect((await get(terms))?.vigente).toBe(false);
  } finally {
    release();
    await acceptance.catch(() => {});
    if (publishing) await publishing.catch(() => {});
  }
});
