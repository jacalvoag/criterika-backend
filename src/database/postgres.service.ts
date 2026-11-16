import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { APPLICATION_SETTINGS } from '../config/application-config.module.js';
import type { ApplicationSettings } from '../config/environment.js';
import {
  checkDatabaseConnection,
  type DatabaseConnectionInfo,
} from './postgres.connection.js';
import { POSTGRES_POOL } from './postgres.pool.js';

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private info?: DatabaseConnectionInfo;
  private closed = false;

  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(APPLICATION_SETTINGS)
    private readonly settings: ApplicationSettings,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.info = await checkDatabaseConnection(
        this.pool,
        this.settings.database.tlsMode === 'verify-full',
      );
    } catch (error) {
      await this.onModuleDestroy();
      throw error;
    }
  }

  connectionInfo(): DatabaseConnectionInfo {
    if (!this.info)
      throw new Error('La conexión PostgreSQL no está inicializada.');
    return { ...this.info };
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      await this.pool.end();
    }
  }
}
