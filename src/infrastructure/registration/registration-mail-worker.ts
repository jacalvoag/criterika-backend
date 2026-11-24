import type { Pool } from 'pg';
import type { Mailer } from '@nestjs/mail';
import { PostgresRegistrationMailRepository } from '../../modules/auth/repositories/registration-mail.repository.js';
import { RegistrationMailProtection } from './registration-crypto.js';

export class RegistrationMailWorker {
  constructor(
    private readonly pool: Pool,
    private readonly repository: PostgresRegistrationMailRepository,
    private readonly protection: RegistrationMailProtection,
    private readonly mailer: Pick<Mailer, 'send'>,
  ) {}
  /** Called after commit or by an internal bounded scheduler, never by a public route directly. */
  async drain(limit = 20, clock: () => Date = () => new Date()) {
    const client = await this.pool.connect();
    let discard = false;
    const counts = { sent: 0, failed: 0, skipped: 0 };
    try {
      const candidates = await this.repository.candidates(client, limit);
      for (const c of candidates) {
        if (discard) break;
        const lockName = 'criterika:registration-mail:' + c.registrationId;
        const { rows } = await client.query<{ locked: boolean }>(
          'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
          [lockName],
        );
        if (!rows[0].locked) {
          counts.skipped++;
          continue;
        }
        try {
          const row = await this.repository.load(client, c.id, clock());
          if (!row) {
            counts.skipped++;
            continue;
          }
          const payload = this.protection.recoverMail(
            c.id,
            row.mensaje_envio_cifrado,
          );
          if (
            payload.destinationEmail !== row.correo_destino ||
            payload.expiresAt.getTime() !== row.expira_en.getTime()
          )
            throw new Error('Mensaje no válido.');
          try {
            await this.mailer.send({
              to: payload.destinationEmail,
              subject: 'Código de verificación de Criterika',
              text: `Tu código de verificación es ${payload.code}. Vence en ${payload.expiresAt.toISOString()}.`,
              idempotencyKey: c.id,
              retry: false,
              signal: AbortSignal.timeout(15000),
            });
          } catch {
            await this.repository.failed(client, c.id);
            counts.failed++;
            continue;
          }
          await this.repository.sent(client, c.id);
          counts.sent++;
        } finally {
          try {
            await client.query(
              'SELECT pg_advisory_unlock(hashtextextended($1,0))',
              [lockName],
            );
          } catch {
            discard = true;
          }
        }
      }
      if (discard) throw new Error('No se pudo liberar el envío.');
      return counts;
    } finally {
      client.release(discard);
    }
  }
}
