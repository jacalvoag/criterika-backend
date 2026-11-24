import type { PoolClient } from 'pg';
import { safeInteger } from '../../database/persistence-values.js';

export interface VerifiedPlayerInput {
  readonly accountId: string;
  readonly normalizedEmail: string;
  readonly name: string;
  readonly surnames: string;
  readonly birthDate: string;
  readonly passwordHash: string;
  readonly verifiedAt: Date;
}

type CreateVerifiedPlayerResult =
  | {
      readonly kind: 'created';
      readonly accountId: string;
      readonly createdAt: Date;
      readonly version: bigint;
    }
  | { readonly kind: 'email_in_use' };

/** Creates the account and initial player state together. */
export interface AccountRegistrationRepository {
  createVerifiedPlayer(
    tx: PoolClient,
    input: VerifiedPlayerInput,
  ): Promise<CreateVerifiedPlayerResult>;
}

export class RegistrationAccountService {
  constructor(private readonly repository: AccountRegistrationRepository) {}

  async createVerifiedPlayer(tx: PoolClient, input: VerifiedPlayerInput) {
    const result = await this.repository.createVerifiedPlayer(tx, input);
    if (result.kind === 'email_in_use') return result;

    const version = safeInteger(result.version.toString());
    if (version < 1) throw new RangeError('Versión de cuenta inválida.');

    return {
      kind: 'created',
      profile: {
        id: result.accountId,
        nombre: input.name,
        apellidos: input.surnames,
        fechaNacimiento: input.birthDate,
        correo: input.normalizedEmail,
        avatarMediaId: null,
        estado: 'ACTIVA',
        suspensionHasta: null,
        creadaEn: result.createdAt.toISOString(),
        version,
      },
    } as const;
  }
}
