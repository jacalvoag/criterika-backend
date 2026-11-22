import { Module } from '@nestjs/common';
import {
  APPLICATION_SETTINGS,
  ApplicationConfigModule,
} from '../config/application-config.module.js';
import type { ApplicationSettings } from '../config/environment.js';
import { createPostgresPool, POSTGRES_POOL } from './postgres.pool.js';
import { PostgresService } from './postgres.service.js';
import { TransactionRunner } from './transaction-runner.js';

@Module({
  imports: [ApplicationConfigModule],
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [APPLICATION_SETTINGS],
      useFactory: (settings: ApplicationSettings) =>
        createPostgresPool(settings.database),
    },
    PostgresService,
    TransactionRunner,
  ],
  exports: [POSTGRES_POOL, PostgresService, TransactionRunner],
})
export class PostgresModule {}
