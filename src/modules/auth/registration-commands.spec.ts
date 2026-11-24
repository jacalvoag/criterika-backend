import type { PoolClient } from 'pg';
import type { RegistrationAccountService } from '../accounts/registration-account.service.js';
import type { RegistrationLegalService } from '../legal/registration-legal.service.js';
import type { RegistrationPlayerSessionsService } from '../security/registration-player-sessions.service.js';
import {
  createRegistrationCodeVerifier,
  verifyRegistrationCode,
} from '../security/registration-code.js';
import {
  RegistrationCommands,
  type RegistrationChallengeProtection,
  type RegistrationRepository,
} from './registration-commands.js';

const tx = {} as PoolClient;
const now = new Date('2026-11-23T19:05:00Z');
const registrationId = 'af72d98a-234c-4c46-82d0-4e2fca67ca28';
const challengeId = '9f8b559c-cd87-41d3-8017-52e376ca4190';
const sessionId = '880113ab-a5d9-48f3-b190-aa91eae352f9';
const verifierKey = new Uint8Array(32).fill(42);
const input = {
  normalizedEmail: 'ana@example.invalid',
  name: 'Ana',
  surnames: 'Pérez',
  birthDate: '2000-01-01',
  legalSelection: {
    termsVersionId: 't1',
    privacyVersionId: 'p1',
    purposeCodes: ['cuenta'],
  },
  acceptedAt: new Date('2026-11-23T19:04:58Z'),
  ip: '192.0.2.42',
  passwordHash: '$argon2id$test',
};
const pending = {
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
  createdAt: now,
  expiresAt: new Date('2026-11-24T19:05:00Z'),
  completedAccountId: null,
};
const oldChallenge = {
  challengeId,
  registrationId,
  destinationEmail: input.normalizedEmail,
  verifierHash: createRegistrationCodeVerifier(
    verifierKey,
    challengeId,
    '001234',
  ),
  createdAt: now,
  expiresAt: new Date('2026-11-23T19:15:00Z'),
  resendAvailableAt: new Date('2026-11-23T19:06:00Z'),
  failedAttempts: 0,
  usedAt: null,
};

function setup() {
  const repository = {
    createPending: vi
      .fn<RegistrationRepository['createPending']>()
      .mockResolvedValue(undefined),
    createChallenge: vi
      .fn<RegistrationRepository['createChallenge']>()
      .mockResolvedValue(undefined),
    findPendingForUpdate: vi
      .fn<RegistrationRepository['findPendingForUpdate']>()
      .mockResolvedValue(pending),
    findLatestChallengeForUpdate: vi
      .fn<RegistrationRepository['findLatestChallengeForUpdate']>()
      .mockResolvedValue(oldChallenge),
    invalidatePreviousCodes: vi
      .fn<RegistrationRepository['invalidatePreviousCodes']>()
      .mockResolvedValue(undefined),
    incrementFailedAttempts: vi
      .fn<RegistrationRepository['incrementFailedAttempts']>()
      .mockResolvedValue(1),
    consumeChallenge: vi
      .fn<RegistrationRepository['consumeChallenge']>()
      .mockResolvedValue(undefined),
    markCompleted: vi
      .fn<RegistrationRepository['markCompleted']>()
      .mockResolvedValue(undefined),
  };
  const legal = {
    assertCurrentSelection: vi
      .fn<RegistrationLegalService['assertCurrentSelection']>()
      .mockResolvedValue({ ok: true }),
    recordOriginalAcceptance: vi
      .fn<RegistrationLegalService['recordOriginalAcceptance']>()
      .mockResolvedValue('acceptance-id'),
  };
  const accounts = {
    createVerifiedPlayer: vi
      .fn<RegistrationAccountService['createVerifiedPlayer']>()
      .mockResolvedValue({
        kind: 'created',
        profile: {
          id: 'new-account',
          nombre: pending.name,
          apellidos: pending.surnames,
          fechaNacimiento: pending.birthDate,
          correo: pending.normalizedEmail,
          avatarMediaId: null,
          estado: 'ACTIVA',
          suspensionHasta: null,
          creadaEn: now.toISOString(),
          version: 1,
        },
      }),
  };
  const sessions = {
    issueForNewPlayer: vi
      .fn<RegistrationPlayerSessionsService['issueForNewPlayer']>()
      .mockResolvedValue({
        sessionId,
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        tokenType: 'Bearer',
        accessExpiresIn: 900,
        sessionExpiresAt: new Date('2026-12-23T19:05:00Z'),
      }),
  };
  const protection = {
    verifierKey,
    protectMail: vi
      .fn<RegistrationChallengeProtection['protectMail']>()
      .mockReturnValue(new Uint8Array([1, 2, 3])),
  };
  return {
    repository,
    legal,
    protection,
    accounts,
    sessions,
    commands: new RegistrationCommands(
      repository,
      legal,
      protection,
      accounts,
      sessions,
    ),
  };
}

