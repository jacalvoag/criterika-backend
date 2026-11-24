import {
  parseRegistrationInput,
  parseRegistrationInputAt,
} from './registration-input.js';

const policy = {
  serverDate: '2026-02-28',
  leapDayAnniversary: 'FEBRUARY_28',
} as const;
const body = {
  nombre: ' Ana ',
  apellidos: 'Pérez',
  fechaNacimiento: '2008-02-29',
  correo: ' A.B+Escuela@Example.COM ',
  contrasena: ' prueba Unicode 🔐 ',
  aceptacion: {
    terminosVersionId: 'ABCDEF12-3456-4000-8000-123456789ABC',
    avisoVersionId: 'abcdef12-3456-4000-8000-123456789abd',
    aceptaTerminos: true,
    reconoceAvisoPresentado: true,
    consienteFinalidadesIds: ['cuenta'],
  },
};

describe('parseRegistrationInput', () => {
  it('usa la fecha UTC del servidor y el 28 de febrero para nacidos en día bisiesto', () => {
    const beforeUtcBirthday = new Date('2026-02-27T23:59:59.999Z');
    const onUtcBirthday = new Date('2026-02-28T00:00:00.000Z');
    expect(parseRegistrationInputAt(body, beforeUtcBirthday)).toEqual({
      ok: false,
      reason: 'UNDERAGE',
    });
    expect(parseRegistrationInputAt(body, onUtcBirthday)).toMatchObject({
      ok: true,
    });
    expect(() => parseRegistrationInputAt(body, new Date('invalid'))).toThrow(
      RangeError,
    );
  });
  it('aplica la política de edad y normaliza sin cambiar la contraseña', () => {
    expect(parseRegistrationInput(body, policy)).toEqual({
      ok: true,
      value: {
        name: 'Ana',
        surnames: 'Pérez',
        birthDate: '2008-02-29',
        normalizedEmail: 'a.b+escuela@example.com',
        password: body.contrasena,
        legalSelection: {
          termsVersionId: body.aceptacion.terminosVersionId.toLowerCase(),
          privacyVersionId: body.aceptacion.avisoVersionId,
          purposeCodes: ['cuenta'],
        },
      },
    });
  });

  it.each([
    [{ ...body, role: 'ADMINISTRADOR' }, 'INVALID_BODY'],
    [{ ...body, apellidos: '  ' }, 'INVALID_SURNAMES'],
    [{ ...body, nombre: 'a'.repeat(121) }, 'INVALID_NAME'],
    [{ ...body, fechaNacimiento: '2008-02-30' }, 'INVALID_BIRTH_DATE'],
    [{ ...body, fechaNacimiento: '2008-03-01' }, 'UNDERAGE'],
    [{ ...body, correo: 'a..b@example.com' }, 'INVALID_EMAIL'],
    [{ ...body, correo: 'a@example-.com' }, 'INVALID_EMAIL'],
    [{ ...body, correo: 'Ana <ana@example.com>' }, 'INVALID_EMAIL'],
    [{ ...body, contrasena: 'secreto' }, 'INVALID_PASSWORD'],
    [
      { ...body, aceptacion: { ...body.aceptacion, aceptaTerminos: false } },
      'INVALID_ACCEPTANCE',
    ],
  ])(
    'rechaza la entrada inválida (caso %#) sin repetir sus datos',
    (input, reason) => {
      expect(parseRegistrationInput(input, policy)).toEqual({
        ok: false,
        reason,
      });
    },
  );
});
