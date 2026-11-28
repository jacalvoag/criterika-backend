import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import { PostgresSessionManagementRepository } from '../../src/modules/security/repositories/session-management.repository.js';
import { PostgresSessionAccessRepository } from '../../src/modules/security/repositories/session-access.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
const { operator, runner, own, system, player, other } =
    playerPersistenceFixture(),
  repo = new PostgresSessionManagementRepository();
const session = '00000000-0000-4000-8000-000000000511',
  foreign = '00000000-0000-4000-8000-000000000510',
  old = '$argon2id$FICTICIO_NO_AUTENTICABLE';
it('lista solo sesiones activas propias sin hashes', async () => {
  const page = await runner.read((tx) =>
    repo.listOwned(tx, player, session, new Date()),
  );
  expect(page.items).toHaveLength(1);
  expect(Object.keys(page.items[0]).sort()).toEqual([
    'creadaEn',
    'esActual',
    'expiraEn',
    'id',
    'rol',
  ]);
  expect(page.items[0].esActual).toBe(true);
});
it('rechaza sesión actual ajena y cursor ajeno', async () => {
  await expect(
    runner.read((tx) => repo.listOwned(tx, player, foreign, new Date())),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
  await expect(
    runner.read((tx) =>
      repo.listOwned(tx, player, session, new Date(), 20, {
        sessionId: foreign,
      }),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('confirma identidad en sesión propia y reconoce la ventana', async () => {
  const at = new Date();
  expect(
    await own((tx) => repo.confirmOwned(tx, player, session, old, () => at)),
  ).toBe(true);
  expect(
    await runner.read((tx) =>
      repo.hasRecentConfirmation(tx, player, session, at),
    ),
  ).toBe(true);
  expect(
    await runner.read((tx) =>
      repo.hasRecentConfirmation(tx, other, session, at),
    ),
  ).toBe(false);
});
it('no confirma una credencial obsoleta', async () => {
  expect(
    await own((tx) => repo.confirmOwned(tx, player, session, 'obsoleta')),
  ).toBe(false);
});
it('no permite contexto de otro titular', async () => {
  await expect(
    own((tx) => repo.confirmOwned(tx, other, foreign, old)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('expira exactamente a los cinco minutos y rechaza fecha anterior a la confirmación', async () => {
  const at = new Date();
  await own((tx) => repo.confirmOwned(tx, player, session, old, () => at));
  for (const date of [
    new Date(at.getTime() + 300000),
    new Date(at.getTime() - 1),
  ])
    expect(
      await runner.read((tx) =>
        repo.hasRecentConfirmation(tx, player, session, date),
      ),
    ).toBe(false);
});
it('una revocación concurrente no deja confirmación utilizable', async () => {
  const access = new PostgresSessionAccessRepository();
  await Promise.all([
    own((tx) => repo.confirmOwned(tx, player, session, old)),
    system((tx) => access.revokeOwned(tx, player, session)),
  ]);
  expect(
    await runner.read((tx) =>
      repo.hasRecentConfirmation(tx, player, session, new Date()),
    ),
  ).toBe(false);
});
it('revierte confirmación si falla la transacción', async () => {
  await expect(
    own(async (tx) => {
      await repo.confirmOwned(tx, player, session, old);
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(
    await runner.read((tx) =>
      repo.hasRecentConfirmation(tx, player, session, new Date()),
    ),
  ).toBe(false);
});
it('excluye sesión vencida y rechaza el reloj inválido', async () => {
  await operator.query(
    "UPDATE criterika.sesiones SET creada_en=transaction_timestamp()-interval '2 minutes',expira_en=transaction_timestamp()-interval '1 minute' WHERE id=$1",
    [session],
  );
  expect(await own((tx) => repo.confirmOwned(tx, player, session, old))).toBe(
    false,
  );
  await expect(
    runner.read((tx) =>
      repo.hasRecentConfirmation(tx, player, session, new Date(NaN)),
    ),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it.each([0, 101])('rechaza límite %s', async (limit) => {
  await expect(
    runner.read((tx) => repo.listOwned(tx, player, session, new Date(), limit)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('pagina sesiones con fechas iguales sin repetirlas', async () => {
  await system((tx) =>
    tx.query(
      `INSERT INTO criterika.sesiones(id,cuenta_id,refresh_hash,creada_en,expira_en) SELECT $1,$2,decode(repeat('01',32),'hex'),creada_en,expira_en FROM criterika.sesiones WHERE id=$3`,
      [randomUUID(), player, session],
    ),
  );
  const first = await runner.read((tx) =>
    repo.listOwned(tx, player, session, new Date(), 1),
  );
  const next = await runner.read((tx) =>
    repo.listOwned(tx, player, session, new Date(), 1, first.nextPosition!),
  );
  expect(new Set([...first.items, ...next.items].map((s) => s.id)).size).toBe(
    2,
  );
  expect(next.nextPosition).toBeNull();
});
