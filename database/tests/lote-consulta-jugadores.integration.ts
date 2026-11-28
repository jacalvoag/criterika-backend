import { randomUUID } from 'node:crypto';
import { playerPersistenceFixture } from './helpers/player-persistence.fixture.js';
import {
  PostgresAdminPlayerRepository,
  type PlayerStateFacts,
} from '../../src/modules/accounts/repositories/admin-player.repository.js';
import { PersistenceInvariantError } from '../../src/database/persistence-values.js';
import { AdministrativeReadForbiddenError } from '../../src/database/administrative-read.js';
const { operator, runner, admin, system, actor, player } =
  playerPersistenceFixture();
// Test-only classifier. The real precedence belongs to accounts; production has no default implementation.
const classify = (f: PlayerStateFacts) =>
  f.situacionOperativa === 'CANCELACION_EN_PROCESO'
    ? ('CANCELACION_EN_PROCESO' as const)
    : f.bloqueo
      ? ('BLOQUEADA' as const)
      : f.sancionTemporal
        ? ('SUSPENDIDA' as const)
        : f.privacidad || !f.mayorDeEdad
          ? ('RESTRINGIDA' as const)
          : ('ACTIVA' as const);
const repo = new PostgresAdminPlayerRepository(classify);
it('lista tres jugadores mínimos sin datos personales de acceso', async () => {
  const result = await admin((tx) => repo.list(tx, new Date()));
  expect(result.items).toHaveLength(3);
  expect(Object.keys(result.items[0]).sort()).toEqual([
    'creadaEn',
    'estado',
    'id',
    'nombreVisible',
  ]);
});
it('filtra nombre literal sin comodines ni interpolación SQL', async () => {
  expect(
    (await admin((tx) => repo.list(tx, new Date(), { q: '11' }))).items.map(
      (p) => p.id,
    ),
  ).toEqual([player]);
  for (const q of ['%', "' OR true --"])
    expect(
      (await admin((tx) => repo.list(tx, new Date(), { q }))).items,
    ).toEqual([]);
});
it('filtra estado antes de completar la página y pagina sin pérdidas', async () => {
  await operator.query(
    "UPDATE criterika.cuentas SET situacion_operativa='CANCELACION_EN_PROCESO' WHERE id=$1",
    [player],
  );
  const result = await admin((tx) =>
    repo.list(tx, new Date(), { estado: 'CANCELACION_EN_PROCESO' }, 1),
  );
  expect(result.items.map((p) => p.id)).toEqual([player]);
  expect(result.nextPosition).toBeNull();
});
it('obtiene hechos de economía/progreso propios de un jugador sin hashes ni correo', async () => {
  const value = await admin((tx) => repo.get(tx, player, new Date()));
  expect(value?.estadoJugador?.gemasSaldo).toBe(450);
  expect(value?.aprobaciones).toHaveLength(1);
  expect(JSON.stringify(value)).not.toMatch(
    /contrasena|correo|fechaNacimiento/,
  );
  expect(await admin((tx) => repo.get(tx, actor, new Date()))).toBeNull();
});
it('devuelve null para inexistente', async () => {
  expect(
    await admin((tx) => repo.get(tx, randomUUID(), new Date())),
  ).toBeNull();
});
it('rechaza lectura pública', async () => {
  await expect(
    system((tx) => repo.list(tx, new Date())),
  ).rejects.toBeInstanceOf(AdministrativeReadForbiddenError);
});
it('pagina resultados con ancla y valida su pertenencia', async () => {
  const a = await admin((tx) => repo.list(tx, new Date(), {}, 1)),
    b = await admin((tx) => repo.list(tx, new Date(), {}, 2, a.nextPosition!));
  expect(new Set([...a.items, ...b.items].map((p) => p.id)).size).toBe(3);
  await expect(
    admin((tx) => repo.list(tx, new Date(), {}, 1, { playerId: actor })),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it.each([0, 101])('rechaza límites %s', async (limit) => {
  await expect(
    admin((tx) => repo.list(tx, new Date(), {}, limit)),
  ).rejects.toBeInstanceOf(PersistenceInvariantError);
});
it('consulta sin modificar cuentas ni auditoría', async () => {
  const before = (
    await operator.query(
      'SELECT id FROM criterika.eventos_auditoria ORDER BY id',
    )
  ).rows;
  await admin((tx) => repo.get(tx, player, new Date()));
  expect(
    (
      await operator.query(
        'SELECT id FROM criterika.eventos_auditoria ORDER BY id',
      )
    ).rows,
  ).toEqual(before);
});
