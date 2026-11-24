/**
 * RegistrationInput uses JSON Schema string lengths: count Unicode code
 * points, not UTF-16 code units. Never transform, truncate or return the secret.
 * The caller must hash the original string with Argon2id before persistence.
 */
export function isRegistrationPasswordLengthValid(password: string): boolean {
  let length = 0;
  for (const _codePoint of password) length += 1;
  return length >= 12 && length <= 128;
}
