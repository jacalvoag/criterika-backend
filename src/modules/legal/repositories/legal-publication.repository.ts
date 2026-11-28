import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { requireAdministrativeRead } from '../../../database/administrative-read.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import { loadAdminLegalDocument } from './admin-legal-read.repository.js';
import { legalDraft, legalVersion } from './legal-document.input.js';
import {
  isPrivacyConfigured,
  type RegistrationPrivacyConfiguration,
} from './legal-privacy.configuration.js';
import type { LegalWriteResult } from './legal-document.types.js';

@Injectable()
export class PostgresLegalPublicationRepository {
  constructor(private readonly privacy: RegistrationPrivacyConfiguration) {}
  /** requiresAcceptance is a server-side legal decision, not an additional HTTP body field. */
  async publish(
    tx: PoolClient,
    id: string,
    expectedVersion: bigint,
    requiresAcceptance: boolean,
    clock: () => Date = () => new Date(),
  ): Promise<LegalWriteResult> {
    legalVersion(expectedVersion);
    await requireAdministrativeRead(tx);
    const { rows: context } = await tx.query<{ motivo: string | null }>(
      "SELECT current_setting('criterika.motivo',true) AS motivo",
    );
    if (!context[0]?.motivo || Array.from(context[0].motivo).length < 10)
      throw new PersistenceInvariantError(
        'La publicación requiere un motivo administrativo.',
      );
    if (!isPrivacyConfigured(this.privacy))
      return { kind: 'legal_configuration_missing' };
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('criterika:legal:current:v1',0))",
    );
    await tx.query(
      `SELECT id FROM criterika.versiones_documentos_legales
      WHERE es_vigente OR id=$1 ORDER BY tipo,id FOR UPDATE`,
      [id],
    );
    const document = await loadAdminLegalDocument(tx, id);
    if (!document) return { kind: 'not_found' };
    if (document.versionRecurso !== expectedVersion)
      return { kind: 'version_conflict' };
    if (document.publicadoEn) return { kind: 'already_published' };
    legalDraft({
      tipo: document.tipo,
      version: document.version,
      contenidoMarkdown: document.contenidoMarkdown,
      tipoCambio: document.tipoCambio,
      finalidades: document.finalidades,
    });
    if (document.tipo === 'AVISO_PRIVACIDAD' && !document.finalidades.length)
      return { kind: 'invalid_purposes' };
    const { rows: previous } = await tx.query<{
      codigo: string;
    }>(`SELECT f.finalidad_codigo AS codigo FROM criterika.documento_finalidades f
      JOIN criterika.versiones_documentos_legales d ON d.id=f.documento_version_id WHERE d.tipo='AVISO_PRIVACIDAD' AND d.es_vigente`);
    const known = new Set(previous.map((p) => p.codigo));
    const newPurpose =
      document.tipo === 'AVISO_PRIVACIDAD' &&
      document.finalidades.some((p) => !known.has(p.id));
    if (
      typeof requiresAcceptance !== 'boolean' ||
      (!requiresAcceptance &&
        (document.tipoCambio !== 'EDITORIAL' || newPurpose))
    )
      return { kind: 'invalid_acceptance_policy' };
    const publishedAt = clock();
    if (
      !(publishedAt instanceof Date) ||
      !Number.isFinite(publishedAt.getTime())
    )
      throw new PersistenceInvariantError('Instante de publicación inválido.');
    const hash = createHash('sha256')
      .update(document.contenidoMarkdown, 'utf8')
      .digest();
    await tx.query(
      `UPDATE criterika.versiones_documentos_legales SET es_vigente=false,version_recurso=version_recurso+1
      WHERE tipo=$1 AND es_vigente`,
      [document.tipo],
    );
    await tx.query(
      `UPDATE criterika.versiones_documentos_legales SET publicada_en=$2,sha256=$3,
      requiere_aceptacion=$4,es_vigente=true,version_recurso=version_recurso+1 WHERE id=$1`,
      [id, new Date(publishedAt.getTime()), hash, requiresAcceptance],
    );
    const published = await loadAdminLegalDocument(tx, id);
    if (!published)
      throw new PersistenceInvariantError('Publicación legal no disponible.');
    return { kind: 'saved', document: published };
  }
}
