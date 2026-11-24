import { TransactionRunner } from './database/transaction-runner.js';
import { PublicRegistrationIdempotency } from './database/public-registration-idempotency.js';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RegistrationInfrastructureModule } from './infrastructure/registration/registration-infrastructure.module.js';
import { RegistrationMailWorker } from './infrastructure/registration/registration-mail-worker.js';

async function main() {
  const limit = Number(process.argv[2] ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Límite inválido.');
  const app = await NestFactory.createApplicationContext(
    RegistrationInfrastructureModule,
    { logger: false, abortOnError: false },
  );
  try {
    const delivery = await app.get(RegistrationMailWorker).drain(limit);
    const responsesPruned = await app
      .get(TransactionRunner)
      .run({ tipo: 'SISTEMA', requestId: randomUUID() }, (tx) =>
        app
          .get(PublicRegistrationIdempotency)
          .pruneExpiredResponses(tx, new Date(), limit),
      );
    console.log(JSON.stringify({ ...delivery, responsesPruned }));
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error('No se pudo procesar el correo de registro.');
  process.exitCode = 1;
});
