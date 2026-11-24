import { readFileSync } from 'node:fs';

/** Validated only when registration dependencies are activated. Never echoes values. */
export function registrationSettings(env: Record<string, unknown>) {
  const required = (name: string): string => {
    const v = env[name];
    if (typeof v !== 'string' || v.trim() === '')
      throw new Error(`Configuración inválida: ${name}.`);
    return v;
  };
  const key = (name: string): Buffer => {
    const s = required(name);
    const b = Buffer.from(s, 'base64');
    if (
      !/^[A-Za-z0-9+/]{43}=$/.test(s) ||
      b.length !== 32 ||
      b.toString('base64') !== s
    )
      throw new Error(`Configuración inválida: ${name}.`);
    return b;
  };
  const optionalText = (name: string) =>
    typeof env[name] === 'string' ? env[name].trim() : '';
  const keys = {
    idempotencyHmac: key('IDEMPOTENCY_HMAC_KEY_BASE64'),
    idempotencyEncryption: key('IDEMPOTENCY_ENCRYPTION_KEY_BASE64'),
    codeVerifier: key('REGISTRATION_CODE_HMAC_KEY_BASE64'),
    mailEncryption: key('REGISTRATION_MAIL_KEY_BASE64'),
  };
  if (new Set(Object.values(keys).map((k) => k.toString('hex'))).size !== 4)
    throw new Error('Se requieren claves independientes para registro.');
  let jwtPrivateKey: string;
  try {
    jwtPrivateKey = readFileSync(required('JWT_PRIVATE_KEY_FILE'), 'utf8');
  } catch {
    throw new Error('Configuración inválida: JWT_PRIVATE_KEY_FILE.');
  }
  const smtp = required('SMTP_URL');
  let u: URL;
  try {
    u = new URL(smtp);
  } catch {
    throw new Error('Configuración inválida: SMTP_URL.');
  }
  if (
    !['smtp:', 'smtps:'].includes(u.protocol) ||
    u.search ||
    u.hash ||
    u.hostname === '' ||
    u.pathname !== ''
  )
    throw new Error('Configuración inválida: SMTP_URL.');
  const from = required('MAIL_FROM');
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/.test(from))
    throw new Error('Configuración inválida: MAIL_FROM.');
  return {
    ...keys,
    jwtPrivateKey,
    jwtIssuer: required('JWT_ISSUER'),
    jwtAudience: required('JWT_AUDIENCE'),
    jwtKeyId: required('JWT_KEY_ID'),
    smtpUrl: smtp,
    mailFrom: from,
    privacy: {
      responsibleName: optionalText('PRIVACY_RESPONSIBLE_NAME'),
      contactEmail: optionalText('PRIVACY_CONTACT_EMAIL'),
      postalAddress: optionalText('PRIVACY_POSTAL_ADDRESS'),
    },
    registrationTimeZone: 'Etc/UTC' as const,
    leapDayAnniversary: 'FEBRUARY_28' as const,
  };
}
export type RegistrationSettings = ReturnType<typeof registrationSettings>;
