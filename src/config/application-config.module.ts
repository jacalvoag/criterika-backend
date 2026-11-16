import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  validateEnvironment,
  type ApplicationSettings,
} from './environment.js';

export const APPLICATION_SETTINGS = Symbol('APPLICATION_SETTINGS');

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      load: [() => ({ settings: validateEnvironment(process.env) })],
    }),
  ],
  providers: [
    {
      provide: APPLICATION_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ApplicationSettings =>
        config.getOrThrow<ApplicationSettings>('settings'),
    },
  ],
  exports: [APPLICATION_SETTINGS],
})
export class ApplicationConfigModule {}
