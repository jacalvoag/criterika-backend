import { RegistrationRateLimiterService } from './registration-rate-limiter.js';

describe('RegistrationRateLimiterService', () => {
  let limiter: RegistrationRateLimiterService;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
    limiter = new RegistrationRateLimiterService();
  });
  afterEach(() => {
    limiter.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('limita registros por dirección y deja libres otras direcciones y operaciones', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(limiter.check('192.0.2.1', 'start')).resolves.toEqual({
        allowed: true,
      });
    }
    await expect(limiter.check('192.0.2.1', 'start')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    await expect(limiter.check('192.0.2.1', 'verify')).resolves.toEqual({
      allowed: true,
    });
    await expect(limiter.check('192.0.2.2', 'start')).resolves.toEqual({
      allowed: true,
    });
    vi.advanceTimersByTime(60_000);
    await expect(limiter.check('192.0.2.1', 'start')).resolves.toEqual({
      allowed: true,
    });
  });

  it('contiene el tráfico total aunque cambie la dirección de origen', async () => {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      await expect(
        limiter.check(`client-${attempt}`, 'verify'),
      ).resolves.toEqual({ allowed: true });
    }
    await expect(limiter.check('another-client', 'verify')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it('no deja que una dirección ya limitada agote el límite general', async () => {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      await limiter.check('192.0.2.1', 'start');
    }
    await expect(limiter.check('192.0.2.2', 'start')).resolves.toEqual({
      allowed: true,
    });
  });
});
