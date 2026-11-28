import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { TransactionRunner } from '../../../src/database/transaction-runner.js';
import { checkDatabaseConnection } from '../../../src/database/postgres.connection.js';
import { PostgresAdminLegalReadRepository } from '../../../src/modules/legal/repositories/admin-legal-read.repository.js';
import { PostgresLegalDraftRepository } from '../../../src/modules/legal/repositories/legal-draft.repository.js';
import { PostgresLegalPublicationRepository } from '../../../src/modules/legal/repositories/legal-publication.repository.js';
import { PostgresLegalRegistrationRepository } from '../../../src/modules/legal/repositories/registration-legal.repository.js';
import { PostgresLegalAcceptanceRepository } from '../../../src/modules/legal/repositories/legal-acceptance.repository.js';
import { RegistrationLegalService } from '../../../src/modules/legal/registration-legal.service.js';
import type { LegalDraftInput } from '../../../src/modules/legal/repositories/legal-document.types.js';
function testUrl(name: string) {
  const value = process.env[name];
  if (!value) throw new Error('Falta base local desechable.');
  const u = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ||
    !/^\/criterika_prueba_[a-z0-9_]+$/.test(u.pathname)
  )
    throw new Error(
      'Solo se admite PostgreSQL local desechable criterika_prueba_*.',
    );
  return u;
}
export function legalPublicationFixture() {
  const appUrl = testUrl('PERSISTENCE_TEST_URL'),
    adminUrl = testUrl('PERSISTENCE_TEST_ADMIN_URL');
  if (
    appUrl.host !== adminUrl.host ||
    appUrl.pathname !== adminUrl.pathname ||
    appUrl.username === adminUrl.username
  )
    throw new Error(
      'Separar operador y aplicación sobre la misma base de pruebas.',
    );
  const pool = new Pool({
    connectionString: appUrl.toString(),
    max: 4,
    statement_timeout: 6000,
  });
  const operator = new Pool({
    connectionString: adminUrl.toString(),
    max: 4,
    statement_timeout: 6000,
  });
  const runner = new TransactionRunner(pool);
  const configuration = {
    responsibleName: 'Responsable ficticio',
    contactEmail: 'ficticio@example.invalid',
    postalAddress: 'Domicilio ficticio',
  };
  const reads = new PostgresAdminLegalReadRepository(),
    drafts = new PostgresLegalDraftRepository(),
    publication = new PostgresLegalPublicationRepository(configuration);
  const documents = new PostgresLegalRegistrationRepository(configuration),
    acceptances = new PostgresLegalAcceptanceRepository(
      new RegistrationLegalService(documents),
    );
  const actor = '00000000-0000-4000-8000-000000000001',
    player = '00000000-0000-4000-8000-000000000010';
  const terms = '00000000-0000-4000-8000-000000000101',
    privacy = '00000000-0000-4000-8000-000000000102',
    at = new Date('2026-11-28T12:00:00Z');
  const admin = <T>(
    work: (tx: PoolClient) => Promise<T>,
    options?: { requestId?: string; motivo?: string },
  ) =>
    runner.run(
      {
        tipo: 'ADMINISTRADOR',
        actorId: actor,
        requestId: options?.requestId ?? randomUUID(),
        motivo: options?.motivo ?? 'Motivo ficticio de operación legal.',
      },
      work,
    );
  const input = (
    tipo: LegalDraftInput['tipo'] = 'TERMINOS',
    version = 'prueba-2',
    tipoCambio: LegalDraftInput['tipoCambio'] = 'CONTRACTUAL',
  ): LegalDraftInput => ({
    tipo,
    version,
    tipoCambio,
    contenidoMarkdown:
      'Texto legal ficticio suficientemente largo para las pruebas de publicación.',
    finalidades:
      tipo === 'TERMINOS'
        ? []
        : [
            {
              id: 'cuenta',
              descripcion: 'Finalidad presentada en la revisión ficticia.',
              necesaria: true,
            },
          ],
  });
  const create = async (value = input()) => {
    const result = await admin((tx) => drafts.create(tx, value));
    if (result.kind !== 'saved')
      throw new Error('No se pudo preparar el borrador ficticio.');
    return result.document;
  };
  const get = (id: string) => admin((tx) => reads.get(tx, id));
  const publish = (id: string, version = 1n, requires = true) =>
    admin((tx) => publication.publish(tx, id, version, requires, () => at));
  const state = async () => ({
    documents: (
      await operator.query(
        'SELECT * FROM criterika.versiones_documentos_legales ORDER BY id',
      )
    ).rows,
    purposes: (
      await operator.query(
        'SELECT * FROM criterika.documento_finalidades ORDER BY documento_version_id,finalidad_codigo',
      )
    ).rows,
    audit: (
      await operator.query(
        'SELECT * FROM criterika.eventos_auditoria ORDER BY id',
      )
    ).rows,
  });
  beforeAll(async () => {
    await checkDatabaseConnection(pool, false);
  });
  beforeEach(async () => {
    const { rows } = await operator.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='criterika'",
    );
    if (rows.length !== 53)
      throw new Error('Preparar la base desechable con migración 0001.');
    await operator.query(
      'TRUNCATE ' +
        rows
          .map((r) => 'criterika."' + r.tablename.replaceAll('"', '""') + '"')
          .join(',') +
        ' CASCADE',
    );
    await operator.query(
      readFileSync(
        new URL('../../fixtures/02_registro.sql', import.meta.url),
        'utf8',
      ),
    );
    await operator.query(`BEGIN; SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,gen_random_uuid(),'Fixture de publicación legal');
  INSERT INTO criterika.cuentas(id,rol,correo_normalizado,correo_presentacion,contrasena_hash,nombre,apellidos,fecha_nacimiento)
  VALUES('${player}','JUGADOR','persona@example.invalid','persona@example.invalid','$argon2id$FICTICIO_NO_AUTENTICABLE','Nombre ficticio','Prueba','2000-01-01');
  INSERT INTO criterika.estados_jugador(cuenta_id) VALUES('${player}'); COMMIT;`);
  });
  afterAll(async () => {
    await pool.end();
    await operator.end();
  });
  return {
    pool,
    operator,
    runner,
    configuration,
    reads,
    drafts,
    publication,
    documents,
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
  };
}
