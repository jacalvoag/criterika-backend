import { isRegistrationPasswordLengthValid } from './registration-password.js';

describe('isRegistrationPasswordLengthValid', () => {
  it('respeta los límites de 12 y 128 caracteres', () => {
    expect(isRegistrationPasswordLengthValid('a'.repeat(11))).toBe(false);
    expect(isRegistrationPasswordLengthValid('a'.repeat(12))).toBe(true);
    expect(isRegistrationPasswordLengthValid('a'.repeat(128))).toBe(true);
    expect(isRegistrationPasswordLengthValid('a'.repeat(129))).toBe(false);
  });

  it('cuenta caracteres Unicode fuera del plano básico como un carácter', () => {
    expect(isRegistrationPasswordLengthValid('🔐'.repeat(11))).toBe(false);
    expect(isRegistrationPasswordLengthValid('🔐'.repeat(12))).toBe(true);
    expect(isRegistrationPasswordLengthValid('🔐'.repeat(128))).toBe(true);
    expect(isRegistrationPasswordLengthValid('🔐'.repeat(129))).toBe(false);
  });

  it('permite espacios sin eliminarlos ni imponer reglas adicionales', () => {
    expect(isRegistrationPasswordLengthValid(' '.repeat(12))).toBe(true);
    expect(isRegistrationPasswordLengthValid(' contraseña ')).toBe(true);
  });
});
