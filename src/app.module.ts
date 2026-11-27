import { HealthModule } from './modules/system/health.module.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PostgresModule } from './database/postgres.module.js';
import { RegistrationHttpModule } from './modules/auth/registration-http.module.js';
import { REGISTRATION_RATE_LIMITER } from './modules/auth/registration-http.controller.js';
import { RegistrationRateLimiterService } from './modules/auth/registration-rate-limiter.js';

@Module({
  imports: [
    PostgresModule,
    HealthModule,
    RegistrationHttpModule.register({
      provide: REGISTRATION_RATE_LIMITER,
      useClass: RegistrationRateLimiterService,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
