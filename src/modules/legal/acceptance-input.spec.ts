import { parseAcceptanceInput } from './acceptance-input.js';

const valid = {
  terminosVersionId: '00000000-0000-4000-8000-000000000010',
  avisoVersionId: '00000000-0000-4000-8000-000000000011',
  aceptaTerminos: true,
  reconoceAvisoPresentado: true,
  consienteFinalidadesIds: ['cuenta', 'aprendizaje'],
};

describe('parseAcceptanceInput', () => {
  it('acepta el formato del contrato y no conserva referencias al arreglo recibido', () => {
    const result = parseAcceptanceInput(valid);
    expect(result).toEqual({ ok: true, value: valid });
    if (result.ok)
      expect(result.value.consienteFinalidadesIds).not.toBe(
        valid.consienteFinalidadesIds,
      );
  });

  it.each([
    null,
    [],
    {},
    { ...valid, extra: true },
    { ...valid, terminosVersionId: 'no-es-uuid' },
    { ...valid, avisoVersionId: valid.avisoVersionId + '\n' },
    { ...valid, aceptaTerminos: false },
    { ...valid, reconoceAvisoPresentado: false },
    { ...valid, consienteFinalidadesIds: [] },
    { ...valid, consienteFinalidadesIds: ['cuenta', 'cuenta'] },
    { ...valid, consienteFinalidadesIds: ['cuenta\n'] },
    { ...valid, consienteFinalidadesIds: ['ab'] },
    { ...valid, consienteFinalidadesIds: [42] },
    {
      ...valid,
      consienteFinalidadesIds: Array.from(
        { length: 31 },
        (_, i) => `finalidad_${i}`,
      ),
    },
  ])('rechaza una aceptación que no cumple el esquema', (input) => {
    expect(parseAcceptanceInput(input)).toEqual({
      ok: false,
      reason: 'INVALID_ACCEPTANCE',
    });
  });
});
