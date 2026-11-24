import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registrationSettings } from './registration-settings.js';
const dir = mkdtempSync(join(tmpdir(), 'criterika-registration-config-'));
const path = join(dir, 'fake.pem');
writeFileSync(path, 'FICTICIO_SOLO_VALIDACION_CONFIG');
const env = {
  IDEMPOTENCY_HMAC_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
  IDEMPOTENCY_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 2).toString('base64'),
  REGISTRATION_CODE_HMAC_KEY_BASE64: Buffer.alloc(32, 3).toString('base64'),
  REGISTRATION_MAIL_KEY_BASE64: Buffer.alloc(32, 4).toString('base64'),
  JWT_PRIVATE_KEY_FILE: path,
  JWT_ISSUER: 'test',
  JWT_AUDIENCE: 'test',
  JWT_KEY_ID: 'v1',
  SMTP_URL: 'smtp://localhost:2525',
  MAIL_FROM: 'test@example.invalid',
};
afterAll(() => rmSync(dir, { recursive: true, force: true }));
it('valida claves independientes y deja privacidad ausente para responder 503', () => {
  const s = registrationSettings(env);
  expect(s.privacy.responsibleName).toBe('');
  expect(s.registrationTimeZone).toBe('Etc/UTC');
  expect(s.leapDayAnniversary).toBe('FEBRUARY_28');
});
it.each([
  'IDEMPOTENCY_HMAC_KEY_BASE64',
  'IDEMPOTENCY_ENCRYPTION_KEY_BASE64',
  'REGISTRATION_CODE_HMAC_KEY_BASE64',
  'REGISTRATION_MAIL_KEY_BASE64',
])('rechaza %s faltante o inválida sin mostrar valores', (name) => {
  const value = 'NO_MOSTRAR_ESTE_SECRETO';
  expect(() => registrationSettings({ ...env, [name]: value })).toThrow(
    `Configuración inválida: ${name}.`,
  );
});
it('rechaza reutilización de claves y rutas privadas inexistentes', () => {
  expect(() =>
    registrationSettings({
      ...env,
      REGISTRATION_MAIL_KEY_BASE64: env.REGISTRATION_CODE_HMAC_KEY_BASE64,
    }),
  ).toThrow('Se requieren claves independientes');
  expect(() =>
    registrationSettings({
      ...env,
      JWT_PRIVATE_KEY_FILE: join(dir, 'missing'),
    }),
  ).toThrow('JWT_PRIVATE_KEY_FILE');
});
it.each([
  'https://mail.example.invalid',
  'smtp://localhost:2525/?secret=NO_MOSTRAR',
  'smtp://localhost:2525/#NO_MOSTRAR',
])('rechaza URL de correo no admitida sin mostrarla', (url) => {
  expect(() => registrationSettings({ ...env, SMTP_URL: url })).toThrow(
    'Configuración inválida: SMTP_URL.',
  );
});
