import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { PoolClient } from 'pg';
import type { RegistrationAccountService } from '../accounts/registration-account.service.js';
import type {
  OriginalRegistrationAcceptance,
  RegistrationLegalService,
} from '../legal/registration-legal.service.js';
import {
  createRegistrationCodeVerifier,
  generateRegistrationCode,
} from '../security/registration-code.js';
import type { RegistrationPlayerSessionsService } from '../security/registration-player-sessions.service.js';
import { canResendRegistrationCode } from './registration-challenge.js';
import type { RegistrationInput } from './registration-input.js';
import {
  calculateRegistrationIssuance,
  toRegistrationChallengeResponse,
} from './registration-issuance.js';
import { evaluateRegistrationVerification } from './registration-verification.js';

interface NewPendingRegistration {
  registrationId: string;
  normalizedEmail: string;
  name: string;
  surnames: string;
  birthDate: string;
  passwordHash: string;
  acceptance: OriginalRegistrationAcceptance;
  createdAt: Date;
  expiresAt: Date;
}

interface NewRegistrationChallenge {
  challengeId: string;
  registrationId: string;
  destinationEmail: string;
  verifierHash: Uint8Array;
  encryptedMail: Uint8Array;
  createdAt: Date;
  expiresAt: Date;
  resendAvailableAt: Date;
}

interface PendingRegistration extends NewPendingRegistration {
  completedAccountId: string | null;
}

interface StoredRegistrationChallenge extends Omit<
  NewRegistrationChallenge,
  'encryptedMail'
> {
  failedAttempts: number;
  usedAt: Date | null;
}

export interface RegistrationRepository {
  createPending(tx: PoolClient, input: NewPendingRegistration): Promise<void>;
  createChallenge(
    tx: PoolClient,
    input: NewRegistrationChallenge,
  ): Promise<void>;
  findPendingForUpdate(
    tx: PoolClient,
    registrationId: string,
  ): Promise<PendingRegistration | null>;
  findLatestChallengeForUpdate(
    tx: PoolClient,
    registrationId: string,
  ): Promise<StoredRegistrationChallenge | null>;
  invalidatePreviousCodes(
    tx: PoolClient,
    registrationId: string,
    at: Date,
  ): Promise<void>;
  incrementFailedAttempts(tx: PoolClient, challengeId: string): Promise<number>;
  consumeChallenge(
    tx: PoolClient,
    challengeId: string,
    at: Date,
  ): Promise<void>;
  markCompleted(
    tx: PoolClient,
    registrationId: string,
    accountId: string,
  ): Promise<void>;
}

type ChallengeResponse = ReturnType<typeof toRegistrationChallengeResponse>;
type MissingOrClosedRegistration = 'RESOURCE_NOT_FOUND' | 'STATE_CONFLICT';
type VerificationRejection =
  | MissingOrClosedRegistration
  | LegalRejection
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
  | 'RATE_LIMITED';

const verificationRejections = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CODE_INVALID: 'CODE_INVALID',
  CODE_EXPIRED: 'CODE_EXPIRED',
  CODE_USED: 'CODE_INVALID',
  REGISTRATION_COMPLETED: 'STATE_CONFLICT',
  REGISTRATION_EXPIRED: 'CODE_EXPIRED',
  ATTEMPTS_EXHAUSTED: 'RATE_LIMITED',
  RESEND_NOT_YET_AVAILABLE: 'RATE_LIMITED',
} as const satisfies Record<string, VerificationRejection>;
type LegalRejection =
  | 'LEGAL_CONFIGURATION_MISSING'
  | 'LEGAL_VERSION_OUTDATED'
  | 'VALIDATION_FAILED';
type RegistrationOutcome<T, Code extends string> =
  | { kind: 'success'; value: T }
  | { kind: 'rejected'; code: Code; retryAfterSeconds?: number };

export interface RegistrationChallengeProtection {
  verifierKey: Uint8Array;
  /** Protects delivery material locally. The mail provider runs outside the transaction. */
  protectMail(payload: {
    challengeId: string;
    destinationEmail: string;
    code: string;
    expiresAt: Date;
  }): Uint8Array;
}

type StartInput = Omit<RegistrationInput, 'password'> & {
  passwordHash: string;
  acceptedAt: Date;
  ip: string;
};

