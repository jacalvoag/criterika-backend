import { validateRegistrationLegalSelection } from './registration-selection.js';

const current = {
  termsVersionId: 'terms-v1',
  privacyVersionId: 'privacy-v1',
  purposes: [
    { code: 'cuenta', necessary: true },
    { code: 'aprendizaje', necessary: true },
    { code: 'opcional', necessary: false },
  ],
};

const selection = {
  termsVersionId: 'terms-v1',
  privacyVersionId: 'privacy-v1',
  purposeCodes: ['cuenta', 'aprendizaje'],
};

describe('validateRegistrationLegalSelection', () => {
  it('acepta las finalidades necesarias y permite finalidades opcionales declaradas', () => {
    expect(validateRegistrationLegalSelection(selection, current)).toEqual({
      ok: true,
    });
    expect(
      validateRegistrationLegalSelection(
        { ...selection, purposeCodes: [...selection.purposeCodes, 'opcional'] },
        current,
      ),
    ).toEqual({ ok: true });
  });

  it('rechaza la falta de documentos vigentes', () => {
    expect(validateRegistrationLegalSelection(selection, null)).toEqual({
      ok: false,
      reason: 'LEGAL_CONFIGURATION_MISSING',
    });
  });

  it('compara identificadores UUID sin distinguir mayúsculas', () => {
    expect(
      validateRegistrationLegalSelection(
        {
          ...selection,
          termsVersionId: 'ABCDEF12-3456-4000-8000-123456789ABC',
        },
        { ...current, termsVersionId: 'abcdef12-3456-4000-8000-123456789abc' },
      ),
    ).toEqual({ ok: true });
  });

  it.each(['termsVersionId', 'privacyVersionId'] as const)(
    'rechaza una versión %s distinta a la presentada',
    (field) => {
      expect(
        validateRegistrationLegalSelection(
          { ...selection, [field]: 'old' },
          current,
        ),
      ).toEqual({
        ok: false,
        reason: 'LEGAL_VERSION_OUTDATED',
      });
    },
  );

  it.each([
    [[]],
    [['cuenta']],
    [['cuenta', 'aprendizaje', 'cuenta']],
    [['cuenta', 'aprendizaje', 'desconocida']],
    [['cuenta', 'aprendizaje', 'NO_VALIDO']],
    [Array.from({ length: 31 }, (_, index) => `finalidad_${index}`)],
  ])('rechaza una selección de finalidades inválida: %j', (purposeCodes) => {
    expect(
      validateRegistrationLegalSelection(
        { ...selection, purposeCodes },
        current,
      ),
    ).toEqual({
      ok: false,
      reason: 'INVALID_PURPOSES',
    });
  });
});
