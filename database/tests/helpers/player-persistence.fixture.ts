import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { legalPublicationFixture } from './legal-publication.fixture.js';
/** Reuses the existing disposable DB guards, pools and hooks; all batch branches share identical bytes. */
export function playerPersistenceFixture() {
  const base = legalPublicationFixture();
  beforeEach(async () => {
    await base.operator.query(
      'TRUNCATE criterika.cuentas,criterika.versiones_documentos_legales,criterika.finalidades CASCADE',
    );
    await base.operator.query(
      readFileSync(
        new URL('../../fixtures/01_flujo_jugable.sql', import.meta.url),
        'utf8',
      ),
    );
    await base.operator
      .query(`BEGIN; SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,gen_random_uuid(),'Fixture compartido del lote');
   UPDATE criterika.cuentas SET correo_confirmado_en=transaction_timestamp(); COMMIT;`);
  });
  const player = '00000000-0000-4000-8000-000000000011',
    other = '00000000-0000-4000-8000-000000000010';
  const own = <T>(work: (tx: PoolClient) => Promise<T>, id = player) =>
    base.runner.run(
      { tipo: 'JUGADOR', actorId: id, requestId: randomUUID() },
      work,
    );
  const system = <T>(work: (tx: PoolClient) => Promise<T>) =>
    base.runner.run({ tipo: 'SISTEMA', requestId: randomUUID() }, work);
  return { ...base, player, other, own, system, clock: () => new Date() };
}
