import type { PoolClient } from 'pg';
import {
  projectCurrentRegistrationDocuments,
  type PublishedRegistrationDocument,
} from './current-registration-documents.js';
import {
  validateRegistrationLegalSelection,
  type RegistrationLegalSelection,
} from './registration-selection.js';

export interface OriginalRegistrationAcceptance extends RegistrationLegalSelection {
  readonly acceptedAt: Date;
  readonly ip: string;
}

interface CurrentLegalSelection extends RegistrationLegalSelection {
  readonly requiredPurposeCodes: readonly string[];
}

/** The implementation locks the selection and verifies the privacy configuration. */
export interface LegalRegistrationRepository {
  getCurrentForShare(tx: PoolClient): Promise<CurrentLegalSelection | null>;
  getPublishedDocument(
    tx: PoolClient,
    versionId: string,
  ): Promise<PublishedRegistrationDocument | null>;
  createAcceptance(
    tx: PoolClient,
    input: OriginalRegistrationAcceptance & { readonly accountId: string },
  ): Promise<string>;
}

export class RegistrationLegalService {
  constructor(private readonly repository: LegalRegistrationRepository) {}

  async getCurrentDocuments(tx: PoolClient) {
    const current = await this.repository.getCurrentForShare(tx);
    if (!current)
      return { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' } as const;

    const terms = await this.repository.getPublishedDocument(
      tx,
      current.termsVersionId,
    );
    const privacy = await this.repository.getPublishedDocument(
      tx,
      current.privacyVersionId,
    );
    if (
      terms?.id.toLowerCase() !== current.termsVersionId.toLowerCase() ||
      privacy?.id.toLowerCase() !== current.privacyVersionId.toLowerCase()
    ) {
      return { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' } as const;
    }
    return projectCurrentRegistrationDocuments(terms, privacy);
  }

  async assertCurrentSelection(
    tx: PoolClient,
    selection: RegistrationLegalSelection,
  ) {
    const current = await this.repository.getCurrentForShare(tx);
    if (!current)
      return { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' } as const;

    const required = new Set(current.requiredPurposeCodes);
    const available = new Set(current.purposeCodes);
    if (
      required.size === 0 ||
      required.size !== current.requiredPurposeCodes.length ||
      available.size !== current.purposeCodes.length ||
      [...required].some((code) => !available.has(code))
    ) {
      return { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' } as const;
    }
    return validateRegistrationLegalSelection(selection, {
      termsVersionId: current.termsVersionId,
      privacyVersionId: current.privacyVersionId,
      purposes: current.purposeCodes.map((code) => ({
        code,
        necessary: required.has(code),
      })),
    });
  }

  recordOriginalAcceptance(
    tx: PoolClient,
    accountId: string,
    acceptance: OriginalRegistrationAcceptance,
  ) {
    return this.repository.createAcceptance(tx, { ...acceptance, accountId });
  }
}
