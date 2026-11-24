import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

const ACCESS_TTL_SECONDS = 900;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface NewPlayerSession {
  readonly sessionId: string;
  readonly accountId: string;
  readonly refreshHash: Uint8Array;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface PlayerSessionRepository {
  create(tx: PoolClient, input: NewPlayerSession): Promise<void>;
}

export interface RegistrationAccessSigner {
  /** The configured JWT provider signs locally for this player and session. */
  signPlayerAccess(input: {
    accountId: string;
    sessionId: string;
    issuedAt: Date;
    expiresInSeconds: number;
  }): string;
}

export class RegistrationPlayerSessionsService {
  constructor(
    private readonly repository: PlayerSessionRepository,
    private readonly signer: RegistrationAccessSigner,
  ) {}

  async issueForNewPlayer(tx: PoolClient, accountId: string, at: Date) {
    const expiresAt = new Date(at.getTime() + SESSION_TTL_MS);
    if (!Number.isFinite(expiresAt.getTime()))
      throw new RangeError('Fecha de sesión inválida.');

    const sessionId = randomUUID();
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshHash = createHash('sha256')
      .update(refreshToken, 'ascii')
      .digest();
    const accessToken = this.signer.signPlayerAccess({
      accountId,
      sessionId,
      issuedAt: at,
      expiresInSeconds: ACCESS_TTL_SECONDS,
    });
    if (accessToken.length < 32 || accessToken.length > 4096) {
      throw new RangeError('Credencial de acceso inválida.');
    }

    await this.repository.create(tx, {
      sessionId,
      accountId,
      refreshHash,
      createdAt: at,
      expiresAt,
    });
    return {
      sessionId,
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      accessExpiresIn: ACCESS_TTL_SECONDS,
      sessionExpiresAt: expiresAt,
    } as const;
  }
}
