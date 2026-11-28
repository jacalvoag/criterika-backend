import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import { testEconomy, setGems } from './helpers/purchase-receipt.fixture.js';
import { PostgresEvolutionPurchaseRepository } from '../../src/modules/economy/repositories/evolution-purchase.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
const { operator, runner, own, system, player, other } =
    playerPersistenceFixture(),
  repo = new PostgresEvolutionPurchaseRepository(testEconomy);
const card = '00000000-0000-4000-8000-000000006000';
beforeEach(async () => {
  await operator.query(
    `INSERT INTO criterika.cartas_obtenidas(jugador_id,carta_id,aprobacion_origen_id) VALUES($1,$2,'00000000-0000-4000-8000-000000008001')`,
    [player, card],
  );
});
const buy = (id = randomUUID(), stage: 1 | 2 | 3 = 1) =>
  own((tx) => repo.purchaseOwned(tx, player, id, card, stage));
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
  r: (
    await operator.query(
      'SELECT * FROM criterika.evoluciones_obtenidas ORDER BY id',
    )
  ).rows,
});
it('confirma etapa consecutiva, cargo y snapshot de carta/economía', async () => {
  expect(await buy()).toMatchObject({
    kind: 'purchased',
    receipt: {
      etapa: 1,
      gemasGastadas: 150,
      carta: { etapaActual: 1 },
      economia: { gemas: 300 },
    },
  });
  expect(
    (
      await operator.query(
        'SELECT gemas_saldo::text AS gems FROM criterika.estados_jugador WHERE cuenta_id=$1',
        [player],
      )
    ).rows[0].gems,
  ).toBe('300');
});
it('misma intención simultánea genera solo un cargo', async () => {
  const id = randomUUID();
  expect(
    (await Promise.all([buy(id), buy(id)])).map((r) => r.kind).sort(),
  ).toEqual(['existing', 'purchased']);
});
it('dos intenciones de misma etapa no duplican la adquisición', async () => {
  const results = await Promise.all([buy(), buy()]);
  expect(results.map((r) => r.kind).sort()).toEqual(['purchased', 'rejected']);
  expect(
    (await operator.query('SELECT id FROM criterika.evoluciones_obtenidas'))
      .rows,
  ).toHaveLength(1);
});
it('impide saltar etapas y cobrar etapas deshabilitadas', async () => {
  expect(await buy(randomUUID(), 2)).toMatchObject({
    kind: 'rejected',
    reason: 'EVOLUTION_ORDER_REQUIRED',
  });
  await operator.query(
    'UPDATE criterika.etapas_carta SET habilitada=false WHERE carta_id=$1 AND numero=1',
    [card],
  );
  expect(await buy()).toMatchObject({
    kind: 'rejected',
    reason: 'EVOLUTION_DISABLED',
  });
});
it('impide comprar una carta no obtenida', async () => {
  expect(
    await own(
      (tx) => repo.purchaseOwned(tx, other, randomUUID(), card, 1),
      other,
    ),
  ).toMatchObject({ kind: 'rejected', reason: 'CARD_NOT_OBTAINED' });
});
it('rechaza saldo insuficiente sin mutación parcial', async () => {
  await setGems(operator, player, 0);
  const before = await state();
  expect(await buy()).toMatchObject({
    kind: 'rejected',
    reason: 'INSUFFICIENT_GEMS',
  });
  expect(await state()).toEqual(before);
});
it('preserva el recibo aunque carta y saldo cambien después', async () => {
  const id = randomUUID(),
    first = await buy(id);
  await operator.query(
    'UPDATE criterika.cartas SET nombre_publicado=$2 WHERE id=$1',
    [card, 'Otro nombre publicado'],
  );
  await setGems(operator, player, 900);
  const replay = await buy(id);
  if (first.kind === 'purchased' && replay.kind === 'existing')
    expect(replay.receipt).toEqual(first.receipt);
  else throw new Error('Falta recibo');
  expect(await runner.read((tx) => repo.getOwned(tx, other, id))).toBeNull();
});
it('revierte cargo, adquisición y recibo si falla el libro contable', async () => {
  const before = await state();
  await operator.query(
    "ALTER TABLE criterika.movimientos_gemas ADD CONSTRAINT lote_evolucion_falla CHECK(tipo<>'EVOLUCION') NOT VALID",
  );
  try {
    await expect(buy()).rejects.toMatchObject({ code: '23514' });
    expect(await state()).toEqual(before);
  } finally {
    await operator.query(
      'ALTER TABLE criterika.movimientos_gemas DROP CONSTRAINT lote_evolucion_falla',
    );
  }
});
it('rechaza contexto público y otro titular', async () => {
  await expect(
    system((tx) => repo.purchaseOwned(tx, player, randomUUID(), card, 1)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('revierte todo si falla la transacción exterior', async () => {
  const before = await state();
  await expect(
    own(async (tx) => {
      await repo.purchaseOwned(tx, player, randomUUID(), card, 1);
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(await state()).toEqual(before);
});
it('respeta el orden completo con los costes existentes', async () => {
  await setGems(operator, player, 1500);
  for (const stage of [1, 2, 3] as const)
    expect(await buy(randomUUID(), stage)).toMatchObject({
      kind: 'purchased',
      receipt: { etapa: stage, gemasGastadas: [150, 350, 500][stage - 1] },
    });
  expect(
    (
      await operator.query(
        'SELECT gemas_saldo::text AS gems FROM criterika.estados_jugador WHERE cuenta_id=$1',
        [player],
      )
    ).rows[0].gems,
  ).toBe('500');
});

it('no cobra una etapa cuya imagen dejó de estar activa', async () => {
  await operator.query(
    "UPDATE criterika.archivos SET estado='PENDIENTE_BORRADO' WHERE id='00000000-0000-4000-8000-000000005001'",
  );
  const before = await state();
  expect(await buy()).toMatchObject({
    kind: 'rejected',
    reason: 'EVOLUTION_DISABLED',
  });
  expect(await state()).toEqual(before);
});

it('un proyector que muta sus datos no puede alterar la compra ni falsear el recibo', async () => {
  const bad = new PostgresEvolutionPurchaseRepository((facts) => {
      facts.state.vidasTotales = 0;
      return testEconomy(facts);
    }),
    before = await state();
  await expect(
    own((tx) => bad.purchaseOwned(tx, player, randomUUID(), card, 1)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  expect(await state()).toEqual(before);
});
