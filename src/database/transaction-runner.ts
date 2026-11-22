import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from './postgres.pool.js';

export type TransactionContext = {
  requestId: string;
  motivo?: string;
} & (
  | { tipo: 'JUGADOR' | 'ADMINISTRADOR'; actorId: string }
  | { tipo: 'SISTEMA' | 'MANTENIMIENTO'; actorId?: null }
);

/** A lost COMMIT acknowledgement must be recovered by idempotency, not replayed blindly. */
export class TransactionCommitUncertainError extends Error {
  constructor() {
    super('No se pudo confirmar el resultado de la transacción.');
    this.name = 'TransactionCommitUncertainError';
  }
}

function isServerRejection(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === 'string' &&
    /^[0-9A-Z]{5}$/.test(code) &&
    !code.startsWith('08') &&
    !/^57P0[123]$/.test(code)
  );
}

@Injectable()
export class TransactionRunner {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  /** Returning a typed rejection commits accepted effects; throwing rolls back. */
  run<T>(
    context: TransactionContext,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.execute(
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      async (client) => {
        await client.query(
          'SELECT criterika.establecer_contexto($1, $2::uuid, $3::uuid, $4)',
          [
            context.tipo,
            context.actorId ?? null,
            context.requestId,
            context.motivo ?? null,
          ],
        );
        return work(client);
      },
    );
  }

  /** One consistent snapshot for multi-query views; no locks or gameplay writes. */
  read<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.execute(
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      work,
    );
  }

  private async execute<T>(
    begin: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    let committing = false;
    try {
      await client.query(begin);
      const result = await work(client);
      committing = true;
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (committing && !isServerRejection(error)) {
        discard = true;
        throw new TransactionCommitUncertainError();
      }
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }
}
