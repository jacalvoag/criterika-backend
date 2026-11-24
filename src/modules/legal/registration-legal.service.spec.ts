import type { PoolClient } from 'pg';
import {
  RegistrationLegalService,
  type LegalRegistrationRepository,
} from './registration-legal.service.js';

const tx = {} as PoolClient;
const selection = {
  termsVersionId: 't1',
  privacyVersionId: 'p1',
  purposeCodes: ['cuenta'],
};

function setup() {
  const repository = {
    getCurrentForShare: vi
      .fn<LegalRegistrationRepository['getCurrentForShare']>()
      .mockResolvedValue({
        ...selection,
        requiredPurposeCodes: ['cuenta'],
      }),
    getPublishedDocument: vi
      .fn<LegalRegistrationRepository['getPublishedDocument']>()
      .mockResolvedValue(null),
    createAcceptance: vi
      .fn<LegalRegistrationRepository['createAcceptance']>()
      .mockResolvedValue('acceptance-id'),
  };
  return { repository, service: new RegistrationLegalService(repository) };
}

describe('RegistrationLegalService', () => {
  it('lee las versiones mediante el mismo cliente y rechaza un documento ausente', async () => {
    const { repository, service } = setup();
    await expect(service.getCurrentDocuments(tx)).resolves.toEqual({
      ok: false,
      reason: 'LEGAL_CONFIGURATION_MISSING',
    });
    expect(repository.getCurrentForShare).toHaveBeenCalledExactlyOnceWith(tx);
    expect(repository.getPublishedDocument.mock.calls).toEqual([
      [tx, 't1'],
      [tx, 'p1'],
    ]);
  });

  it('valida contra las versiones bloqueadas y conserva la evidencia original', async () => {
    const { repository, service } = setup();
    await expect(
      service.assertCurrentSelection(tx, {
        ...selection,
        termsVersionId: 'old',
      }),
    ).resolves.toEqual({ ok: false, reason: 'LEGAL_VERSION_OUTDATED' });
    await expect(
      service.assertCurrentSelection(tx, selection),
    ).resolves.toEqual({ ok: true });
    const acceptance = {
      ...selection,
      acceptedAt: new Date('2026-11-23T12:00:00Z'),
      ip: '192.0.2.42',
    };
    await service.recordOriginalAcceptance(tx, 'new-account', acceptance);
    expect(repository.createAcceptance).toHaveBeenCalledExactlyOnceWith(tx, {
      ...acceptance,
      accountId: 'new-account',
    });
  });

  it('rechaza una configuración con finalidades necesarias inconsistentes', async () => {
    const { repository, service } = setup();
    repository.getCurrentForShare.mockResolvedValue({
      ...selection,
      requiredPurposeCodes: ['cuenta', 'aprendizaje'],
    });
    await expect(
      service.assertCurrentSelection(tx, selection),
    ).resolves.toEqual({
      ok: false,
      reason: 'LEGAL_CONFIGURATION_MISSING',
    });
  });

  it('rechaza un documento que no corresponde a la versión vigente seleccionada', async () => {
    const { repository, service } = setup();
    repository.getPublishedDocument.mockResolvedValue({
      id: 'otra-version',
      type: 'TERMINOS',
      versionLabel: '1',
      markdown: 'contenido',
      sha256: new Uint8Array(32),
      publishedAt: new Date(),
      requiresAcceptance: true,
      purposes: [],
    });
    await expect(service.getCurrentDocuments(tx)).resolves.toEqual({
      ok: false,
      reason: 'LEGAL_CONFIGURATION_MISSING',
    });
  });
});
