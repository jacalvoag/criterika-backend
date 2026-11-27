import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RegistrationInfrastructureModule } from './infrastructure/registration/registration-infrastructure.module.js';
import { RegistrationOperationsService } from './infrastructure/registration/registration-operations.service.js';
import {
  registrationWorkerOptions,
  runRegistrationLoop,
} from './operations/registration-loop.js';

async function main() {
  const stop = new AbortController();
  const onSignal = () => stop.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const app = await NestFactory.createApplicationContext(
    RegistrationInfrastructureModule,
    { abortOnError: false, logger: false },
  );
  try {
    const { limit, intervalMs } = registrationWorkerOptions(process.env);
    await runRegistrationLoop(
      () => app.get(RegistrationOperationsService).cycle(limit, stop.signal),
      intervalMs,
      stop.signal,
      (result) => console.log(JSON.stringify(result)),
    );
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await app.close();
  }
}
main().catch(() => {
  console.error(
    'No se pudo iniciar el trabajador de registro. Ejecutar registration:check.',
  );
  process.exitCode = 1;
});