describe('RegistrationCommands.start', () => {
  it('guarda el pendiente con la evidencia original y solo el verificador y mensaje protegido', async () => {
    const { repository, protection, commands } = setup();
    const result = await commands.start(tx, input, now);
    expect(result.kind).toBe('success');
    const [pendingClient, pending] = repository.createPending.mock.calls[0];
    const [challengeClient, challenge] =
      repository.createChallenge.mock.calls[0];
    const [delivery] = protection.protectMail.mock.calls[0];
    expect(pendingClient).toBe(tx);
    expect(challengeClient).toBe(tx);
    expect(pending.acceptance).toEqual({
      ...input.legalSelection,
      acceptedAt: input.acceptedAt,
      ip: input.ip,
    });
    expect(challenge.registrationId).toBe(pending.registrationId);
    expect(challenge).not.toHaveProperty('code');
    expect(challenge.encryptedMail).toEqual(new Uint8Array([1, 2, 3]));
    expect(
      verifyRegistrationCode(
        protection.verifierKey,
        challenge.challengeId,
        delivery.code,
        challenge.verifierHash,
      ),
    ).toBe(true);
    expect(result).toMatchObject({
      kind: 'success',
      value: { id: pending.registrationId },
    });
  });

  it('devuelve el conflicto legal antes de preparar o escribir el registro', async () => {
    const { repository, legal, protection, commands } = setup();
    legal.assertCurrentSelection.mockResolvedValue({
      ok: false,
      reason: 'LEGAL_VERSION_OUTDATED',
    });
    await expect(commands.start(tx, input, now)).resolves.toEqual({
      kind: 'rejected',
      code: 'LEGAL_VERSION_OUTDATED',
    });
    expect(protection.protectMail).not.toHaveBeenCalled();
    expect(repository.createPending).not.toHaveBeenCalled();
    expect(repository.createChallenge).not.toHaveBeenCalled();
  });
});

