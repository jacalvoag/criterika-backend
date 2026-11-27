import { SmtpTransport } from '@nestjs/mail';
import { RegistrationEnvironmentCheck } from './registration-environment-check.js';
afterEach(() => vi.restoreAllMocks());
it('comprueba SMTP sin enviar correo y cierra el transporte cuando falla', async () => {
  const verify = vi
    .spyOn(SmtpTransport.prototype, 'verify')
    .mockRejectedValue(new Error('Credenciales o respuesta privada'));
  const close = vi.spyOn(SmtpTransport.prototype, 'close').mockResolvedValue();
  const send = vi.spyOn(SmtpTransport.prototype, 'send');
  const check = new RegistrationEnvironmentCheck(
    {
      getCurrentDocuments: async () => ({
        ok: false,
        reason: 'LEGAL_CONFIGURATION_MISSING',
      }),
    },
    { smtpUrl: 'smtp://localhost:2525' },
  );
  const result = await check.check();
  expect(result).toEqual({
    status: 'incomplete',
    database: 'ok',
    legalDocuments: 'LEGAL_CONFIGURATION_MISSING',
    smtp: 'SMTP_UNAVAILABLE',
  });
  expect(verify).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain('privada');
});
