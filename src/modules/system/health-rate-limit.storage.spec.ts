import { HealthRateLimitStorage } from './health-rate-limit.storage.js';
it('limita globalmente aun cuando los clientes usan claves distintas', async () => {
  const storage = new HealthRateLimitStorage();
  try {
    for (let i = 0; i < 500; i++)
      expect(
        (await storage.increment('health-global', 60000, 500, 0, 'global'))
          .isBlocked,
      ).toBe(false);
    expect(
      (await storage.increment('health-global', 60000, 500, 0, 'global'))
        .isBlocked,
    ).toBe(true);
  } finally {
    storage.onApplicationShutdown();
  }
});
it('rechaza nuevos clientes al alcanzar el máximo de claves activas', async () => {
  const storage = new HealthRateLimitStorage();
  try {
    for (let i = 0; i < 10000; i++)
      await storage.increment(String(i), 60000, 60, 0, 'default');
    expect(
      (await storage.increment('extra', 60000, 60, 0, 'default')).isBlocked,
    ).toBe(true);
    expect(storage.storage.size).toBe(10000);
    expect(
      (await storage.increment('0', 60000, 60, 0, 'default')).isBlocked,
    ).toBe(false);
  } finally {
    storage.onApplicationShutdown();
  }
});
