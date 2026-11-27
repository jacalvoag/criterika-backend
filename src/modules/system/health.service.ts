import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import { APPLICATION_SETTINGS } from '../../config/application-config.module.js';
import type { ApplicationSettings } from '../../config/environment.js';
import { checkDatabaseConnection } from '../../database/postgres.connection.js';
import { POSTGRES_POOL } from '../../database/postgres.pool.js';

/** Probe the current connection; startup metadata alone cannot prove readiness. */
@Injectable()
export class HealthService implements OnModuleDestroy {
  private pending?: Promise<boolean>;
  private stopping = false;
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(APPLICATION_SETTINGS)
    private readonly settings: ApplicationSettings,
  ) {}
  ready(): Promise<boolean> {
    if (this.stopping) return Promise.resolve(false);
    // Concurrent HTTP checks share a probe, without caching a successful past result.
    this.pending ??= this.probe().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async probe() {
    try {
      await checkDatabaseConnection(
        this.pool,
        this.settings.database.tlsMode === 'verify-full',
      );
      return !this.stopping;
    } catch {
      return false;
    }
  }
  onModuleDestroy() {
    this.stopping = true;
  }
}