describe('RegistrationCommands.verify', () => {
  it('usa la misma transacción para vincular la aceptación original y emitir la sesión', async () => {
    const { accounts, commands, legal, repository, sessions } = setup();
    await expect(
      commands.verify(tx, registrationId, '001234', () => now),
    ).resolves.toMatchObject({
      kind: 'success',
      value: {
        sessionId,
        usuario: { id: 'new-account' },
        sessionExpiresAt: '2026-12-23T19:05:00.000Z',
        requiereNuevaAceptacion: false,
      },
    });
    expect(legal.assertCurrentSelection).toHaveBeenCalledBefore(
      accounts.createVerifiedPlayer,
    );
    expect(accounts.createVerifiedPlayer).toHaveBeenCalledExactlyOnceWith(
      tx,
      expect.objectContaining({
        normalizedEmail: pending.normalizedEmail,
        passwordHash: pending.passwordHash,
        verifiedAt: now,
      }),
    );
    expect(legal.recordOriginalAcceptance).toHaveBeenCalledExactlyOnceWith(
      tx,
      'new-account',
      pending.acceptance,
    );
    expect(repository.consumeChallenge).toHaveBeenCalledExactlyOnceWith(
      tx,
      challengeId,
      now,
    );
    expect(repository.markCompleted).toHaveBeenCalledExactlyOnceWith(
      tx,
      registrationId,
      'new-account',
    );
    expect(sessions.issueForNewPlayer).toHaveBeenCalledExactlyOnceWith(
      tx,
      'new-account',
      now,
    );
  });

  it('espera la escritura del intento incorrecto y devuelve el rechazo sin lanzar', async () => {
    const { accounts, commands, repository, sessions } = setup();
    await expect(
      commands.verify(tx, registrationId, '001235', () => now),
    ).resolves.toEqual({ kind: 'rejected', code: 'CODE_INVALID' });
    expect(repository.incrementFailedAttempts).toHaveBeenCalledExactlyOnceWith(
      tx,
      challengeId,
    );
    expect(repository.consumeChallenge).not.toHaveBeenCalled();
    expect(accounts.createVerifiedPlayer).not.toHaveBeenCalled();
    expect(sessions.issueForNewPlayer).not.toHaveBeenCalled();
  });

  it('exige nueva aceptación cuando cambiaron los documentos sin crear la cuenta', async () => {
    const { accounts, commands, legal, repository, sessions } = setup();
    legal.assertCurrentSelection.mockResolvedValue({
      ok: false,
      reason: 'LEGAL_VERSION_OUTDATED',
    });
    await expect(
      commands.verify(tx, registrationId, '001234', () => now),
    ).resolves.toEqual({ kind: 'rejected', code: 'LEGAL_VERSION_OUTDATED' });
    expect(legal.recordOriginalAcceptance).not.toHaveBeenCalled();
    expect(repository.consumeChallenge).not.toHaveBeenCalled();
    expect(accounts.createVerifiedPlayer).not.toHaveBeenCalled();
    expect(sessions.issueForNewPlayer).not.toHaveBeenCalled();
  });

  it('devuelve el tiempo hasta el reenvío al agotar intentos sin incrementar el contador', async () => {
    const { commands, repository } = setup();
    repository.findLatestChallengeForUpdate.mockResolvedValue({
      ...oldChallenge,
      failedAttempts: 5,
    });
    await expect(
      commands.verify(tx, registrationId, '001234', () => now),
    ).resolves.toEqual({
      kind: 'rejected',
      code: 'RATE_LIMITED',
      retryAfterSeconds: 60,
    });
    expect(repository.incrementFailedAttempts).not.toHaveBeenCalled();
  });

  it('un correo ya ocupado no consume el código ni emite sesión para otra cuenta', async () => {
    const { accounts, commands, repository, sessions } = setup();
    accounts.createVerifiedPlayer.mockResolvedValue({ kind: 'email_in_use' });
    await expect(
      commands.verify(tx, registrationId, '001234', () => now),
    ).resolves.toEqual({ kind: 'rejected', code: 'STATE_CONFLICT' });
    expect(repository.consumeChallenge).not.toHaveBeenCalled();
    expect(repository.markCompleted).not.toHaveBeenCalled();
    expect(sessions.issueForNewPlayer).not.toHaveBeenCalled();
  });
});

describe('RegistrationCommands.resend', () => {
  it('toma la hora después de bloquear y reemplaza el desafío sin extender el pendiente', async () => {
    const { repository, commands } = setup();
    const reissuedAt = new Date('2026-11-24T19:02:00Z');
    const clock = vi.fn(() => reissuedAt);
    await expect(
      commands.resend(tx, registrationId, clock),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { id: registrationId, expiraEn: '2026-11-24T19:05:00.000Z' },
    });
    expect(repository.findPendingForUpdate).toHaveBeenCalledBefore(
      repository.findLatestChallengeForUpdate,
    );
    expect(repository.findLatestChallengeForUpdate).toHaveBeenCalledBefore(
      clock,
    );
    expect(repository.invalidatePreviousCodes).toHaveBeenCalledExactlyOnceWith(
      tx,
      registrationId,
      reissuedAt,
    );
    expect(repository.invalidatePreviousCodes).toHaveBeenCalledBefore(
      repository.createChallenge,
    );
    const [client, replacement] = repository.createChallenge.mock.calls[0];
    expect(client).toBe(tx);
    expect(replacement.challengeId).not.toBe(challengeId);
    expect(repository.createPending).not.toHaveBeenCalled();
  });

  it('devuelve el tiempo de espera y conserva el código cuando el reenvío es prematuro', async () => {
    const { repository, commands } = setup();
    await expect(
      commands.resend(
        tx,
        registrationId,
        () => new Date('2026-11-23T19:05:59.900Z'),
      ),
    ).resolves.toEqual({
      kind: 'rejected',
      code: 'RATE_LIMITED',
      retryAfterSeconds: 1,
    });
    expect(repository.invalidatePreviousCodes).not.toHaveBeenCalled();
    expect(repository.createChallenge).not.toHaveBeenCalled();
  });
});
