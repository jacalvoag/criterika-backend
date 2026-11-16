/**
 * Firmas del acuerdo de registro; no contiene implementaciones ni proveedores Nest.
 * UUID/fechas/longitudes se validan en los límites indicados en registro.md.
 * Al implementar se trasladan a sus módulos; src/ nunca importa desde docs/.
 */
import type { PoolClient } from 'pg';

export type UUID = string;
export type LocalDate = string;

export type ApiActor =
  | { readonly type: 'SISTEMA' }
  | { readonly type: 'JUGADOR' | 'ADMINISTRADOR'; readonly accountId: UUID };

export interface TransactionContext {
  readonly actor: ApiActor;
  readonly requestId: UUID;
  readonly reason?: string;
}

export interface TransactionRunner {
  run<T>(
    context: TransactionContext,
    work: (tx: PoolClient, transactionTime: Date) => Promise<T>,
  ): Promise<T>;
}

export interface LegalSelection {
  readonly termsVersionId: UUID;
  readonly privacyVersionId: UUID;
  readonly purposeCodes: readonly string[];
}

export interface CurrentLegalSelection extends LegalSelection {
  readonly requiredPurposeCodes: readonly string[];
}

export interface PublishedLegalDocument {
  readonly id: UUID;
  readonly type: 'TERMINOS' | 'AVISO_PRIVACIDAD';
  readonly versionLabel: string;
  readonly markdown: string;
  readonly sha256: Uint8Array;
  readonly publishedAt: Date;
  readonly requiresAcceptance: boolean;
  readonly purposes: readonly {
    readonly code: string;
    readonly description: string;
    readonly necessary: boolean;
  }[];
}

export interface OriginalAcceptance extends LegalSelection {
  readonly acceptedAt: Date;
  readonly ip: string;
}

export interface PendingRegistration {
  readonly registrationId: UUID;
  readonly normalizedEmail: string;
  readonly name: string;
  readonly surnames: string;
  readonly birthDate: LocalDate;
  readonly passwordHash: string;
  readonly acceptance: OriginalAcceptance;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly completedAccountId: UUID | null;
}

export interface StoredRegistrationChallenge {
  readonly challengeId: UUID;
  readonly registrationId: UUID;
  readonly destinationEmail: string;
  readonly verifierHash: Uint8Array;
  readonly failedAttempts: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly resendAvailableAt: Date;
  readonly usedAt: Date | null;
}

export interface NewRegistrationChallenge {
  readonly challengeId: UUID;
  readonly registrationId: UUID;
  readonly destinationEmail: string;
  readonly verifierHash: Uint8Array;
  readonly encryptedMail: Uint8Array;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly resendAvailableAt: Date;
}

/** José implementa estos métodos en auth/repositories; todos usan tx. */
export interface RegistrationRepository {
  createPending(
    tx: PoolClient,
    input: Omit<PendingRegistration, 'completedAccountId'>,
  ): Promise<void>;
  findPendingForUpdate(
    tx: PoolClient,
    registrationId: UUID,
  ): Promise<PendingRegistration | null>;
  findLatestChallengeForUpdate(
    tx: PoolClient,
    registrationId: UUID,
  ): Promise<StoredRegistrationChallenge | null>;
  createChallenge(
    tx: PoolClient,
    input: NewRegistrationChallenge,
  ): Promise<void>;
  invalidatePreviousCodes(
    tx: PoolClient,
    registrationId: UUID,
    at: Date,
  ): Promise<void>;
  incrementFailedAttempts(tx: PoolClient, challengeId: UUID): Promise<number>;
  consumeChallenge(tx: PoolClient, challengeId: UUID, at: Date): Promise<void>;
  markCompleted(
    tx: PoolClient,
    registrationId: UUID,
    accountId: UUID,
  ): Promise<void>;
}

/** Privado de legal; Uzzi expone validación/registro a través de LegalService. */
export interface LegalRegistrationRepository {
  getCurrentForShare(tx: PoolClient): Promise<CurrentLegalSelection | null>;
  getPublishedDocument(
    tx: PoolClient,
    versionId: UUID,
  ): Promise<PublishedLegalDocument | null>;
  createAcceptance(
    tx: PoolClient,
    input: OriginalAcceptance & { readonly accountId: UUID },
  ): Promise<UUID>;
}

export interface VerifiedPlayerInput {
  readonly accountId: UUID;
  readonly normalizedEmail: string;
  readonly name: string;
  readonly surnames: string;
  readonly birthDate: LocalDate;
  readonly passwordHash: string;
  readonly verifiedAt: Date;
}

export type CreateVerifiedPlayerResult =
  | {
      readonly kind: 'created';
      readonly accountId: UUID;
      readonly createdAt: Date;
      readonly version: bigint;
    }
  | { readonly kind: 'email_in_use' };

/** Privado de accounts; incluye crear estados_jugador con sus valores iniciales. */
export interface AccountRegistrationRepository {
  createVerifiedPlayer(
    tx: PoolClient,
    input: VerifiedPlayerInput,
  ): Promise<CreateVerifiedPlayerResult>;
}

export interface NewPlayerSession {
  readonly sessionId: UUID;
  readonly accountId: UUID;
  readonly refreshHash: Uint8Array;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** Material temporal para el coordinador; no es una fila ni el perfil HTTP. */
export interface PreparedPlayerCredentials {
  readonly sessionId: UUID;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly accessExpiresIn: number;
  readonly sessionExpiresAt: Date;
}

/** Privado de security; no recibe el access JWT ni el refresh en claro. */
export interface PlayerSessionRepository {
  create(tx: PoolClient, input: NewPlayerSession): Promise<void>;
}

export interface IdempotentIntent {
  readonly scopeHash: Uint8Array;
  readonly key: UUID;
  readonly method: 'POST';
  readonly normalizedRoute: string;
  readonly requestHash: Uint8Array;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface EncryptedHttpResponse {
  readonly status: number;
  readonly bodyCiphertext: Uint8Array;
  readonly expiresAt: Date;
  readonly accountId?: UUID;
  readonly sessionId?: UUID;
}

export type IdempotentClaim =
  | { readonly kind: 'reserved'; readonly recordId: UUID }
  | { readonly kind: 'replay'; readonly response: EncryptedHttpResponse }
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'different_request' };

/** Privado de la capacidad común de idempotencia de José. */
export interface IdempotencyRepository {
  claimOrLoad(
    tx: PoolClient,
    intent: IdempotentIntent,
  ): Promise<IdempotentClaim>;
  confirm(
    tx: PoolClient,
    recordId: UUID,
    response: EncryptedHttpResponse,
  ): Promise<void>;
}

/** Un rechazo esperado se devuelve al runner si debe confirmar un contador. */
export type RegistrationOutcome<T> =
  | { readonly kind: 'success'; readonly value: T }
  | {
      readonly kind: 'rejected';
      readonly code:
        | 'CODE_INVALID'
        | 'CODE_EXPIRED'
        | 'RESOURCE_NOT_FOUND'
        | 'STATE_CONFLICT'
        | 'LEGAL_VERSION_OUTDATED'
        | 'LEGAL_CONFIGURATION_MISSING'
        | 'VALIDATION_FAILED'
        | 'RATE_LIMITED';
    };
