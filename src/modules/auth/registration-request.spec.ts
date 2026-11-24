import {
  parseRegistrationCodeInput,
  parseRegistrationId,
  parseRegistrationIdempotencyKey,
} from './registration-request.js';

const uuid = 'ABCDEF12-3456-4000-8000-123456789ABC';

describe('entrada para verificar o reenviar el registro', () => {
  it('normaliza los UUID de ruta y de idempotencia', () => {
    const result = { ok: true, value: uuid.toLowerCase() };
    expect(parseRegistrationId(uuid)).toEqual(result);
    expect(parseRegistrationIdempotencyKey(uuid)).toEqual(result);
  });

  it('distingue la clave ausente de la clave inválida o duplicada', () => {
    expect(parseRegistrationIdempotencyKey(undefined)).toEqual({
      ok: false,
      reason: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    for (const invalid of ['', [uuid, uuid], `${uuid}, ${uuid}`, uuid + '\n']) {
      expect(parseRegistrationIdempotencyKey(invalid)).toEqual({
        ok: false,
        reason: 'INVALID_REQUEST',
      });
    }
    expect(parseRegistrationId('not-an-id')).toEqual({
      ok: false,
      reason: 'INVALID_REQUEST',
    });
  });

  it('conserva los ceros iniciales y rechaza códigos numéricos o campos extra', () => {
    expect(parseRegistrationCodeInput({ codigo: '001234' })).toEqual({
      ok: true,
      value: '001234',
    });
    for (const invalid of [
      { codigo: 1234 },
      { codigo: '001234', intentos: 0 },
      {},
      null,
    ]) {
      expect(parseRegistrationCodeInput(invalid)).toEqual({
        ok: false,
        reason: 'VALIDATION_FAILED',
      });
    }
  });
});
