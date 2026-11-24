import {
  createRegistrationCodeVerifier,
  generateRegistrationCode,
  verifyRegistrationCode,
} from './registration-code.js';

const key = Uint8Array.from({ length: 32 }, (_, index) => index);
const challengeId = 'a4c896b2-03c3-46d8-b29c-62e426b05b11';
const otherChallengeId = 'a4c896b2-03c3-46d8-b29c-62e426b05b12';

describe('verificador de código de registro', () => {
  it('genera códigos de seis dígitos', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(generateRegistrationCode()).toMatch(/^[0-9]{6}$/);
    }
  });

  it('genera el verificador HMAC esperado para una entrada conocida', () => {
    const stored = createRegistrationCodeVerifier(key, challengeId, '001234');
    expect(Buffer.from(stored).toString('hex')).toBe(
      '899e42c5bbca8f6ff722da9662c277b6e79f83607e23995287b2539bd7a04581',
    );
  });

  it('verifica el código exacto y rechaza otro o un formato inválido', () => {
    const stored = createRegistrationCodeVerifier(key, challengeId, '001234');
    expect(stored).toHaveLength(32);
    expect(verifyRegistrationCode(key, challengeId, '001234', stored)).toBe(
      true,
    );
    expect(verifyRegistrationCode(key, challengeId, '001235', stored)).toBe(
      false,
    );
    expect(verifyRegistrationCode(key, challengeId, '1234', stored)).toBe(
      false,
    );
    expect(verifyRegistrationCode(key, challengeId, '001234\n', stored)).toBe(
      false,
    );
  });

  it('vincula el código a la emisión y a la clave, sin distinguir mayúsculas del UUID', () => {
    const stored = createRegistrationCodeVerifier(key, challengeId, '001234');
    expect(
      verifyRegistrationCode(key, challengeId.toUpperCase(), '001234', stored),
    ).toBe(true);
    expect(
      verifyRegistrationCode(key, otherChallengeId, '001234', stored),
    ).toBe(false);
    expect(
      verifyRegistrationCode(new Uint8Array(32), challengeId, '001234', stored),
    ).toBe(false);
  });

  it('rechaza claves y estados internos inválidos sin exponer sus contenidos', () => {
    expect(() =>
      createRegistrationCodeVerifier(new Uint8Array(31), challengeId, '001234'),
    ).toThrow(RangeError);
    expect(() =>
      createRegistrationCodeVerifier(key, 'incorrecto', '001234'),
    ).toThrow(RangeError);
    expect(() =>
      createRegistrationCodeVerifier(key, challengeId, '001234\n'),
    ).toThrow(RangeError);
    expect(() =>
      verifyRegistrationCode(key, challengeId, '001234', new Uint8Array(31)),
    ).toThrow(RangeError);
  });
});
