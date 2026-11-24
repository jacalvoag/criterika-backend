import type { PoolClient } from 'pg';
import type { RegistrationLegalService } from '../legal/registration-legal.service.js';
import { verifyRegistrationCode } from '../security/registration-code.js';
import {
  RegistrationCommands,
  type RegistrationRepository,
} from './registration-commands.js';

const tx = {} as PoolClient;
const now = new Date('2026-11-23T19:05:00Z');
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

function setup() {
  const repository = {
    createPending: vi
      .fn<RegistrationRepository['createPending']>()
      .mockResolvedValue(undefined),
    createChallenge: vi
      .fn<RegistrationRepository['createChallenge']>()
      .mockResolvedValue(undefined),
  };
  const legal = {
    assertCurrentSelection: vi
      .fn<RegistrationLegalService['assertCurrentSelection']>()
      .mockResolvedValue({ ok: true }),
  };
  const protection = {
    verifierKey: new Uint8Array(32).fill(42),
    protectMail: vi
      .fn<
        import('./registration-commands.js').RegistrationChallengeProtection['protectMail']
      >()
      .mockReturnValue(new Uint8Array([1, 2, 3])),
  };
  return {
    repository,
    legal,
    protection,
    commands: new RegistrationCommands(repository, legal, protection),
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
