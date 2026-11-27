import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RegistrationInfrastructureModule } from './infrastructure/registration/registration-infrastructure.module.js';
import { RegistrationEnvironmentCheck } from './infrastructure/registration/registration-environment-check.js';

async function main() {
  const app = await NestFactory.createApplicationContext(
    RegistrationInfrastructureModule,
    { logger: false, abortOnError: false },
  );
  try {
    const result = await app.get(RegistrationEnvironmentCheck).check();
    console.log(JSON.stringify(result));
    if (result.status !== 'ok') process.exitCode = 1;
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : '';
  const controlled = /^Configuración inválida: [A-Z_, ]+\.$/.test(message);
  console.error(
    controlled
      ? message
      : 'No se pudo comprobar el registro. Revisar configuración y conectividad.',
  );
  process.exitCode = 1;
});
