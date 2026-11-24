import type { PoolClient } from 'pg';
import type { LegalRegistrationRepository } from '../registration-legal.service.js';
import type { PublishedRegistrationDocument } from '../current-registration-documents.js';

export interface RegistrationPrivacyConfiguration {
  responsibleName: string;
  contactEmail: string;
  postalAddress: string;
}

export class PostgresLegalRegistrationRepository implements LegalRegistrationRepository {
  constructor(private readonly privacy: RegistrationPrivacyConfiguration) {}
  private configured(): boolean {
    return (
      Object.values(this.privacy).every(
        (v) => typeof v === 'string' && v.trim().length > 0,
      ) && /^[^\s@]+@[^\s@]+$/.test(this.privacy.contactEmail)
    );
  }
  async getCurrentForShare(tx: PoolClient) {
    if (!this.configured()) return null;
    // Publication must take the exclusive companion lock before changing the selection.
    await tx.query(
      "SELECT pg_advisory_xact_lock_shared(hashtextextended('criterika:legal:current:v1',0))",
    );
    return this.selection(tx, true);
  }
  /** Use with TransactionRunner.read for the GET; no row locks in READ ONLY. */
  async getCurrentSnapshot(tx: PoolClient) {
    if (!this.configured()) return null;
    return this.selection(tx, false);
  }
  private async selection(tx: PoolClient, lock: boolean) {
    // Lock every published revision in stable order, then re-read current flags after waiting.
    if (lock)
      await tx.query(`SELECT id FROM criterika.versiones_documentos_legales
      WHERE publicada_en IS NOT NULL ORDER BY tipo,id FOR SHARE`);
    const { rows } = await tx.query<{
      id: string;
      tipo: string;
    }>(`SELECT id,tipo FROM criterika.versiones_documentos_legales
      WHERE es_vigente AND publicada_en IS NOT NULL ORDER BY tipo,id`);
    const terms = rows.find((r) => r.tipo === 'TERMINOS');
    const notice = rows.find((r) => r.tipo === 'AVISO_PRIVACIDAD');
    if (rows.length !== 2 || !terms || !notice) return null;
    const { rows: purposes } = await tx.query<{
      finalidad_codigo: string;
      necesaria: boolean;
    }>(
      `SELECT d.finalidad_codigo,f.necesaria
      FROM criterika.documento_finalidades d JOIN criterika.finalidades f ON f.codigo=d.finalidad_codigo
      WHERE d.documento_version_id=$1 ORDER BY d.finalidad_codigo`,
      [notice.id],
    );
    if (!purposes.length) return null;
    return {
      termsVersionId: terms.id,
      privacyVersionId: notice.id,
      purposeCodes: purposes.map((p) => p.finalidad_codigo),
      requiredPurposeCodes: purposes
        .filter((p) => p.necesaria)
        .map((p) => p.finalidad_codigo),
    };
  }
  async getPublishedDocument(
    tx: PoolClient,
    id: string,
  ): Promise<PublishedRegistrationDocument | null> {
    const { rows } = await tx.query(
      `SELECT * FROM criterika.versiones_documentos_legales WHERE id=$1 AND publicada_en IS NOT NULL`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    const { rows: purposes } = await tx.query(
      `SELECT d.finalidad_codigo,d.descripcion_presentada,f.necesaria
      FROM criterika.documento_finalidades d JOIN criterika.finalidades f ON f.codigo=d.finalidad_codigo
      WHERE d.documento_version_id=$1 ORDER BY d.finalidad_codigo`,
      [id],
    );
    return {
      id: r.id as string,
      type: r.tipo as PublishedRegistrationDocument['type'],
      versionLabel: r.etiqueta_version as string,
      markdown: r.contenido_markdown as string,
      sha256: r.sha256 as Buffer,
      publishedAt: r.publicada_en as Date,
      requiresAcceptance: r.requiere_aceptacion as boolean,
      purposes: purposes.map((p) => ({
        code: p.finalidad_codigo as string,
        description: p.descripcion_presentada as string,
        necessary: p.necesaria as boolean,
      })),
    };
  }
  async createAcceptance(
    tx: PoolClient,
    i: Parameters<LegalRegistrationRepository['createAcceptance']>[1],
  ): Promise<string> {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO criterika.aceptaciones_legales
      (cuenta_id,terminos_version_id,aviso_version_id,acepta_terminos,reconoce_aviso_presentado,aceptada_en,ip)
      VALUES ($1,$2,$3,true,true,$4,$5::inet) RETURNING id`,
      [i.accountId, i.termsVersionId, i.privacyVersionId, i.acceptedAt, i.ip],
    );
    const id = rows[0].id;
    for (const code of [...i.purposeCodes].sort())
      await tx.query(
        `INSERT INTO criterika.aceptacion_finalidades
      (aceptacion_id,aviso_version_id,finalidad_codigo) VALUES ($1,$2,$3)`,
        [id, i.privacyVersionId, code],
      );
    return id;
  }
}
