import {
  calculateRegistrationIssuance,
  toRegistrationChallengeResponse,
} from './registration-issuance.js';

const id = 'abcdef12-3456-4000-8000-123456789abc';
const start = new Date('2026-11-23T12:00:00.000Z');

describe('emisión del código de registro', () => {
  it('calcula los plazos iniciales y proyecta la respuesta con el ID del registro', () => {
    const initial = calculateRegistrationIssuance(start);
    expect(initial.pendingExpiresAt.toISOString()).toBe(
      '2026-11-24T12:00:00.000Z',
    );
    expect(toRegistrationChallengeResponse(id, initial)).toEqual({
      id,
      expiraEn: '2026-11-23T12:10:00.000Z',
      reenvioDisponibleEn: '2026-11-23T12:01:00.000Z',
      vigenciaSegundos: 600,
      maximoIntentos: 5,
    });
  });

  it('recorta la vigencia del código reenviado al plazo original del trámite', () => {
    const pending = calculateRegistrationIssuance(start).pendingExpiresAt;
    const resend = calculateRegistrationIssuance(
      new Date('2026-11-24T11:56:00Z'),
      pending,
    );
    expect(resend.pendingExpiresAt).toEqual(pending);
    expect(resend.codeExpiresAt).toEqual(pending);
    expect(resend.resendAvailableAt.toISOString()).toBe(
      '2026-11-24T11:57:00.000Z',
    );
    expect(() => calculateRegistrationIssuance(pending, pending)).toThrow(
      RangeError,
    );
  });
});
