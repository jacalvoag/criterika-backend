import { checkRegistrationAge } from './registration-eligibility.js';

describe('checkRegistrationAge', () => {
  it('admite a partir del día que cumple 18 años', () => {
    expect(checkRegistrationAge('2008-11-23', '2026-11-22', 'MARCH_1')).toEqual(
      {
        ok: false,
        reason: 'UNDERAGE',
      },
    );
    expect(checkRegistrationAge('2008-11-23', '2026-11-23', 'MARCH_1')).toEqual(
      { ok: true },
    );
    expect(checkRegistrationAge('2008-11-23', '2027-01-01', 'MARCH_1')).toEqual(
      { ok: true },
    );
  });

  it.each([
    '2025-02-29',
    '2024-02-30',
    '2000-13-01',
    '0000-01-01',
    '2000-1-01',
    '2000-01-01\n',
    '2027-01-01',
  ])('rechaza una fecha de nacimiento inválida o futura: %s', (birthDate) => {
    expect(checkRegistrationAge(birthDate, '2026-11-23', 'MARCH_1')).toEqual({
      ok: false,
      reason: 'INVALID_BIRTH_DATE',
    });
  });

  it('exige una fecha válida del servidor', () => {
    expect(() =>
      checkRegistrationAge('2000-01-01', '2026-02-29', 'MARCH_1'),
    ).toThrow(RangeError);
  });

  it('permite que el integrador elija explícitamente la política para el 29 de febrero', () => {
    expect(
      checkRegistrationAge('2008-02-29', '2026-02-28', 'FEBRUARY_28'),
    ).toEqual({ ok: true });
    expect(checkRegistrationAge('2008-02-29', '2026-02-28', 'MARCH_1')).toEqual(
      {
        ok: false,
        reason: 'UNDERAGE',
      },
    );
    expect(checkRegistrationAge('2008-02-29', '2026-03-01', 'MARCH_1')).toEqual(
      { ok: true },
    );
  });
});
