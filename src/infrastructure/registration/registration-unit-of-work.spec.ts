import type { PoolClient } from 'pg';
import type { TransactionRunner } from '../../database/transaction-runner.js';
import type { PublicRegistrationIdempotency } from '../../database/public-registration-idempotency.js';
import type { PostgresPlayerSessionRepository } from '../../modules/security/repositories/registration-session.repository.js';
import type { RegistrationTransactionLocks } from './registration-transaction-locks.js';
import { RegistrationUnitOfWork } from './registration-unit-of-work.js';

it('vincula la transacción al identificador de la solicitud HTTP', async () => {
  const tx = {} as PoolClient;
  const run = vi.fn(async (_context, callback) => callback(tx));
  const claim = vi.fn().mockResolvedValue({ kind: 'IN_PROGRESS' });
  const work = vi.fn();
  const uow = new RegistrationUnitOfWork(
    { run } as unknown as TransactionRunner,
    { claim } as unknown as PublicRegistrationIdempotency,
    {} as PostgresPlayerSessionRepository,
    {} as RegistrationTransactionLocks,
  );
  const requestId = 'abcdef12-3456-4000-8000-123456789abc';
  await expect(
    uow.execute(
      { key: requestId, route: '/api/v1/auth/registrations' },
      Buffer.alloc(32),
      work,
      undefined,
      requestId,
    ),
  ).resolves.toEqual({ kind: 'IN_PROGRESS' });
  expect(run).toHaveBeenCalledWith(
    { tipo: 'SISTEMA', requestId },
    expect.any(Function),
  );
  expect(work).not.toHaveBeenCalled();
});
