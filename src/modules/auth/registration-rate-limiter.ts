import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { RegistrationRateLimiter } from './registration-http.controller.js';

type Operation = 'documents' | 'start' | 'resend' | 'verify';
const WINDOW_MS = 60_000;
const GLOBAL_LIMIT = 500;
const MAX_ACTIVE_KEYS = 10_000;
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
    const ipHash = createHmac('sha256', this.key).update(ip).digest('hex');
    const clientKey = `registration:${operation}:${ipHash}`;
    if (
      !this.storage.storage.has(clientKey) &&
      this.storage.storage.size >= MAX_ACTIVE_KEYS
    ) {
      return { allowed: false, retryAfterSeconds: 60 } as const;
    }
    const record = await this.storage.increment(
      clientKey,
      WINDOW_MS,
      LIMITS[operation],
      0,
      'registration-ip',
    );
    if (record.isBlocked) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, record.timeToBlockExpire),
      } as const;
    }

    const global = await this.storage.increment(
      'registration:global',
      WINDOW_MS,
      GLOBAL_LIMIT,
      0,
      'registration-global',
    );
    return global.isBlocked
      ? ({
          allowed: false,
          retryAfterSeconds: Math.max(1, global.timeToBlockExpire),
        } as const)
      : ({ allowed: true } as const);
  }

  onApplicationShutdown(): void {
    this.storage.onApplicationShutdown();
    this.key.fill(0);
  }
}
