import { RegistrationOperationsService } from './registration-operations.service.js';
import { RegistrationEnvironmentCheck } from './registration-environment-check.js';
import { RegistrationTransactionLocks } from './registration-transaction-locks.js';
import { Module } from '@nestjs/common';
import { Mailer, MailModule, SmtpTransport } from '@nestjs/mail';
import type { Pool } from 'pg';
import {
  ApplicationConfigModule,
  APPLICATION_SETTINGS,
} from '../../config/application-config.module.js';
import {
  registrationSettings,
  type RegistrationSettings,
} from '../../config/registration-settings.js';
import { PostgresModule } from '../../database/postgres.module.js';
import { POSTGRES_POOL } from '../../database/postgres.pool.js';
import { TransactionRunner } from '../../database/transaction-runner.js';
import { PublicRegistrationIdempotency } from '../../database/public-registration-idempotency.js';
import { PostgresRegistrationRepository } from '../../modules/auth/repositories/registration.repository.js';
import { PostgresRegistrationMailRepository } from '../../modules/auth/repositories/registration-mail.repository.js';
import { PostgresAccountRegistrationRepository } from '../../modules/accounts/repositories/registration-account.repository.js';
import { PostgresLegalRegistrationRepository } from '../../modules/legal/repositories/registration-legal.repository.js';
import { PostgresPlayerSessionRepository } from '../../modules/security/repositories/registration-session.repository.js';
import { RegistrationAccountService } from '../../modules/accounts/registration-account.service.js';
import { RegistrationLegalService } from '../../modules/legal/registration-legal.service.js';
import { RegistrationPlayerSessionsService } from '../../modules/security/registration-player-sessions.service.js';
import { RegistrationCommands } from '../../modules/auth/registration-commands.js';
import {
  RegistrationPasswords,
  RegistrationJwtSigner,
  RegistrationMailProtection,
} from './registration-crypto.js';
import { RegistrationMailWorker } from './registration-mail-worker.js';
import { RegistrationUnitOfWork } from './registration-unit-of-work.js';
import { RegistrationLegalReader } from './registration-legal-reader.js';

export const REGISTRATION_SETTINGS = Symbol('REGISTRATION_SETTINGS');
@Module({
  imports: [ApplicationConfigModule],
  providers: [
    {
      provide: REGISTRATION_SETTINGS,
      inject: [APPLICATION_SETTINGS],
      useFactory: () => registrationSettings(process.env),
    },
  ],
  exports: [REGISTRATION_SETTINGS],
})
class RegistrationConfigurationModule {}

