import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  RegistrationPlayerSessionsService,
  type PlayerSessionRepository,
  type RegistrationAccessSigner,
} from './registration-player-sessions.service.js';

it('vincula credenciales a una sesión de 30 días y guarda solo el verificador del refresh', async () => {
  const tx = {} as PoolClient;
  const createdAt = new Date('2026-11-23T12:00:00Z');
  const accountId = 'player-id';
  const create = vi
    .fn<PlayerSessionRepository['create']>()
    .mockResolvedValue(undefined);
  const signPlayerAccess = vi
    .fn<RegistrationAccessSigner['signPlayerAccess']>()
    .mockReturnValue('signed-access-token-exclusive-to-this-test');
  const service = new RegistrationPlayerSessionsService(
    { create },
    { signPlayerAccess },
  );
  const result = await service.issueForNewPlayer(tx, accountId, createdAt);
  expect(result.sessionExpiresAt.toISOString()).toBe(
    '2026-12-23T12:00:00.000Z',
  );
  expect(signPlayerAccess).toHaveBeenCalledExactlyOnceWith({
    accountId,
    sessionId: result.sessionId,
    issuedAt: createdAt,
    expiresInSeconds: 900,
  });
  expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(create).toHaveBeenCalledExactlyOnceWith(tx, {
    accountId,
    sessionId: result.sessionId,
    createdAt,
    expiresAt: result.sessionExpiresAt,
    refreshHash: createHash('sha256')
      .update(result.refreshToken, 'ascii')
      .digest(),
  });
});