export class RegistrationCommands {
  constructor(
    private readonly repository: RegistrationRepository,
    private readonly legal: Pick<
      RegistrationLegalService,
      'assertCurrentSelection' | 'recordOriginalAcceptance'
    >,
    private readonly protection: RegistrationChallengeProtection,
    private readonly accounts: Pick<
      RegistrationAccountService,
      'createVerifiedPlayer'
    >,
    private readonly sessions: Pick<
      RegistrationPlayerSessionsService,
      'issueForNewPlayer'
    >,
  ) {}

  /** Run only for a new idempotent intention, using the same transaction as its confirmation. */
  async start(
    tx: PoolClient,
    input: StartInput,
    now: Date,
  ): Promise<RegistrationOutcome<ChallengeResponse, LegalRejection>> {
    if (
      !Number.isFinite(input.acceptedAt.getTime()) ||
      isIP(input.ip) === 0 ||
      !input.passwordHash.startsWith('$argon2id$')
    ) {
      throw new RangeError('Evidencia o hash de registro inválidos.');
    }
    const selection = await this.legal.assertCurrentSelection(
      tx,
      input.legalSelection,
    );
    if (!selection.ok) return rejectLegal(selection.reason);

    const registrationId = randomUUID();
    const issuance = calculateRegistrationIssuance(now);
    const challenge = this.prepareChallenge(
      registrationId,
      input.normalizedEmail,
      issuance,
    );

    await this.repository.createPending(tx, {
      registrationId,
      normalizedEmail: input.normalizedEmail,
      name: input.name,
      surnames: input.surnames,
      birthDate: input.birthDate,
      passwordHash: input.passwordHash,
      acceptance: {
        ...input.legalSelection,
        acceptedAt: input.acceptedAt,
        ip: input.ip,
      },
      createdAt: issuance.createdAt,
      expiresAt: issuance.pendingExpiresAt,
    });
    await this.repository.createChallenge(tx, challenge);
    return {
      kind: 'success',
      value: toRegistrationChallengeResponse(registrationId, issuance),
    };
  }

  /** Call after handling idempotency, keeping the replacement in the same transaction. */
  async resend(
    tx: PoolClient,
    registrationId: string,
    clock: () => Date,
  ): Promise<
    RegistrationOutcome<
      ChallengeResponse,
      MissingOrClosedRegistration | 'RATE_LIMITED'
    >
  > {
    const active = await this.loadChallenge(tx, registrationId);
    if (active.kind === 'rejected') return active;
    const { pending, challenge } = active;
    const now = clock();
    const canResend = canResendRegistrationCode(
      toChallengeState(pending, challenge),
      now,
    );
    if (!canResend.ok) {
      if (canResend.reason === 'RESEND_NOT_YET_AVAILABLE') {
        return {
          kind: 'rejected',
          code: 'RATE_LIMITED',
          retryAfterSeconds: secondsUntilResend(challenge, now),
        };
      }
      return { kind: 'rejected', code: 'STATE_CONFLICT' };
    }

    const issuance = calculateRegistrationIssuance(now, pending.expiresAt);
    const replacement = this.prepareChallenge(
      registrationId,
      pending.normalizedEmail,
      issuance,
    );
    await this.repository.invalidatePreviousCodes(tx, registrationId, now);
    await this.repository.createChallenge(tx, replacement);
    return {
      kind: 'success',
      value: toRegistrationChallengeResponse(registrationId, issuance),
    };
  }

