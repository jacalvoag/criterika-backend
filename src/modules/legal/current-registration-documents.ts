import { createHash } from 'node:crypto';

export interface PublishedRegistrationDocument {
  id: string;
  type: 'TERMINOS' | 'AVISO_PRIVACIDAD';
  versionLabel: string;
  markdown: string;
  sha256: Uint8Array;
  publishedAt: Date;
  requiresAcceptance: boolean;
  purposes: readonly {
    code: string;
    description: string;
    necessary: boolean;
  }[];
}

function projectPublishedDocument(document: PublishedRegistrationDocument) {
  const sha256 = Buffer.from(document.sha256).toString('hex');
  if (
    createHash('sha256').update(document.markdown, 'utf8').digest('hex') !==
      sha256 ||
    !Number.isFinite(document.publishedAt.getTime()) ||
    document.purposes.some((purpose) => !purpose.necessary)
  ) {
    return null;
  }

  return {
    id: document.id,
    tipo: document.type,
    version: document.versionLabel,
    contenidoMarkdown: document.markdown,
    sha256,
    publicadoEn: document.publishedAt.toISOString(),
    requiereNuevaAceptacion: document.requiresAcceptance,
    finalidades: document.purposes.map((purpose) => ({
      id: purpose.code,
      descripcion: purpose.description,
      necesaria: true as const,
    })),
  };
}

/** The caller supplies the published versions selected from a consistent snapshot. */
export function projectCurrentRegistrationDocuments(
  terms: PublishedRegistrationDocument | null,
  privacy: PublishedRegistrationDocument | null,
) {
  if (
    terms?.type !== 'TERMINOS' ||
    privacy?.type !== 'AVISO_PRIVACIDAD' ||
    privacy.purposes.length === 0
  ) {
    return { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' } as const;
  }

  const terminos = projectPublishedDocument(terms);
  const avisoPrivacidad = projectPublishedDocument(privacy);
  if (!terminos || !avisoPrivacidad) {
    return { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' } as const;
  }

  return { ok: true, value: { terminos, avisoPrivacidad } } as const;
}
