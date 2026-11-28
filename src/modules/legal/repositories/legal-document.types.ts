export interface LegalDraftInput {
  tipo: 'TERMINOS' | 'AVISO_PRIVACIDAD';
  version: string;
  contenidoMarkdown: string;
  tipoCambio: 'EDITORIAL' | 'CONTRACTUAL' | 'NUEVA_FINALIDAD';
  finalidades: { id: string; descripcion: string; necesaria: true }[];
}
/** Internal projection: requiresAcceptance/current flags are not extra fields for the HTTP DTO. */
export interface AdminLegalDocumentSnapshot extends LegalDraftInput {
  id: string;
  publicadoEn: Date | null;
  sha256: string | null;
  versionRecurso: bigint;
  requiereAceptacion: boolean;
  vigente: boolean;
}
export type LegalWriteResult =
  | { kind: 'saved'; document: AdminLegalDocumentSnapshot }
  | {
      kind:
        | 'not_found'
        | 'version_conflict'
        | 'already_published'
        | 'version_label_conflict'
        | 'legal_configuration_missing'
        | 'invalid_purposes'
        | 'invalid_acceptance_policy';
    };
