import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import { testEconomy, setGems } from './helpers/purchase-receipt.fixture.js';
import { PostgresLifePurchaseRepository } from '../../src/modules/economy/repositories/life-purchase.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
const { operator, runner, own, system, player, other } =
    playerPersistenceFixture(),
  repo = new PostgresLifePurchaseRepository(testEconomy);
beforeEach(async () => {
  await operator.query(
    "UPDATE criterika.estados_jugador SET vidas_totales=2,proxima_regeneracion_en=transaction_timestamp()+interval '1 hour' WHERE cuenta_id=$1",
    [player],
  );
});
const buy = (
  id = randomUUID(),
  pack: 'VIDA_1' | 'VIDAS_3' | 'VIDAS_5' = 'VIDA_1',
) => own((tx) => repo.purchaseOwned(tx, player, id, pack));
const state = async () => ({
  s: (
    await operator.query(
      'SELECT * FROM criterika.estados_jugador ORDER BY cuenta_id',
    )
  ).rows,
  m: (
    await operator.query(
      'SELECT id FROM criterika.movimientos_gemas ORDER BY id',
    )
  ).rows,
  r: (await operator.query('SELECT * FROM criterika.compras_vidas ORDER BY id'))
    .rows,
});
it('cargo, vidas y recibo se confirman juntos con precios existentes', async () => {
  const result = await buy();
  expect(result).toMatchObject({
    kind: 'purchased',
    receipt: {
      paqueteId: 'VIDA_1',
      vidasAgregadas: 1,
      gemasGastadas: 100,
      economia: { gemas: 350, vidas: { totales: 3 } },
    },
  });
  expect(
    (
      await operator.query(
        'SELECT gemas_saldo::text AS gems,vidas_totales FROM criterika.estados_jugador WHERE cuenta_id=$1',
        [player],
      )
    ).rows[0],
  ).toEqual({ gems: '350', vidas_totales: 3 });
});
it('misma intención conserva un recibo histórico y un solo cargo', async () => {
  const id = randomUUID(),
    first = await buy(id);
  await buy();
  const replay = await buy(id);
  expect(replay.kind).toBe('existing');
  if (first.kind === 'purchased' && replay.kind === 'existing')
    expect(replay.receipt).toEqual(first.receipt);
  expect(
    (
      await operator.query(
        'SELECT id FROM criterika.compras_vidas WHERE id=$1',
        [id],
      )
    ).rows,
  ).toHaveLength(1);
});
it('recibo no se lee desde otra cuenta y su ID no acepta otro paquete', async () => {
  const id = randomUUID();
  await buy(id);
  expect(await runner.read((tx) => repo.getOwned(tx, other, id))).toBeNull();
  expect(await buy(id, 'VIDAS_3')).toEqual({ kind: 'receipt_conflict' });
});
it('dos solicitudes iguales simultáneas cargan una sola vez', async () => {
  const id = randomUUID();
  expect(
    (await Promise.all([buy(id), buy(id)])).map((r) => r.kind).sort(),
  ).toEqual(['existing', 'purchased']);
});
it('dos intenciones que excederían capacidad no pierden saldo', async () => {
  await operator.query(
    'UPDATE criterika.estados_jugador SET vidas_totales=4 WHERE cuenta_id=$1',
    [player],
  );
  const results = await Promise.all([buy(), buy()]);
  expect(results.map((r) => r.kind).sort()).toEqual(['purchased', 'rejected']);
  expect(
    (
      await operator.query(
        'SELECT gemas_saldo::text AS gems FROM criterika.estados_jugador WHERE cuenta_id=$1',
        [player],
      )
    ).rows[0].gems,
  ).toBe('350');
});
it('rechaza paquete que excede capacidad y saldo insuficiente sin recibo parcial', async () => {
  let before = await state();
  expect(await buy(randomUUID(), 'VIDAS_5')).toMatchObject({
    kind: 'rejected',
    reason: 'LIFE_CAP_EXCEEDED',
  });
  expect(await state()).toEqual(before);
  await setGems(operator, player, 0);
  before = await state();
  expect(await buy()).toMatchObject({
    kind: 'rejected',
    reason: 'INSUFFICIENT_GEMS',
  });
  expect(await state()).toEqual(before);
});
it('respeta regeneración y no reinicia el reloj al comprar', async () => {
  const before = (
    await operator.query(
      'SELECT proxima_regeneracion_en FROM criterika.estados_jugador WHERE cuenta_id=$1',
      [player],
    )
  ).rows[0].proxima_regeneracion_en;
  await buy();
  expect(
    (
      await operator.query(
        'SELECT proxima_regeneracion_en FROM criterika.estados_jugador WHERE cuenta_id=$1',
        [player],
      )
    ).rows[0].proxima_regeneracion_en,
  ).toEqual(before);
});
it('revierte recibo y saldo cuando falla el libro contable', async () => {
  const before = await state();
  await operator.query(
    "ALTER TABLE criterika.movimientos_gemas ADD CONSTRAINT lote_compra_falla CHECK(tipo<>'COMPRA_VIDAS') NOT VALID",
  );
  try {
    await expect(buy()).rejects.toMatchObject({ code: '23514' });
    expect(await state()).toEqual(before);
  } finally {
    await operator.query(
      'ALTER TABLE criterika.movimientos_gemas DROP CONSTRAINT lote_compra_falla',
    );
  }
});
it('revierte todo si la transacción exterior falla', async () => {
  const before = await state();
  await expect(
    own(async (tx) => {
      await repo.purchaseOwned(tx, player, randomUUID(), 'VIDA_1');
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(await state()).toEqual(before);
});
it('rechaza una proyección inventada del recibo', async () => {
  const bad = new PostgresLifePurchaseRepository((f) => ({
    ...testEconomy(f),
    gemas: 99999,
  }));
  const before = await state();
  await expect(
    own((tx) => bad.purchaseOwned(tx, player, randomUUID(), 'VIDA_1')),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect(await state()).toEqual(before);
});
it('rechaza contexto técnico y otro titular', async () => {
  await expect(
    system((tx) => repo.purchaseOwned(tx, player, randomUUID(), 'VIDA_1')),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  await expect(
    own((tx) => repo.purchaseOwned(tx, other, randomUUID(), 'VIDA_1')),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
