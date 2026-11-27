import type { PoolClient } from 'pg';
import type { TransactionRunner } from '../../database/transaction-runner.js';
import type { PublicRegistrationIdempotency } from '../../database/public-registration-idempotency.js';
import type { RegistrationMailWorker } from './registration-mail-worker.js';
import { RegistrationOperationsService } from './registration-operations.service.js';
it('confirma depuración antes del correo incluso cuando falla SMTP', async () => {
  const order: string[] = [];
  const client = {} as PoolClient;
  const run = vi.fn(async (_context, work) => {
    const result = await work(client);
    order.push('commit');
    return result;
  });
  const prune = vi.fn(async () => {
    order.push('prune');
    return 2;
  });
  const drain = vi.fn(async () => {
    order.push('mail');
    throw new Error('Fallo privado');
  });
  const service = new RegistrationOperationsService(
    { run } as unknown as TransactionRunner,
    {
      pruneExpiredResponses: prune,
    } as unknown as PublicRegistrationIdempotency,
    { drain } as unknown as RegistrationMailWorker,
  );
  await expect(service.cycle(20)).rejects.toThrow('Fallo privado');
  expect(order).toEqual(['prune', 'commit', 'mail']);
});
it('marca error si queda una entrega fallida para que el comando termine con error', async () => {
  const run = vi.fn(async () => 1),
    drain = vi.fn(async () => ({ sent: 1, failed: 1, skipped: 0 }));
  const service = new RegistrationOperationsService(
    { run } as unknown as TransactionRunner,
    {} as PublicRegistrationIdempotency,
    { drain } as unknown as RegistrationMailWorker,
  );
  expect(await service.cycle(20)).toEqual({
    status: 'error',
    sent: 1,
    failed: 1,
    skipped: 0,
    responsesPruned: 1,
  });
});
