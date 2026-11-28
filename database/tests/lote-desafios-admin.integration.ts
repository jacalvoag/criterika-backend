import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import { PostgresAdminChallengeRepository } from '../../src/modules/auth/repositories/admin-challenge.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
const { operator, system, own, actor, player } = playerPersistenceFixture(),
  repo = new PostgresAdminChallengeRepository();
const old = '$argon2id$FICTICIO_NO_AUTENTICABLE',
  secret = {
    verifier: Buffer.alloc(32, 1),
    encryptedMail: Buffer.from('CIFRADO_FICTICIO'),
  };
async function issue() {
  const id = randomUUID(),
    at = new Date();
  expect(
    await system((tx) => repo.create(tx, actor, old, id, secret, () => at)),
  ).toBe(true);
  return { id, at };
}
it('solo crea desafío para una de tres cuentas administrativas con credencial verificada', async () => {
  const { id } = await issue();
  const { rows } = await operator.query(
    'SELECT verificador_hash,mensaje_envio_cifrado FROM criterika.desafios_verificacion WHERE id=$1',
    [id],
  );
  expect(rows[0]).toEqual({
    verificador_hash: secret.verifier,
    mensaje_envio_cifrado: secret.encryptedMail,
  });
  expect(
    await system((tx) => repo.create(tx, player, old, randomUUID(), secret)),
  ).toBe(false);
  expect(
    await system((tx) =>
      repo.create(tx, actor, 'obsoleta', randomUUID(), secret),
    ),
  ).toBe(false);
});
it('consume una sola vez', async () => {
  const { id, at } = await issue();
  expect(
    await system((tx) => repo.consume(tx, id, secret.verifier, () => at)),
  ).toEqual({ kind: 'verified', accountId: actor });
  expect(await system((tx) => repo.consume(tx, id, secret.verifier))).toEqual({
    kind: 'invalid',
  });
});
it('persiste cinco fallos y quema el código al alcanzar el límite', async () => {
  const { id } = await issue();
  for (let n = 0; n < 5; n++)
    expect(
      await system((tx) => repo.consume(tx, id, Buffer.alloc(32, 2))),
    ).toEqual({ kind: 'invalid' });
  expect(await system((tx) => repo.consume(tx, id, secret.verifier))).toEqual({
    kind: 'invalid',
  });
  const { rows } = await operator.query(
    'SELECT intentos_fallidos,usado_en,mensaje_envio_cifrado FROM criterika.desafios_verificacion WHERE id=$1',
    [id],
  );
  expect(rows[0].intentos_fallidos).toBe(5);
  expect(rows[0].usado_en).not.toBeNull();
  expect(rows[0].mensaje_envio_cifrado).toBeNull();
});
it('respetan sesenta segundos de reenvío y el código anterior deja de servir', async () => {
  const { id, at } = await issue(),
    replacement = { ...secret, verifier: Buffer.alloc(32, 3) };
  expect(
    await system((tx) =>
      repo.resend(tx, id, replacement, () => new Date(at.getTime() + 59999)),
    ),
  ).toBe(false);
  expect(
    await system((tx) =>
      repo.resend(tx, id, replacement, () => new Date(at.getTime() + 60000)),
    ),
  ).toBe(true);
  expect(
    await system((tx) =>
      repo.consume(
        tx,
        id,
        secret.verifier,
        () => new Date(at.getTime() + 60001),
      ),
    ),
  ).toEqual({ kind: 'invalid' });
  expect(
    await system((tx) =>
      repo.consume(
        tx,
        id,
        replacement.verifier,
        () => new Date(at.getTime() + 60001),
      ),
    ),
  ).toMatchObject({ kind: 'verified' });
});
it('vence exactamente a diez minutos', async () => {
  const { id, at } = await issue();
  expect(
    await system((tx) =>
      repo.consume(
        tx,
        id,
        secret.verifier,
        () => new Date(at.getTime() + 600000),
      ),
    ),
  ).toEqual({ kind: 'invalid' });
});
it('concurrencia acepta un solo consumo', async () => {
  const { id } = await issue();
  const results = await Promise.all([
    system((tx) => repo.consume(tx, id, secret.verifier)),
    system((tx) => repo.consume(tx, id, secret.verifier)),
  ]);
  expect(results.map((r) => r.kind).sort()).toEqual(['invalid', 'verified']);
});
it('un desafío nuevo invalida el anterior', async () => {
  const first = await issue(),
    second = await issue();
  expect(
    await system((tx) => repo.consume(tx, first.id, secret.verifier)),
  ).toEqual({ kind: 'invalid' });
  expect(
    await system((tx) => repo.consume(tx, second.id, secret.verifier)),
  ).toMatchObject({ kind: 'verified' });
});
it('revierte consumo si falla la creación coordinada de sesión', async () => {
  const { id } = await issue();
  await expect(
    system(async (tx) => {
      await repo.consume(tx, id, secret.verifier);
      await tx.query('SELECT 1/0');
    }),
  ).rejects.toMatchObject({ code: '22012' });
  expect(
    await system((tx) => repo.consume(tx, id, secret.verifier)),
  ).toMatchObject({ kind: 'verified' });
});
it('no mezcla otra finalidad ni contexto de jugador', async () => {
  const { id } = await issue();
  await operator.query(
    "UPDATE criterika.desafios_verificacion SET finalidad='RECUPERACION' WHERE id=$1",
    [id],
  );
  expect(await system((tx) => repo.consume(tx, id, secret.verifier))).toEqual({
    kind: 'invalid',
  });
  await expect(
    own((tx) => repo.consume(tx, id, secret.verifier)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('rechaza verificadores mal formados', async () => {
  await expect(
    system((tx) => repo.consume(tx, randomUUID(), Buffer.alloc(1))),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});

it('restablecer credenciales administrativas invalida el desafío pendiente', async () => {
  const { PostgresPasswordRepository } =
    await import('../../src/modules/auth/repositories/password.repository.js');
  const passwords = new PostgresPasswordRepository(),
    { id } = await issue(),
    recovery = randomUUID();
  const hash =
    '$argon2id$v=19$m=65536,t=3,p=1$' +
    Buffer.alloc(16, 1).toString('base64').replaceAll('=', '') +
    '$' +
    Buffer.alloc(32, 2).toString('base64').replaceAll('=', '');
  await system((tx) =>
    passwords.createRecovery(tx, {
      challengeId: recovery,
      accountId: actor,
      verifierHash: secret.verifier,
      encryptedMail: secret.encryptedMail,
    }),
  );
  expect(
    await system((tx) => passwords.reset(tx, recovery, secret.verifier, hash)),
  ).toBe(true);
  expect(await system((tx) => repo.consume(tx, id, secret.verifier))).toEqual({
    kind: 'invalid',
  });
});
