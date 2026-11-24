import {
  canResendRegistrationCode,
  canVerifyRegistrationCode,
  isRegistrationCodeFormatValid,
  REGISTRATION_CODE_LIFETIME_MS,
  REGISTRATION_CODE_MAX_ATTEMPTS,
  REGISTRATION_PENDING_LIFETIME_MS,
  REGISTRATION_RESEND_INTERVAL_MS,
  type RegistrationChallengeState,
} from './registration-challenge.js';

const start = new Date('2026-11-23T12:00:00.000Z');
const after = (ms: number) => new Date(start.getTime() + ms);
const initial: RegistrationChallengeState = {
  pendingExpiresAt: after(REGISTRATION_PENDING_LIFETIME_MS),
  completed: false,
  codeExpiresAt: after(REGISTRATION_CODE_LIFETIME_MS),
  resendAvailableAt: after(REGISTRATION_RESEND_INTERVAL_MS),
  failedAttempts: 0,
  codeUsed: false,
};

describe('reglas de desafío de registro', () => {
  it('comprueba ambas ventanas de caducidad sin extender el pendiente', () => {
    expect(
      canVerifyRegistrationCode(
        initial,
        after(REGISTRATION_CODE_LIFETIME_MS - 1),
      ),
    ).toEqual({ ok: true });
    expect(
      canVerifyRegistrationCode(initial, after(REGISTRATION_CODE_LIFETIME_MS)),
    ).toEqual({ ok: false, reason: 'CODE_EXPIRED' });
    const renewed = {
      ...initial,
      codeExpiresAt: after(
        REGISTRATION_PENDING_LIFETIME_MS + REGISTRATION_CODE_LIFETIME_MS,
      ),
    };
    expect(
      canVerifyRegistrationCode(
        renewed,
        after(REGISTRATION_PENDING_LIFETIME_MS),
      ),
    ).toEqual({ ok: false, reason: 'REGISTRATION_EXPIRED' });
    expect(
      canResendRegistrationCode(
        renewed,
        after(REGISTRATION_PENDING_LIFETIME_MS),
      ),
    ).toEqual({ ok: false, reason: 'REGISTRATION_EXPIRED' });
  });

  it('permite verificar hasta el quinto intento y bloquea después del quinto fallo', () => {
    expect(
      canVerifyRegistrationCode({ ...initial, failedAttempts: 4 }, start),
    ).toEqual({ ok: true });
    expect(
      canVerifyRegistrationCode(
        { ...initial, failedAttempts: REGISTRATION_CODE_MAX_ATTEMPTS },
        start,
      ),
    ).toEqual({ ok: false, reason: 'ATTEMPTS_EXHAUSTED' });
  });

  it('permite reenviar a los 60 segundos, incluso si el código anterior expiró o agotó intentos', () => {
    expect(
      canResendRegistrationCode(
        initial,
        after(REGISTRATION_RESEND_INTERVAL_MS - 1),
      ),
    ).toEqual({ ok: false, reason: 'RESEND_NOT_YET_AVAILABLE' });
    expect(
      canResendRegistrationCode(
        { ...initial, failedAttempts: 5 },
        after(REGISTRATION_RESEND_INTERVAL_MS),
      ),
    ).toEqual({ ok: true });
    expect(
      canResendRegistrationCode(initial, after(REGISTRATION_CODE_LIFETIME_MS)),
    ).toEqual({ ok: true });
  });

  it('impide verificar o reenviar un registro completado o código consumido', () => {
    for (const check of [
      canVerifyRegistrationCode,
      canResendRegistrationCode,
    ]) {
      expect(check({ ...initial, completed: true }, after(60_000))).toEqual({
        ok: false,
        reason: 'REGISTRATION_COMPLETED',
      });
      expect(check({ ...initial, codeUsed: true }, after(60_000))).toEqual({
        ok: false,
        reason: 'CODE_USED',
      });
    }
  });

  it('rechaza estados internos imposibles en vez de tratarlos como códigos utilizables', () => {
    expect(() =>
      canVerifyRegistrationCode({ ...initial, failedAttempts: 6 }, start),
    ).toThrow(RangeError);
    expect(() =>
      canVerifyRegistrationCode(initial, new Date('invalid')),
    ).toThrow(RangeError);
  });

  it.each(['000000', '123456'])(
    'acepta el formato de seis dígitos %s',
    (code) => {
      expect(isRegistrationCodeFormatValid(code)).toBe(true);
    },
  );

  it.each([
    '12345',
    '1234567',
    '12345a',
    '１２３４５６',
    ' 123456',
    '123456\n',
  ])('rechaza el formato de código %j', (code) =>
    expect(isRegistrationCodeFormatValid(code)).toBe(false),
  );
});
