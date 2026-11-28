import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import { PostgresCollectionReadRepository } from '../../src/modules/collection/repositories/collection-read.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
const { operator, runner, player, other } = playerPersistenceFixture(),
  repo = new PostgresCollectionReadRepository();
const card = '00000000-0000-4000-8000-000000006000';
async function acquire() {
  await operator.query(
    `INSERT INTO criterika.cartas_obtenidas(jugador_id,carta_id,aprobacion_origen_id) VALUES($1,$2,'00000000-0000-4000-8000-000000008001')`,
    [player, card],
  );
}
it('catálogo público conserva silueta sin revelar imágenes no obtenidas', async () => {
  const view = await runner.read((tx) => repo.getOwned(tx, player, card));
  expect(view).toMatchObject({
    obtenida: false,
    imagenBaseMediaId: null,
    etapaActual: 0,
  });
  expect(view?.evoluciones).toHaveLength(3);
  expect(view?.evoluciones.every((e) => e.imagenMediaId === null)).toBe(true);
  expect(view?.nombre).toBe('Carta publicada');
});
it('una carta adquirida expone solo base y conserva ocultas etapas futuras', async () => {
  await acquire();
  const view = await runner.read((tx) => repo.getOwned(tx, player, card));
  expect(view?.imagenBaseMediaId).not.toBeNull();
  expect(view?.evoluciones.map((e) => e.disponible)).toEqual([
    true,
    false,
    false,
  ]);
  expect(view?.evoluciones.every((e) => e.imagenMediaId === null)).toBe(true);
});
it('no revela la posesión ni imágenes a otro jugador', async () => {
  await acquire();
  expect(
    (await runner.read((tx) => repo.getOwned(tx, other, card)))?.obtenida,
  ).toBe(false);
});
it('conserva carta deshabilitada ya adquirida y bloquea nuevas etapas', async () => {
  await acquire();
  await operator.query(
    "UPDATE criterika.cartas SET estado='DESHABILITADO' WHERE id=$1",
    [card],
  );
  const view = await runner.read((tx) => repo.getOwned(tx, player, card));
  expect(view?.obtenida).toBe(true);
  expect(view?.evoluciones.every((e) => !e.disponible)).toBe(true);
  expect(await runner.read((tx) => repo.getOwned(tx, other, card))).toBeNull();
});
it('no muestra borradores ni carta inexistente', async () => {
  for (const id of ['00000000-0000-4000-8000-000000006001', randomUUID()])
    expect(await runner.read((tx) => repo.getOwned(tx, player, id))).toBeNull();
});
it('pagina sin repetir y rechaza ancla invisible', async () => {
  const page = await runner.read((tx) => repo.listOwned(tx, player, 1));
  expect(page.items).toHaveLength(1);
  await expect(
    runner.read((tx) =>
      repo.listOwned(tx, player, 1, { cardId: randomUUID() }),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it.each([0, 101])('rechaza límite %s', async (limit) => {
  await expect(
    runner.read((tx) => repo.listOwned(tx, player, limit)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
