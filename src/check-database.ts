import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DatabaseConnectionError } from './database/postgres.connection.js';
import { PostgresService } from './database/postgres.service.js';

try {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    console.log(
      JSON.stringify({
        status: 'ok',
        ...app.get(PostgresService).connectionInfo(),
      }),
    );
  } finally {
    await app.close();
  }
} catch (error) {
  const code =
    error instanceof DatabaseConnectionError
      ? error.code
      : 'CONFIGURATION_OR_STARTUP_ERROR';
  console.error(
    `No se pudo comprobar PostgreSQL (${code}). Revisar configuración y conectividad.`,
  );
  process.exitCode = 1;
}
