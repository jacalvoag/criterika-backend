import { verifyRegistrationCode } from '../security/registration-code.js';
import {
  canVerifyRegistrationCode,
  isRegistrationCodeFormatValid,
  type RegistrationChallengeCheck,
  type RegistrationChallengeState,
} from './registration-challenge.js';

interface RegistrationVerificationInput {
  state: RegistrationChallengeState;
  challengeId: string;
  storedVerifier: Uint8Array;
  key: Uint8Array;
  code: string;
  now: Date;
}

type VerificationDecision =
  | { kind: 'accepted' }
  | {
      kind: 'rejected';
      reason: 'VALIDATION_FAILED';
      recordFailedAttempt: false;
    }
  | { kind: 'rejected'; reason: 'CODE_INVALID'; recordFailedAttempt: true }
  | {
      kind: 'rejected';
      reason: Extract<RegistrationChallengeCheck, { ok: false }>['reason'];
      recordFailedAttempt: false;
    };

/**
 * Evaluates a new intention after idempotency recovery and under the pending
 * registration and challenge locks. The caller commits a failed attempt
 * before mapping its rejection to HTTP, and consumes a valid code only with
 * the account and session writes.
 */
export function evaluateRegistrationVerification(
  input: RegistrationVerificationInput,
): VerificationDecision {
  if (!isRegistrationCodeFormatValid(input.code)) {
    return {
      kind: 'rejected',
      reason: 'VALIDATION_FAILED',
      recordFailedAttempt: false,
    };
  }
  const available = canVerifyRegistrationCode(input.state, input.now);
  if (!available.ok) {
    return {
      kind: 'rejected',
      reason: available.reason,
      recordFailedAttempt: false,
    };
  }
  if (
    !verifyRegistrationCode(
      input.key,
      input.challengeId,
      input.code,
      input.storedVerifier,
    )
  ) {
    return {
      kind: 'rejected',
      reason: 'CODE_INVALID',
      recordFailedAttempt: true,
    };
  }
  return { kind: 'accepted' };
}
