import { generateKeyPairSync, verify } from 'node:crypto';
import {
  RegistrationPasswords,
  RegistrationJwtSigner,
  RegistrationMailProtection,
} from './registration-crypto.js';
import { ProtectedPayloadCipher } from '../../database/protected-payload.js';

it('produce Argon2id PHC con salts aleatorios y verifica el secreto literal', async () => {
  const passwords = new RegistrationPasswords();
  const secret = '  contraseña Unicode 🔐  ';
  const a = await passwords.hash(secret),
    b = await passwords.hash(secret);
  expect(a).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  expect(a).not.toBe(b);
  expect(await passwords.verify(secret, a)).toBe(true);
  expect(await passwords.verify(secret.trim(), a)).toBe(false);
  expect(await passwords.verify(secret, '$argon2id$inválido')).toBe(false);
  await expect(passwords.hash('corta')).rejects.toThrow();
});
it('firma JWT RSA con emisor, audiencia, sesión y caducidad exacta', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const s = new RegistrationJwtSigner(
    rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    'issuer',
    'audience',
    'v1',
  );
  const at = new Date('2026-11-23T00:00:00Z');
  const token = s.signPlayerAccess({
    accountId: 'account',
    sessionId: 'session',
    issuedAt: at,
    expiresInSeconds: 900,
  });
  const [header, body, signature] = token.split('.');
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
    alg: 'RS256',
    typ: 'JWT',
    kid: 'v1',
  });
  expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toMatchObject({
    iss: 'issuer',
    aud: 'audience',
    sub: 'account',
    sid: 'session',
    rol: 'JUGADOR',
    exp: 1795392900,
  });
  expect(
    verify(
      'RSA-SHA256',
      Buffer.from(header + '.' + body),
      s.publicKey,
      Buffer.from(signature, 'base64url'),
    ),
  ).toBe(true);
});
it('rechaza una clave de firma inválida sin exponerla', () => {
  const value = 'material de prueba que no debe aparecer';
  expect(() => new RegistrationJwtSigner(value, 'i', 'a', 'v')).toThrow(
    'Configuración de firma JWT inválida.',
  );
});
it('el cifrado vincula cada mensaje a su desafío y detecta alteraciones', () => {
  const p = new RegistrationMailProtection(
    Buffer.alloc(32, 1),
    Buffer.alloc(32, 2),
  );
  const payload = {
    challengeId: 'challenge',
    destinationEmail: 'ana@example.invalid',
    code: '001234',
    expiresAt: new Date('2026-11-23T00:10:00Z'),
  };
  const b = p.protectMail(payload);
  expect(p.recoverMail('challenge', b)).toEqual(payload);
  expect(() => p.recoverMail('other', b)).toThrow(
    'Mensaje de registro no recuperable.',
  );
  const broken = Buffer.from(b);
  broken[broken.length - 1] ^= 1;
  expect(() => p.recoverMail('challenge', broken)).toThrow();
  expect(() => new ProtectedPayloadCipher(Buffer.alloc(31))).toThrow();
});