/** Explicit opt-in: import from Uzzi's HTTP module once its adapters are ready. */
@Module({
  imports: [
    PostgresModule,
    RegistrationConfigurationModule,
    MailModule.forRootAsync({
      isGlobal: false,
      imports: [RegistrationConfigurationModule],
      inject: [REGISTRATION_SETTINGS],
      useFactory: (s: RegistrationSettings) => ({
        from: s.mailFrom,
        retry: false,
        transport: new SmtpTransport({
          url: s.smtpUrl,
          startTls: 'required',
          timeouts: {
            connect: '5s',
            greeting: '5s',
            command: '5s',
            data: '10s',
          },
        }),
      }),
    }),
  ],
  providers: [
    RegistrationPasswords,
    PostgresRegistrationRepository,
    PostgresAccountRegistrationRepository,
    PostgresPlayerSessionRepository,
    PostgresRegistrationMailRepository,
    {
      provide: RegistrationMailProtection,
      inject: [REGISTRATION_SETTINGS],
      useFactory: (s: RegistrationSettings) =>
        new RegistrationMailProtection(s.codeVerifier, s.mailEncryption),
    },
    {
      provide: RegistrationJwtSigner,
      inject: [REGISTRATION_SETTINGS],
      useFactory: (s: RegistrationSettings) =>
        new RegistrationJwtSigner(
          s.jwtPrivateKey,
          s.jwtIssuer,
          s.jwtAudience,
          s.jwtKeyId,
        ),
    },
    {
      provide: PublicRegistrationIdempotency,
      inject: [REGISTRATION_SETTINGS],
      useFactory: (s: RegistrationSettings) =>
        new PublicRegistrationIdempotency(
          s.idempotencyHmac,
          s.idempotencyEncryption,
        ),
    },
    {
      provide: PostgresLegalRegistrationRepository,
      inject: [REGISTRATION_SETTINGS],
      useFactory: (s: RegistrationSettings) =>
        new PostgresLegalRegistrationRepository(s.privacy),
    },
    {
      provide: RegistrationAccountService,
      inject: [PostgresAccountRegistrationRepository],
      useFactory: (r: PostgresAccountRegistrationRepository) =>
        new RegistrationAccountService(r),
    },
    {
      provide: RegistrationLegalService,
      inject: [PostgresLegalRegistrationRepository],
      useFactory: (r: PostgresLegalRegistrationRepository) =>
        new RegistrationLegalService(r),
    },
    {
      provide: RegistrationPlayerSessionsService,
      inject: [PostgresPlayerSessionRepository, RegistrationJwtSigner],
      useFactory: (
        r: PostgresPlayerSessionRepository,
        s: RegistrationJwtSigner,
      ) => new RegistrationPlayerSessionsService(r, s),
    },
    {
      provide: RegistrationCommands,
      inject: [
        PostgresRegistrationRepository,
        RegistrationLegalService,
        RegistrationMailProtection,
        RegistrationAccountService,
        RegistrationPlayerSessionsService,
      ],
      useFactory: (
        r: PostgresRegistrationRepository,
        l: RegistrationLegalService,
        p: RegistrationMailProtection,
        a: RegistrationAccountService,
        s: RegistrationPlayerSessionsService,
      ) => new RegistrationCommands(r, l, p, a, s),
    },
    {
      provide: RegistrationTransactionLocks,
      inject: [
        PostgresRegistrationRepository,
        PostgresLegalRegistrationRepository,
      ],
      useFactory: (
        r: PostgresRegistrationRepository,
        l: PostgresLegalRegistrationRepository,
      ) => new RegistrationTransactionLocks(r, l),
    },
    {
      provide: RegistrationUnitOfWork,
      inject: [
        TransactionRunner,
        PublicRegistrationIdempotency,
        PostgresPlayerSessionRepository,
        RegistrationTransactionLocks,
      ],
      useFactory: (
        r: TransactionRunner,
        i: PublicRegistrationIdempotency,
        s: PostgresPlayerSessionRepository,
        locks: RegistrationTransactionLocks,
      ) => new RegistrationUnitOfWork(r, i, s, locks),
    },
    {
      provide: RegistrationLegalReader,
      inject: [TransactionRunner, PostgresLegalRegistrationRepository],
      useFactory: (
        r: TransactionRunner,
        l: PostgresLegalRegistrationRepository,
      ) => new RegistrationLegalReader(r, l),
    },
    {
      provide: RegistrationEnvironmentCheck,
      inject: [RegistrationLegalReader, REGISTRATION_SETTINGS],
      useFactory: (l: RegistrationLegalReader, s: RegistrationSettings) =>
        new RegistrationEnvironmentCheck(l, s),
    },
    {
      provide: RegistrationOperationsService,
      inject: [
        TransactionRunner,
        PublicRegistrationIdempotency,
        RegistrationMailWorker,
      ],
      useFactory: (
        r: TransactionRunner,
        i: PublicRegistrationIdempotency,
        w: RegistrationMailWorker,
      ) => new RegistrationOperationsService(r, i, w),
    },
    {
      provide: RegistrationMailWorker,
      inject: [
        POSTGRES_POOL,
        PostgresRegistrationMailRepository,
        RegistrationMailProtection,
        Mailer,
      ],
      useFactory: (
        p: Pool,
        r: PostgresRegistrationMailRepository,
        c: RegistrationMailProtection,
        m: Mailer,
      ) => new RegistrationMailWorker(p, r, c, m),
    },
  ],
  exports: [
    RegistrationCommands,
    RegistrationPasswords,
    PublicRegistrationIdempotency,
    RegistrationUnitOfWork,
    RegistrationLegalReader,
    RegistrationMailWorker,
    RegistrationConfigurationModule,
    RegistrationEnvironmentCheck,
    RegistrationOperationsService,
  ],
})
export class RegistrationInfrastructureModule {}
