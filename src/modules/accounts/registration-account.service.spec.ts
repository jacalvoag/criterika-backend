import type { PoolClient } from 'pg';
import {
  RegistrationAccountService,
  type AccountRegistrationRepository,
} from './registration-account.service.js';

const tx = {} as PoolClient;
const input = {
  accountId: 'account-id',
  normalizedEmail: 'ana@example.invalid',
  name: 'Ana',
  surnames: 'Pérez',
  birthDate: '2000-01-01',
  passwordHash: 'test-hash',
  verifiedAt: new Date('2026-11-23T19:00Z'),
};

describe('RegistrationAccountService', () => {
  it('envía el alta al repositorio y construye el perfil público sin el hash', async () => {
    const repository = {
      createVerifiedPlayer: vi
        .fn<AccountRegistrationRepository['createVerifiedPlayer']>()
        .mockResolvedValue({
          kind: 'created',
          accountId: input.accountId,
          createdAt: input.verifiedAt,
          version: 2n,
        }),
    };
    await expect(
      new RegistrationAccountService(repository).createVerifiedPlayer(
        tx,
        input,
      ),
    ).resolves.toEqual({
      kind: 'created',
      profile: {
        id: input.accountId,
        nombre: 'Ana',
        apellidos: 'Pérez',
        fechaNacimiento: '2000-01-01',
        correo: input.normalizedEmail,
        avatarMediaId: null,
        estado: 'ACTIVA',
        suspensionHasta: null,
        creadaEn: '2026-11-23T19:00:00.000Z',
        version: 2,
      },
    });
    expect(repository.createVerifiedPlayer).toHaveBeenCalledExactlyOnceWith(
      tx,
      input,
    );
  });

  it('propaga el correo ocupado sin crear una representación de cuenta', async () => {
    const repository = {
      createVerifiedPlayer: vi
        .fn<AccountRegistrationRepository['createVerifiedPlayer']>()
        .mockResolvedValue({ kind: 'email_in_use' }),
    };
    await expect(
      new RegistrationAccountService(repository).createVerifiedPlayer(
        tx,
        input,
      ),
    ).resolves.toEqual({ kind: 'email_in_use' });
  });
});
