import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RegistrationInfrastructureModule } from './infrastructure/registration/registration-infrastructure.module.js';
import { RegistrationOperationsService } from './infrastructure/registration/registration-operations.service.js';

async function main() {
  const limit = Number(process.argv[2] ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Límite inválido.');
  const app = await NestFactory.createApplicationContext(
    RegistrationInfrastructureModule,
    { logger: false, abortOnError: false },
  );
  try {
    const result = await app.get(RegistrationOperationsService).cycle(limit);
    console.log(JSON.stringify(result));
    if (result.status !== 'ok') process.exitCode = 1;
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error('No se pudo procesar el correo de registro.');
  process.exitCode = 1;
});
