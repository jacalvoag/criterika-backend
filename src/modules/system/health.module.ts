import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApplicationConfigModule } from '../../config/application-config.module.js';
import { PostgresModule } from '../../database/postgres.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { HealthRateLimitStorage } from './health-rate-limit.storage.js';

@Module({
  imports: [
    ApplicationConfigModule,
    PostgresModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        storage: new HealthRateLimitStorage(),
        throttlers: [
          {
            name: 'default',
            ttl: 60000,
            limit: 60,
            blockDuration: 0,
            setHeaders: false,
          },
          {
            name: 'global',
            ttl: 60000,
            limit: 500,
            blockDuration: 0,
            setHeaders: false,
            getTracker: () => 'all',
            generateKey: () => 'health-global',
          },
        ],
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService, ThrottlerGuard],
})
export class HealthModule {}
