import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { requireAdministrativeRead } from '../../../database/administrative-read.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import { loadAdminLegalDocument } from './admin-legal-read.repository.js';
import { legalDraft, legalVersion } from './legal-document.input.js';
import type {
  LegalDraftInput,
  LegalWriteResult,
} from './legal-document.types.js';

/** Label locks precede row locks; every draft writer uses the same destination-label lock. */
async function lockLabel(tx: PoolClient, input: LegalDraftInput) {
  await tx.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('criterika:legal:label:' || $1::text || ':' || $2::text,0))",
    [input.tipo, input.version],
  );
}
async function purposes(tx: PoolClient, id: string, input: LegalDraftInput) {
  for (const p of [...input.finalidades].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    // A stable code is never redefined by editing another document's displayed description.
    await tx.query(
      `INSERT INTO criterika.finalidades(codigo,descripcion_base,necesaria) VALUES($1,$2,true)
      ON CONFLICT(codigo) DO NOTHING`,
      [p.id, p.descripcion],
    );
    await tx.query(
      `INSERT INTO criterika.documento_finalidades(documento_version_id,finalidad_codigo,descripcion_presentada)
      VALUES($1,$2,$3)`,
      [id, p.id, p.descripcion],
    );
  }
}
async function saved(tx: PoolClient, id: string): Promise<LegalWriteResult> {
  const document = await loadAdminLegalDocument(tx, id);
  if (!document)
    throw new PersistenceInvariantError('Borrador legal no disponible.');
  return { kind: 'saved', document };
}
@Injectable()
export class PostgresLegalDraftRepository {
  async create(
    tx: PoolClient,
    value: LegalDraftInput,
  ): Promise<LegalWriteResult> {
    const input = legalDraft(value);
    await requireAdministrativeRead(tx);
    await lockLabel(tx, input);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO criterika.versiones_documentos_legales
      (tipo,etiqueta_version,contenido_markdown,tipo_cambio,requiere_aceptacion)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(tipo,etiqueta_version) DO NOTHING RETURNING id`,
      [
        input.tipo,
        input.version,
        input.contenidoMarkdown,
        input.tipoCambio,
        input.tipoCambio !== 'EDITORIAL',
      ],
    );
    if (!rows[0]) return { kind: 'version_label_conflict' };
    await purposes(tx, rows[0].id, input);
    return saved(tx, rows[0].id);
  }
  async replace(
    tx: PoolClient,
    id: string,
    expectedVersion: bigint,
    value: LegalDraftInput,
  ): Promise<LegalWriteResult> {
    const input = legalDraft(value);
    legalVersion(expectedVersion);
    await requireAdministrativeRead(tx);
    await lockLabel(tx, input);
    await tx.query(
      'SELECT id FROM criterika.versiones_documentos_legales WHERE id=$1 FOR UPDATE',
      [id],
    );
    const current = await loadAdminLegalDocument(tx, id);
    if (!current) return { kind: 'not_found' };
    if (current.versionRecurso !== expectedVersion)
      return { kind: 'version_conflict' };
    if (current.publicadoEn) return { kind: 'already_published' };
    const duplicate = await tx.query(
      'SELECT id FROM criterika.versiones_documentos_legales WHERE tipo=$1 AND etiqueta_version=$2 AND id<>$3',
      [input.tipo, input.version, id],
    );
    if (duplicate.rowCount) return { kind: 'version_label_conflict' };
    await tx.query(
      `UPDATE criterika.versiones_documentos_legales SET tipo=$2,etiqueta_version=$3,
      contenido_markdown=$4,tipo_cambio=$5,requiere_aceptacion=$6,sha256=NULL,version_recurso=version_recurso+1 WHERE id=$1`,
      [
        id,
        input.tipo,
        input.version,
        input.contenidoMarkdown,
        input.tipoCambio,
        input.tipoCambio !== 'EDITORIAL',
      ],
    );
    await tx.query(
      'DELETE FROM criterika.documento_finalidades WHERE documento_version_id=$1',
      [id],
    );
    await purposes(tx, id, input);
    return saved(tx, id);
  }
}
