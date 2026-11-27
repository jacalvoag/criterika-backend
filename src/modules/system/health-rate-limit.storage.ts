import { ThrottlerStorageService } from '@nestjs/throttler';

/** Same single HTTP process topology as registration; bound the active client map. */
export class HealthRateLimitStorage extends ThrottlerStorageService {
  override async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ) {
    if (!this.storage.has(key) && this.storage.size >= 10000) {
      return {
        totalHits: limit + 1,
        timeToExpire: 60,
        isBlocked: true,
        timeToBlockExpire: 60,
      };
    }
    return super.increment(key, ttl, limit, blockDuration, name);
  }
}
