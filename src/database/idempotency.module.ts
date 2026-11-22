import { Module } from '@nestjs/common';
import {
  APPLICATION_SETTINGS,
  ApplicationConfigModule,
} from '../config/application-config.module.js';
import {
  IdempotencyStore,
  idempotencyFromEnvironment,
} from './idempotency-store.js';

/** Import when activating idempotent services; database-only startup needs no cache keys. */
@Module({
  imports: [ApplicationConfigModule],
  providers: [
    {
      provide: IdempotencyStore,
      // Wait until ApplicationConfigModule has loaded the environment.
      inject: [APPLICATION_SETTINGS],
      useFactory: () => idempotencyFromEnvironment(process.env),
    },
  ],
  exports: [IdempotencyStore],
})
export class IdempotencyModule {}
