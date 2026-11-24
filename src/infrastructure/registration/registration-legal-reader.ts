import { TransactionRunner } from '../../database/transaction-runner.js';
import { PostgresLegalRegistrationRepository } from '../../modules/legal/repositories/registration-legal.repository.js';
import { projectCurrentRegistrationDocuments } from '../../modules/legal/current-registration-documents.js';

export class RegistrationLegalReader {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repository: PostgresLegalRegistrationRepository,
  ) {}
  getCurrentDocuments() {
    return this.runner.read(async (tx) => {
      const selection = await this.repository.getCurrentSnapshot(tx);
      if (!selection)
        return { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' } as const;
      const terms = await this.repository.getPublishedDocument(
        tx,
        selection.termsVersionId,
      );
      const notice = await this.repository.getPublishedDocument(
        tx,
        selection.privacyVersionId,
      );
      return projectCurrentRegistrationDocuments(terms, notice);
    });
  }
}
