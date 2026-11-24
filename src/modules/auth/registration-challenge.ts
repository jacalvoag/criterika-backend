export const REGISTRATION_PENDING_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const REGISTRATION_CODE_LIFETIME_MS = 10 * 60 * 1000;
export const REGISTRATION_RESEND_INTERVAL_MS = 60 * 1000;
export const REGISTRATION_CODE_MAX_ATTEMPTS = 5;

export interface RegistrationChallengeState {
  pendingExpiresAt: Date;
  completed: boolean;
  codeExpiresAt: Date;
  resendAvailableAt: Date;
  failedAttempts: number;
  codeUsed: boolean;
}

export type RegistrationChallengeCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'REGISTRATION_COMPLETED'
        | 'REGISTRATION_EXPIRED'
        | 'CODE_EXPIRED'
        | 'CODE_USED'
        | 'ATTEMPTS_EXHAUSTED'
        | 'RESEND_NOT_YET_AVAILABLE';
    };

function assertValidState(state: RegistrationChallengeState, now: Date): void {
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(state.pendingExpiresAt.getTime()) ||
    !Number.isFinite(state.codeExpiresAt.getTime()) ||
    !Number.isFinite(state.resendAvailableAt.getTime()) ||
    !Number.isInteger(state.failedAttempts) ||
    state.failedAttempts < 0 ||
    state.failedAttempts > REGISTRATION_CODE_MAX_ATTEMPTS
  ) {
    throw new RangeError('Estado de desafío de registro inválido.');
  }
}

/** Checks state only. Comparing the secret and persisting attempts require the locked transaction. */
export function canVerifyRegistrationCode(
  state: RegistrationChallengeState,
  now: Date,
): RegistrationChallengeCheck {
  assertValidState(state, now);
  if (state.completed) return { ok: false, reason: 'REGISTRATION_COMPLETED' };
  if (now.getTime() >= state.pendingExpiresAt.getTime()) {
    return { ok: false, reason: 'REGISTRATION_EXPIRED' };
  }
  if (state.codeUsed) return { ok: false, reason: 'CODE_USED' };
  if (now.getTime() >= state.codeExpiresAt.getTime()) {
    return { ok: false, reason: 'CODE_EXPIRED' };
  }
  if (state.failedAttempts >= REGISTRATION_CODE_MAX_ATTEMPTS) {
    return { ok: false, reason: 'ATTEMPTS_EXHAUSTED' };
  }
  return { ok: true };
}

/** Resending never changes the absolute expiration of the pending registration. */
export function canResendRegistrationCode(
  state: RegistrationChallengeState,
  now: Date,
): RegistrationChallengeCheck {
  assertValidState(state, now);
  if (state.completed) return { ok: false, reason: 'REGISTRATION_COMPLETED' };
  if (now.getTime() >= state.pendingExpiresAt.getTime()) {
    return { ok: false, reason: 'REGISTRATION_EXPIRED' };
  }
  if (state.codeUsed) return { ok: false, reason: 'CODE_USED' };
  if (now.getTime() < state.resendAvailableAt.getTime()) {
    return { ok: false, reason: 'RESEND_NOT_YET_AVAILABLE' };
  }
  return { ok: true };
}

export function isRegistrationCodeFormatValid(code: string): boolean {
  return code.length === 6 && /^[0-9]{6}$/.test(code);
}
