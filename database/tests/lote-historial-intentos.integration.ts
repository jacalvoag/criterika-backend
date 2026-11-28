import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import { PostgresAttemptHistoryRepository } from '../../src/modules/gameplay/repositories/attempt-history.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
const { operator, runner, player, other, system } = playerPersistenceFixture(),
  repo = new PostgresAttemptHistoryRepository();
const attempt = '00000000-0000-4000-8000-000000008000';
it('lista solo historial propio y no filtra soluciones', async () => {
  const page = await runner.read((tx) => repo.listOwned(tx, player));
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({ id: attempt, estado: 'APROBADO' });
  expect(JSON.stringify(page)).not.toMatch(
    /estado_juego|tablero|contrasena|respuestaCorrecta/,
  );
  expect((await runner.read((tx) => repo.listOwned(tx, other))).items).toEqual(
    [],
  );
});
it('reutiliza detalle y rechaza intento ajeno o inexistente', async () => {
  expect(
    await runner.read((tx) => repo.getOwned(tx, player, attempt)),
  ).not.toBeNull();
  expect(
    await runner.read((tx) => repo.getOwned(tx, other, attempt)),
  ).toBeNull();
  expect(
    await runner.read((tx) => repo.getOwned(tx, player, randomUUID())),
  ).toBeNull();
});
it('historial de ejecuciones comprueba titularidad', async () => {
  expect(
    await runner.read((tx) => repo.executionHistory(tx, other, attempt)),
  ).toBeNull();
  const rows = await runner.read((tx) =>
    repo.executionHistory(tx, player, attempt),
  );
  expect(Array.isArray(rows)).toBe(true);
  for (const row of rows ?? [])
    expect(Object.keys(row)).not.toContain('estado_juego');
});
it('no acepta ancla ajena ni inexistente', async () => {
  for (const id of [attempt, randomUUID()])
    await expect(
      runner.read((tx) => repo.listOwned(tx, other, 1, { attemptId: id })),
    ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it.each([0, 101])('rechaza límite %s', async (limit) => {
  await expect(
    runner.read((tx) => repo.listOwned(tx, player, limit)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('pagina por microsegundos sin perder filas dentro del mismo milisegundo', async () => {
  await operator.query(
    `UPDATE criterika.intentos_nivel SET iniciado_en='2026-11-28T12:00:00.000001Z',ultima_comunicacion_en='2026-11-28T12:00:01Z',finalizado_en='2026-11-28T12:00:01Z' WHERE id=$1`,
    [attempt],
  );
  const id = randomUUID();
  await system((tx) =>
    tx.query(
      `INSERT INTO criterika.intentos_nivel(id,jugador_id,nivel_id,revision_id,estado,motivo_finalizacion,iniciado_en,finalizado_en,zona_horaria,gemas_previstas,xp_prevista) SELECT $1,jugador_id,nivel_id,revision_id,'ABANDONADO','SALIDA_CONFIRMADA','2026-11-28T12:00:00.000002Z','2026-11-28T12:00:01Z',zona_horaria,gemas_previstas,xp_prevista FROM criterika.intentos_nivel WHERE id=$2`,
      [id, attempt],
    ),
  );
  const first = await runner.read((tx) => repo.listOwned(tx, player, 1)),
    next = await runner.read((tx) =>
      repo.listOwned(tx, player, 1, first.nextPosition!),
    );
  expect(first.items[0].id).toBe(id);
  expect(next.items[0].id).toBe(attempt);
  expect(next.nextPosition).toBeNull();
});
it('la consulta no genera auditoría ni altera resultados', async () => {
  const before = (
    await operator.query(
      'SELECT id FROM criterika.eventos_auditoria ORDER BY id',
    )
  ).rows;
  await runner.read((tx) => repo.listOwned(tx, player));
  expect(
    (
      await operator.query(
        'SELECT id FROM criterika.eventos_auditoria ORDER BY id',
      )
    ).rows,
  ).toEqual(before);
});
