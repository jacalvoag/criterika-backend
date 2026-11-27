import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createPrivateKey } from 'node:crypto';
import {
  prepareRegistrationFile,
  REGISTRATION_SECRET_NAMES,
} from './prepare-registration.js';
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'criterika-setup-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const present = (value: string | undefined): string => {
  if (value === undefined) throw new Error('Configuración ficticia ausente');
  return value;
};
const template = () => {
  const p = join(dir, 'example');
  writeFileSync(
    p,
    '# Original\nDB_HOST=original\nDB_PASSWORD="clave ficticia # intacta"\nSMTP_URL=\n',
  );
  return p;
};
it('prepara claves privadas sin imprimirlas ni alterar la conexión existente', () => {
  const p = join(dir, '.env'),
    t = template();
  const r = prepareRegistrationFile(p, t),
    v = parseEnv(readFileSync(p, 'utf8'));
  expect(v.DB_HOST).toBe('original');
  expect(v.DB_PASSWORD).toBe('clave ficticia # intacta');
  expect(new Set(REGISTRATION_SECRET_NAMES.map((n) => v[n])).size).toBe(4);
  for (const n of REGISTRATION_SECRET_NAMES) {
    expect(Buffer.from(present(v[n]), 'base64')).toHaveLength(32);
    expect(JSON.stringify(r)).not.toContain(v[n]);
  }
  expect(
    createPrivateKey(readFileSync(present(v.JWT_PRIVATE_KEY_FILE)))
      .asymmetricKeyType,
  ).toBe('rsa');
  expect(r.remainingConfiguration).toContain('SMTP_URL');
});
it('repetir la preparación conserva exactamente las claves y el archivo', () => {
  const p = join(dir, '.env'),
    t = template();
  prepareRegistrationFile(p, t);
  const first = readFileSync(p, 'utf8');
  const key = present(parseEnv(first).JWT_PRIVATE_KEY_FILE);
  const before = readFileSync(key, 'utf8');
  expect(prepareRegistrationFile(p, t)).toMatchObject({
    generatedVariables: [],
    keyCreated: false,
  });
  expect(readFileSync(p, 'utf8')).toBe(first);
  expect(readFileSync(key, 'utf8')).toBe(before);
});
it('no reemplaza una clave existente inválida o una ruta de firma perdida', () => {
  const p = join(dir, '.env'),
    t = template();
  writeFileSync(p, 'IDEMPOTENCY_HMAC_KEY_BASE64=NO_MOSTRAR\n');
  expect(() => prepareRegistrationFile(p, t)).toThrow(
    'Configuración inválida: IDEMPOTENCY_HMAC_KEY_BASE64.',
  );
  expect(readFileSync(p, 'utf8')).toContain('NO_MOSTRAR');
  expect(existsSync(join(dir, '.secrets'))).toBe(false);
  writeFileSync(p, 'JWT_PRIVATE_KEY_FILE="' + join(dir, 'missing.pem') + '"\n');
  expect(() => prepareRegistrationFile(p, t)).toThrow('no se reemplazó');
});
it('rechaza claves reutilizadas sin reescribir el archivo', () => {
  const p = join(dir, '.env'),
    t = template(),
    v = Buffer.alloc(32, 1).toString('base64');
  writeFileSync(
    p,
    `IDEMPOTENCY_HMAC_KEY_BASE64=${v}\nIDEMPOTENCY_ENCRYPTION_KEY_BASE64=${v}\n`,
  );
  const before = readFileSync(p, 'utf8');
  expect(() => prepareRegistrationFile(p, t)).toThrow('independientes');
  expect(readFileSync(p, 'utf8')).toBe(before);
});
it('no prepara secretos mientras otra ejecución mantiene el bloqueo', () => {
  const p = join(dir, '.env'),
    t = template();
  writeFileSync(p + '.setup.lock', '');
  expect(() => prepareRegistrationFile(p, t)).toThrow(
    'Existe otra preparación',
  );
  expect(existsSync(p)).toBe(false);
});
