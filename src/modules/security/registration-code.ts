import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const CODE_PATTERN = /^[0-9]{6}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERIFIER_LENGTH = 32;
const DOMAIN = 'criterika:registration-code:v1\0';

function isCode(code: string): boolean {
  return code.length === 6 && CODE_PATTERN.test(code);
}

function assertKeyAndChallenge(key: Uint8Array, challengeId: string): void {
  if (key.length !== 32)
    throw new RangeError('Clave de verificación inválida.');
  if (challengeId.length !== 36 || !UUID_PATTERN.test(challengeId)) {
    throw new RangeError('Identificador de desafío inválido.');
  }
}

/** Secure generation; the caller must protect the code in transit and at rest. */
export function generateRegistrationCode(): string {
  return randomInt(1_000_000).toString().padStart(6, '0');
}

/**
 * A dedicated random key stays outside the database. The challenge ID binds
 * the verifier to one code issuance; a resend receives a new challenge ID.
 * This function does not store the code or configure the key.
 */
export function createRegistrationCodeVerifier(
  key: Uint8Array,
  challengeId: string,
  code: string,
): Uint8Array {
  assertKeyAndChallenge(key, challengeId);
  if (!isCode(code)) throw new RangeError('Formato de código inválido.');
  return createHmac('sha256', key)
    .update(DOMAIN)
    .update(challengeId.toLowerCase())
    .update('\0')
    .update(code)
    .digest();
}

/** Verification alone does not enforce expiry, attempts, locks or single use. */
export function verifyRegistrationCode(
  key: Uint8Array,
  challengeId: string,
  code: string,
  storedVerifier: Uint8Array,
): boolean {
  assertKeyAndChallenge(key, challengeId);
  if (storedVerifier.length !== VERIFIER_LENGTH) {
    throw new RangeError('Verificador almacenado inválido.');
  }
  if (!isCode(code)) return false;
  const computed = createRegistrationCodeVerifier(key, challengeId, code);
  return timingSafeEqual(computed, storedVerifier);
}
