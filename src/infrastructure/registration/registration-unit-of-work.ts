import { RegistrationTransactionLocks } from './registration-transaction-locks.js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { TransactionRunner } from '../../database/transaction-runner.js';
import {
  PublicRegistrationIdempotency,
  type PublicRegistrationIntention,
} from '../../database/public-registration-idempotency.js';
import type { JsonValue } from '../../database/persistence-values.js';
import { PostgresPlayerSessionRepository } from '../../modules/security/repositories/registration-session.repository.js';

export interface RegistrationHttpResult {
  status: number;
  body: JsonValue;
  /** Produced only by the trusted session service, never taken from a request body. */
  sessionBinding?: { accountId: string; sessionId: string };
}
/** Technical adapter: Uzzi supplies the functional command and contract's HTTP mapping. */
export class RegistrationUnitOfWork {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly idempotency: PublicRegistrationIdempotency,
    private readonly sessions: PostgresPlayerSessionRepository,
    private readonly locks: RegistrationTransactionLocks,
  ) {}
  async execute(
    i: PublicRegistrationIntention,
    fingerprint: Buffer,
    work: (
      tx: PoolClient,
      clock: () => Date,
    ) => Promise<RegistrationHttpResult>,
    clock: () => Date = () => new Date(),
  ) {
    return this.runner.run(
      { tipo: 'SISTEMA', requestId: randomUUID() },
      async (tx) => {
        const claim = await this.idempotency.claim(
          tx,
          i,
          fingerprint,
          clock,
          async (account, session) => {
            return this.sessions.canRecover(tx, account, session, clock);
          },
        );
        if (claim.kind !== 'NEW') return claim;
        await this.locks.prepare(tx, i.route);
        const result = await work(tx, clock);
        await this.idempotency.confirm(
          tx,
          claim.id,
          result.status,
          result.body,
          clock(),
          result.sessionBinding,
        );
        return {
          kind: 'EXECUTED',
          status: result.status,
          body: result.body,
        } as const;
      },
    );
  }
}
