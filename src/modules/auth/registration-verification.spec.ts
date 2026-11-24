import { createRegistrationCodeVerifier } from '../security/registration-code.js';
import { evaluateRegistrationVerification } from './registration-verification.js';

const challengeId = 'abcdef12-3456-4000-8000-123456789abc';
const key = new Uint8Array(32).fill(42);
const input = {
  key,
  challengeId,
  code: '001234',
  storedVerifier: createRegistrationCodeVerifier(key, challengeId, '001234'),
  now: new Date('2026-11-23T12:00:00Z'),
  state: {
    pendingExpiresAt: new Date('2026-11-24T12:00:00Z'),
    completed: false,
    codeExpiresAt: new Date('2026-11-23T12:10:00Z'),
    resendAvailableAt: new Date('2026-11-23T12:01:00Z'),
    failedAttempts: 4,
    codeUsed: false,
  },
};

describe('evaluateRegistrationVerification', () => {
  it('permite el quinto intento y solo solicita guardar un código incorrecto vigente', () => {
    expect(evaluateRegistrationVerification(input)).toEqual({
      kind: 'accepted',
    });
    expect(
      evaluateRegistrationVerification({ ...input, code: '001235' }),
    ).toEqual({
      kind: 'rejected',
      reason: 'CODE_INVALID',
      recordFailedAttempt: true,
    });
    expect(
      evaluateRegistrationVerification({ ...input, code: '1234' }),
    ).toEqual({
      kind: 'rejected',
      reason: 'VALIDATION_FAILED',
      recordFailedAttempt: false,
    });
  });

  it.each([
    [{ failedAttempts: 5 }, 'ATTEMPTS_EXHAUSTED'],
    [{ codeUsed: true }, 'CODE_USED'],
    [{ codeExpiresAt: input.now }, 'CODE_EXPIRED'],
    [{ pendingExpiresAt: input.now }, 'REGISTRATION_EXPIRED'],
  ])(
    'no compara ni registra intentos cuando el código no puede usarse (caso %#)',
    (state, reason) => {
      expect(
        evaluateRegistrationVerification({
          ...input,
          storedVerifier: new Uint8Array(0),
          state: { ...input.state, ...state },
        }),
      ).toEqual({ kind: 'rejected', reason, recordFailedAttempt: false });
    },
  );
});