  /** Run after replay handling; the caller must commit the decision with idempotency. */
  async verify(
    tx: PoolClient,
    registrationId: string,
    code: string,
    clock: () => Date,
  ) {
    const active = await this.loadChallenge(tx, registrationId);
    if (active.kind === 'rejected') return active;
    const { pending, challenge } = active;
    const now = clock();
    const decision = evaluateRegistrationVerification({
      state: toChallengeState(pending, challenge),
      challengeId: challenge.challengeId,
      storedVerifier: challenge.verifierHash,
      key: this.protection.verifierKey,
      code,
      now,
    });
    if (decision.kind === 'rejected') {
      if (decision.recordFailedAttempt) {
        await this.repository.incrementFailedAttempts(
          tx,
          challenge.challengeId,
        );
      }
      const rejection = verificationRejections[decision.reason];
      if (rejection === 'RATE_LIMITED') {
        return {
          kind: 'rejected',
          code: rejection,
          retryAfterSeconds: secondsUntilResend(challenge, now),
        } as const;
      }
      return {
        kind: 'rejected',
        code: rejection,
      } as const;
    }

    const selection = await this.legal.assertCurrentSelection(
      tx,
      pending.acceptance,
    );
    if (!selection.ok) return rejectLegal(selection.reason);
    const player = await this.accounts.createVerifiedPlayer(tx, {
      accountId: randomUUID(),
      normalizedEmail: pending.normalizedEmail,
      name: pending.name,
      surnames: pending.surnames,
      birthDate: pending.birthDate,
      passwordHash: pending.passwordHash,
      verifiedAt: now,
    });
    if (player.kind === 'email_in_use') {
      return { kind: 'rejected', code: 'STATE_CONFLICT' } as const;
    }

    const accountId = player.profile.id;
    await this.legal.recordOriginalAcceptance(
      tx,
      accountId,
      pending.acceptance,
    );
    await this.repository.consumeChallenge(tx, challenge.challengeId, now);
    await this.repository.markCompleted(tx, registrationId, accountId);
    const credentials = await this.sessions.issueForNewPlayer(
      tx,
      accountId,
      now,
    );
    return {
      kind: 'success',
      value: {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        tokenType: credentials.tokenType,
        accessExpiresIn: credentials.accessExpiresIn,
        sessionExpiresAt: credentials.sessionExpiresAt.toISOString(),
        sessionId: credentials.sessionId,
        usuario: player.profile,
        requiereNuevaAceptacion: false,
      },
    } as const;
  }

  private async loadChallenge(tx: PoolClient, registrationId: string) {
    const pending = await this.repository.findPendingForUpdate(
      tx,
      registrationId,
    );
    if (!pending)
      return { kind: 'rejected', code: 'RESOURCE_NOT_FOUND' } as const;
    if (pending.completedAccountId !== null) {
      return { kind: 'rejected', code: 'STATE_CONFLICT' } as const;
    }
    const challenge = await this.repository.findLatestChallengeForUpdate(
      tx,
      registrationId,
    );
    if (
      !challenge ||
      challenge.registrationId !== pending.registrationId ||
      challenge.destinationEmail !== pending.normalizedEmail
    ) {
      throw new Error('El registro no tiene un desafío asociado válido.');
    }
    return { kind: 'loaded', pending, challenge } as const;
  }

  private prepareChallenge(
    registrationId: string,
    destinationEmail: string,
    issuance: ReturnType<typeof calculateRegistrationIssuance>,
  ): NewRegistrationChallenge {
    const challengeId = randomUUID();
    const code = generateRegistrationCode();
    const verifierHash = createRegistrationCodeVerifier(
      this.protection.verifierKey,
      challengeId,
      code,
    );
    const encryptedMail = this.protection.protectMail({
      challengeId,
      destinationEmail,
      code,
      expiresAt: issuance.codeExpiresAt,
    });
    if (encryptedMail.byteLength === 0)
      throw new Error('Mensaje protegido vacío.');
    return {
      registrationId,
      challengeId,
      destinationEmail,
      verifierHash,
      encryptedMail,
      createdAt: issuance.createdAt,
      expiresAt: issuance.codeExpiresAt,
      resendAvailableAt: issuance.resendAvailableAt,
    };
  }
}

function secondsUntilResend(
  challenge: StoredRegistrationChallenge,
  now: Date,
): number {
  return Math.max(
    1,
    Math.ceil((challenge.resendAvailableAt.getTime() - now.getTime()) / 1000),
  );
}

function toChallengeState(
  pending: PendingRegistration,
  challenge: StoredRegistrationChallenge,
) {
  return {
    pendingExpiresAt: pending.expiresAt,
    completed: pending.completedAccountId !== null,
    codeExpiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt,
    failedAttempts: challenge.failedAttempts,
    codeUsed: challenge.usedAt !== null,
  };
}

function rejectLegal(reason: LegalRejection | 'INVALID_PURPOSES'): {
  kind: 'rejected';
  code: LegalRejection;
} {
  return {
    kind: 'rejected',
    code: reason === 'INVALID_PURPOSES' ? 'VALIDATION_FAILED' : reason,
  };
}
