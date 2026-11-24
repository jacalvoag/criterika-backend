import { createHash } from 'node:crypto';
import { projectCurrentRegistrationDocuments } from './current-registration-documents.js';

const markdown =
  '# Documento de prueba\nTexto publicado con caracteres en español.';
const sha256 = createHash('sha256').update(markdown, 'utf8').digest();
const terms = {
  id: '834323eb-51a3-40df-98c4-8e2c59f3cfd0',
  type: 'TERMINOS',
  versionLabel: '2026.1',
  markdown,
  sha256,
  publishedAt: new Date('2026-11-23T09:00:00-06:00'),
  requiresAcceptance: true,
  purposes: [],
} as const;
const privacy = {
  ...terms,
  id: 'a08d75c5-6c5a-4439-9044-a94da68a8d24',
  type: 'AVISO_PRIVACIDAD',
  purposes: [
    { code: 'cuenta', description: 'Operar la cuenta', necessary: true },
  ],
} as const;

describe('projectCurrentRegistrationDocuments', () => {
  it('proyecta el Markdown exacto, la huella y la fecha UTC en el contrato público', () => {
    const result = projectCurrentRegistrationDocuments(terms, privacy);
    expect(result).toMatchObject({
      ok: true,
      value: {
        terminos: {
          id: terms.id,
          tipo: 'TERMINOS',
          contenidoMarkdown: markdown,
          sha256: sha256.toString('hex'),
          publicadoEn: '2026-11-23T15:00:00.000Z',
        },
        avisoPrivacidad: {
          id: privacy.id,
          tipo: 'AVISO_PRIVACIDAD',
          finalidades: [
            { id: 'cuenta', descripcion: 'Operar la cuenta', necesaria: true },
          ],
        },
      },
    });
  });

  it('rechaza un par incompleto, intercambiado o incompatible con el contrato', () => {
    const missing = { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' };
    expect(projectCurrentRegistrationDocuments(terms, null)).toEqual(missing);
    expect(projectCurrentRegistrationDocuments(privacy, terms)).toEqual(
      missing,
    );
    expect(
      projectCurrentRegistrationDocuments(terms, { ...privacy, purposes: [] }),
    ).toEqual(missing);
    expect(
      projectCurrentRegistrationDocuments(terms, {
        ...privacy,
        markdown: markdown + '\n',
      }),
    ).toEqual(missing);
    expect(
      projectCurrentRegistrationDocuments(terms, {
        ...privacy,
        purposes: [{ ...privacy.purposes[0], necessary: false }],
      }),
    ).toEqual(missing);
  });
});
