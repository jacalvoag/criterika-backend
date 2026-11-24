import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { PublicRegistrationIdempotency } from '../../database/public-registration-idempotency.js';
import { RegistrationPasswords } from '../../infrastructure/registration/registration-crypto.js';
import { RegistrationInfrastructureModule } from '../../infrastructure/registration/registration-infrastructure.module.js';
import { RegistrationLegalReader } from '../../infrastructure/registration/registration-legal-reader.js';
import { RegistrationUnitOfWork } from '../../infrastructure/registration/registration-unit-of-work.js';
import { RegistrationApplication } from './registration-application.js';
import { RegistrationCommands } from './registration-commands.js';
import { RegistrationHttpController } from './registration-http.controller.js';

@Module({})
export class RegistrationHttpModule {
  /**
   * The provided provider must expose REGISTRATION_RATE_LIMITER. This explicit
   * dependency prevents enabling public routes without a shared limiter.
   */
  static register(limiter: Provider): DynamicModule {
    return {
      module: RegistrationHttpModule,
      imports: [RegistrationInfrastructureModule],
      controllers: [RegistrationHttpController],
      providers: [
        limiter,
        {
          provide: RegistrationApplication,
          inject: [
            RegistrationCommands,
            RegistrationPasswords,
            PublicRegistrationIdempotency,
            RegistrationUnitOfWork,
            RegistrationLegalReader,
          ],
          useFactory: (
            commands: RegistrationCommands,
            passwords: RegistrationPasswords,
            idempotency: PublicRegistrationIdempotency,
            unitOfWork: RegistrationUnitOfWork,
            legalReader: RegistrationLegalReader,
          ) =>
            new RegistrationApplication({
              commands,
              passwords,
              idempotency,
              unitOfWork,
              legalReader,
            }),
        },
      ],
    };
  }
}
