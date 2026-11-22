import type { Pool, PoolClient } from 'pg';
import {
  TransactionCommitUncertainError,
  TransactionRunner,
} from './transaction-runner.js';

function setup() {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn().mockResolvedValue(client);
  return {
    query,
    release,
    client,
    connect,
    runner: new TransactionRunner({ connect } as unknown as Pool),
  };
}
const context = {
  tipo: 'SISTEMA' as const,
  requestId: '00000000-0000-4000-8000-000000000999',
};

describe('TransactionRunner', () => {
  it('entrega un solo cliente y confirma también un rechazo tipado con efectos aceptados', async () => {
    const s = setup();
    const result = await s.runner.run(context, async (client) => {
      expect(client).toBe(s.client);
      await client.query('SELECT 1');
      return { ok: false, code: 'ATTEMPT_FINISHED' };
    });
    expect(result.ok).toBe(false);
    expect(s.query.mock.calls.map((c) => c[0])).toEqual([
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      'SELECT criterika.establecer_contexto($1, $2::uuid, $3::uuid, $4)',
      'SELECT 1',
      'COMMIT',
    ]);
    expect(s.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('revierte una excepción conservando el error y libera la conexión', async () => {
    const s = setup();
    const error = new Error('falla funcional');
    await expect(
      s.runner.run(context, () => Promise.reject(error)),
    ).rejects.toBe(error);
    expect(s.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(s.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('descarta el cliente si falla ROLLBACK y conserva el error inicial', async () => {
    const s = setup();
    s.query.mockImplementation((sql: string) =>
      sql === 'ROLLBACK'
        ? Promise.reject(new Error('conexión perdida'))
        : Promise.resolve({ rows: [] }),
    );
    const original = new Error('error de operación');
    await expect(
      s.runner.run(context, () => Promise.reject(original)),
    ).rejects.toBe(original);
    expect(s.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('no reintenta un COMMIT incierto ni presenta su contenido privado', async () => {
    const s = setup();
    s.query.mockImplementation((sql: string) =>
      sql === 'COMMIT'
        ? Promise.reject(
            Object.assign(new Error('secreto privado'), { code: 'ECONNRESET' }),
          )
        : Promise.resolve({ rows: [] }),
    );
    const work = vi.fn().mockResolvedValue(1);
    await expect(s.runner.run(context, work)).rejects.toThrow(
      TransactionCommitUncertainError,
    );
    expect(work).toHaveBeenCalledOnce();
    expect(s.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(s.query.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(false);
  });

  it('distingue un rechazo diferido de PostgreSQL de una confirmación incierta', async () => {
    const s = setup();
    const rejected = Object.assign(new Error('integridad diferida'), {
      code: '23514',
    });
    s.query.mockImplementation((sql: string) =>
      sql === 'COMMIT'
        ? Promise.reject(rejected)
        : Promise.resolve({ rows: [] }),
    );
    await expect(s.runner.run(context, () => Promise.resolve(1))).rejects.toBe(
      rejected,
    );
    expect(s.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(s.release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('no ejecuta el callback si falla la instalación del contexto', async () => {
    const s = setup();
    s.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('actor inválido'));
    const work = vi.fn();
    await expect(s.runner.run(context, work)).rejects.toThrow('actor inválido');
    expect(work).not.toHaveBeenCalled();
    expect(s.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('usa una instantánea de solo lectura para las consultas compuestas', async () => {
    const s = setup();
    await s.runner.read(async (client) => {
      await client.query('SELECT 1');
    });
    expect(s.query.mock.calls.map((c) => c[0])).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'SELECT 1',
      'COMMIT',
    ]);
    expect(s.release).toHaveBeenCalledOnce();
  });

  it('propaga un fallo al adquirir conexión sin ejecutar el callback', async () => {
    const s = setup();
    s.connect.mockRejectedValueOnce(new Error('pool no disponible'));
    const work = vi.fn();
    await expect(s.runner.run(context, work)).rejects.toThrow(
      'pool no disponible',
    );
    expect(s.release).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });
});
