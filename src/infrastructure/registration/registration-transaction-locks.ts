import type { PoolClient } from 'pg';
import { PostgresRegistrationRepository } from '../../modules/auth/repositories/registration.repository.js';
import { PostgresLegalRegistrationRepository } from '../../modules/legal/repositories/registration-legal.repository.js';

/** Acquire dependencies before functional services capture their operation clock. No business decision here. */
export class RegistrationTransactionLocks {
  constructor(
    private readonly registrations: PostgresRegistrationRepository,
    private readonly legal: PostgresLegalRegistrationRepository,
  ) {}
  async prepare(tx: PoolClient, route: string): Promise<void> {
    const match =
      /^\/api\/v1\/auth\/registrations\/([0-9a-f-]{36})\/(resend|verify)$/.exec(
        route,
      );
    if (match) {
      const pending = await this.registrations.findPendingForUpdate(
        tx,
        match[1],
      );
      if (pending)
        await this.registrations.findLatestChallengeForUpdate(tx, match[1]);
      if (match[2] === 'resend') return;
    }
    await this.legal.getCurrentForShare(tx);
  }
}
