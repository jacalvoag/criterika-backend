import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../database/transaction-runner.js';
import { PublicRegistrationIdempotency } from '../../database/public-registration-idempotency.js';
import { RegistrationMailWorker } from './registration-mail-worker.js';

/** One bounded cycle. Cleanup does not depend on a working SMTP provider. */
export class RegistrationOperationsService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly idempotency: PublicRegistrationIdempotency,
    private readonly worker: RegistrationMailWorker,
  ) {}
  async cycle(limit: number, signal?: AbortSignal) {
    const responsesPruned = await this.runner.run(
      { tipo: 'SISTEMA', requestId: randomUUID() },
      (tx) => this.idempotency.pruneExpiredResponses(tx, new Date(), limit),
    );
    const delivery = await this.worker.drain(limit, () => new Date(), signal);
    return {
      status: delivery.failed ? 'error' : 'ok',
      ...delivery,
      responsesPruned,
    };
  }
}
