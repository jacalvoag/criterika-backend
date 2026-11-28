import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import { PostgresEconomyReadRepository } from '../../src/modules/economy/repositories/economy-read.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
const { operator, runner, player, other } = playerPersistenceFixture(),
  repo = new PostgresEconomyReadRepository();
it('consulta estado persistido y aprobaciones sin recalcular ni escribir', async () => {
  const result = await runner.read((tx) => repo.getOwned(tx, player));
  expect(result?.estadoJugador).toMatchObject({
    gemasSaldo: 450,
    xpTotal: 100,
    vidasTotales: 3,
  });
  expect(result?.aprobaciones).toHaveLength(1);
  expect(result?.reservadas).toBe(0);
  expect(
    (
      await operator.query(
        'SELECT vidas_totales FROM criterika.estados_jugador WHERE cuenta_id=$1',
        [player],
      )
    ).rows[0].vidas_totales,
  ).toBe(3);
});
it('cuenta separadamente concesiones y devuelve null para inexistente', async () => {
  expect(await runner.read((tx) => repo.getOwned(tx, randomUUID()))).toBeNull();
  const result = await runner.read((tx) => repo.getOwned(tx, other));
  expect(result?.aprobaciones).toEqual([]);
  expect(result?.cartasObtenidas).toBe(0);
});
it('movimientos contables descienden por ordinal sin exponer motivo privado', async () => {
  const page = await runner.read((tx) => repo.movementsOwned(tx, player));
  expect(page.items.map((m) => m.cantidad)).toEqual([300, 150]);
  expect(page.items[0].saldoPosterior).toBe(450);
  expect(JSON.stringify(page)).not.toMatch(/motivo|descripcion_privada|correo/);
});
it('pagina movimientos y no acepta ancla ajena', async () => {
  const first = await runner.read((tx) => repo.movementsOwned(tx, player, 1)),
    next = await runner.read((tx) =>
      repo.movementsOwned(tx, player, 1, first.nextPosition!),
    );
  expect(new Set([...first.items, ...next.items].map((i) => i.id)).size).toBe(
    2,
  );
  await expect(
    runner.read((tx) =>
      repo.movementsOwned(tx, other, 1, { movementId: first.items[0].id }),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it.each([0, 101])('rechaza límite %s', async (limit) => {
  await expect(
    runner.read((tx) => repo.movementsOwned(tx, player, limit)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('no mezcla estado ni movimientos de otro jugador', async () => {
  expect(
    (await runner.read((tx) => repo.movementsOwned(tx, other))).items,
  ).toEqual([]);
  expect(
    (await runner.read((tx) => repo.getOwned(tx, other)))?.estadoJugador
      .gemasSaldo,
  ).toBe(0);
});
it('conserva el snapshot mientras otra transacción cambia vidas', async () => {
  await runner.read(async (tx) => {
    const a = await repo.getOwned(tx, player);
    await operator.query(
      'UPDATE criterika.estados_jugador SET vidas_totales=4 WHERE cuenta_id=$1',
      [player],
    );
    expect(await repo.getOwned(tx, player)).toEqual(a);
  });
  expect(
    (await runner.read((tx) => repo.getOwned(tx, player)))?.estadoJugador
      .vidasTotales,
  ).toBe(4);
});
