import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { RegistrationRateLimiter } from './registration-http.controller.js';

type Operation = 'documents' | 'start' | 'resend' | 'verify';
const WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 500;
const LIMITS: Record<Operation, number> = {
  documents: 60,
  start: 5,
  resend: 10,
  verify: 30,
};

/**
 * The default storage is process-local and requires exactly one backend
 * instance. Supply a shared implementation before scaling horizontally.
 */
@Injectable()
export class RegistrationRateLimiterService
  implements RegistrationRateLimiter, OnApplicationShutdown
{
  private readonly storage = new ThrottlerStorageService();
  private readonly key = randomBytes(32);

  async check(ip: string, operation: Operation) {
    // Bound overall traffic and the number of IP records before hashing an IP.
    const global = await this.storage.increment(
      'registration:global',
      WINDOW_MS,
      GLOBAL_LIMIT,
      0,
      'registration-global',
    );
    if (global.isBlocked) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, global.timeToBlockExpire),
      } as const;
    }

    const ipHash = createHmac('sha256', this.key).update(ip).digest('hex');
    const record = await this.storage.increment(
      `registration:${operation}:${ipHash}`,
      WINDOW_MS,
      LIMITS[operation],
      0,
      'registration-ip',
    );
    return record.isBlocked
      ? ({
          allowed: false,
          retryAfterSeconds: Math.max(1, record.timeToBlockExpire),
        } as const)
      : ({ allowed: true } as const);
  }

  onApplicationShutdown(): void {
    this.storage.onApplicationShutdown();
    this.key.fill(0);
  }
}
