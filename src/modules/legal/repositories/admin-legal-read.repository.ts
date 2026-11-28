import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { requireAdministrativeRead } from '../../../database/administrative-read.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import type { AdminLegalDocumentSnapshot } from './legal-document.types.js';

type Row = Omit<AdminLegalDocumentSnapshot, 'versionRecurso'> & {
  versionRecurso: string;
};
const FIELDS = `d.id,d.tipo,d.etiqueta_version AS version,d.contenido_markdown AS "contenidoMarkdown",
  d.tipo_cambio AS "tipoCambio",d.publicada_en AS "publicadoEn",encode(d.sha256,'hex') AS sha256,
  d.version_recurso::text AS "versionRecurso",d.requiere_aceptacion AS "requiereAceptacion",d.es_vigente AS vigente,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.finalidad_codigo,'descripcion',f.descripcion_presentada,
    'necesaria',p.necesaria) ORDER BY f.finalidad_codigo COLLATE "C") FROM criterika.documento_finalidades f
    JOIN criterika.finalidades p ON p.codigo=f.finalidad_codigo WHERE f.documento_version_id=d.id),'[]'::jsonb) AS finalidades`;
const project = (row: Row): AdminLegalDocumentSnapshot => ({
  ...row,
  versionRecurso: BigInt(row.versionRecurso),
});

/** Internal loader for writers after their context check; one statement gives one coherent projection. */
export async function loadAdminLegalDocument(
  tx: PoolClient,
  id: string,
): Promise<AdminLegalDocumentSnapshot | null> {
  const { rows } = await tx.query<Row>(
    `SELECT ${FIELDS} FROM criterika.versiones_documentos_legales d WHERE d.id=$1`,
    [id],
  );
  return rows[0] ? project(rows[0]) : null;
}
export class AdminLegalPositionError extends Error {
  constructor() {
    super('Posición de documentos legales inválida.');
    this.name = 'AdminLegalPositionError';
  }
}
@Injectable()
export class PostgresAdminLegalReadRepository {
  async get(tx: PoolClient, id: string) {
    await requireAdministrativeRead(tx);
    return loadAdminLegalDocument(tx, id);
  }
  /** Use an ADMINISTRADOR transaction; security still verifies ADMIN_MANAGE. */
  async list(tx: PoolClient, limit = 20, after?: { documentId: string }) {
    await requireAdministrativeRead(tx);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new PersistenceInvariantError(
        'Límite de documentos legales inválido.',
      );
    if (after) {
      const anchor = await tx.query(
        'SELECT id FROM criterika.versiones_documentos_legales WHERE id=$1',
        [after.documentId],
      );
      if (!anchor.rowCount) throw new AdminLegalPositionError();
    }
    const { rows } = await tx.query<Row>(
      `SELECT ${FIELDS} FROM criterika.versiones_documentos_legales d
      WHERE ($1::uuid IS NULL OR d.id>$1::uuid) ORDER BY d.id LIMIT $2`,
      [after?.documentId ?? null, limit + 1],
    );
    const items = rows.slice(0, limit).map(project);
    return {
      items,
      nextPosition:
        rows.length > limit && items.length
          ? { documentId: items[items.length - 1].id }
          : null,
    };
  }
}
