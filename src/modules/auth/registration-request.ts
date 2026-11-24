import { isRegistrationCodeFormatValid } from './registration-challenge.js';

type RequestValidation<T, Reason extends string> =
  { ok: true; value: T } | { ok: false; reason: Reason };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuid.test(value);
}

export function parseRegistrationIdempotencyKey(
  value: unknown,
): RequestValidation<string, 'IDEMPOTENCY_KEY_REQUIRED' | 'INVALID_REQUEST'> {
  if (value === undefined)
    return { ok: false, reason: 'IDEMPOTENCY_KEY_REQUIRED' };
  return isUuid(value)
    ? { ok: true, value: value.toLowerCase() }
    : { ok: false, reason: 'INVALID_REQUEST' };
}

export function parseRegistrationId(
  value: unknown,
): RequestValidation<string, 'INVALID_REQUEST'> {
  return isUuid(value)
    ? { ok: true, value: value.toLowerCase() }
    : { ok: false, reason: 'INVALID_REQUEST' };
}

export function parseRegistrationCodeInput(
  input: unknown,
): RequestValidation<string, 'VALIDATION_FAILED'> {
  if (
    input !== null &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    Object.keys(input).length === 1 &&
    Object.hasOwn(input, 'codigo')
  ) {
    const code = (input as { codigo: unknown }).codigo;
    if (typeof code === 'string' && isRegistrationCodeFormatValid(code)) {
      return { ok: true, value: code };
    }
  }
  return { ok: false, reason: 'VALIDATION_FAILED' };
}
