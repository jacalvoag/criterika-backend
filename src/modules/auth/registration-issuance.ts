import {
  REGISTRATION_CODE_LIFETIME_MS,
  REGISTRATION_CODE_MAX_ATTEMPTS,
  REGISTRATION_PENDING_LIFETIME_MS,
  REGISTRATION_RESEND_INTERVAL_MS,
} from './registration-challenge.js';

interface RegistrationIssuance {
  createdAt: Date;
  pendingExpiresAt: Date;
  codeExpiresAt: Date;
  resendAvailableAt: Date;
}

/** For reissues, pass the original deadline after checking the resend rules. */
export function calculateRegistrationIssuance(
  now: Date,
  existingPendingExpiresAt?: Date,
): RegistrationIssuance {
  const issued = now.getTime();
  const pending =
    existingPendingExpiresAt?.getTime() ??
    issued + REGISTRATION_PENDING_LIFETIME_MS;
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(pending) ||
    issued >= pending
  ) {
    throw new RangeError('Vigencia de registro inválida.');
  }

  return {
    createdAt: new Date(issued),
    pendingExpiresAt: new Date(pending),
    codeExpiresAt: new Date(
      Math.min(issued + REGISTRATION_CODE_LIFETIME_MS, pending),
    ),
    resendAvailableAt: new Date(issued + REGISTRATION_RESEND_INTERVAL_MS),
  };
}

/** Exposes the stable registration ID, never the internal code issuance ID. */
export function toRegistrationChallengeResponse(
  registrationId: string,
  issuance: Pick<RegistrationIssuance, 'codeExpiresAt' | 'resendAvailableAt'>,
) {
  return {
    id: registrationId,
    expiraEn: issuance.codeExpiresAt.toISOString(),
    reenvioDisponibleEn: issuance.resendAvailableAt.toISOString(),
    vigenciaSegundos: REGISTRATION_CODE_LIFETIME_MS / 1000,
    maximoIntentos: REGISTRATION_CODE_MAX_ATTEMPTS,
  };
}
