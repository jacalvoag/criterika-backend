import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  chmodSync,
  openSync,
  closeSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { parseEnv } from 'node:util';

export const REGISTRATION_SECRET_NAMES = [
  'IDEMPOTENCY_HMAC_KEY_BASE64',
  'IDEMPOTENCY_ENCRYPTION_KEY_BASE64',
  'REGISTRATION_CODE_HMAC_KEY_BASE64',
  'REGISTRATION_MAIL_KEY_BASE64',
] as const;
const operationalNames = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'SMTP_URL',
  'MAIL_FROM',
  'PRIVACY_RESPONSIBLE_NAME',
  'PRIVACY_CONTACT_EMAIL',
  'PRIVACY_POSTAL_ADDRESS',
] as const;

/** One local initialization, never rotation. Existing secrets and unrelated settings are preserved. */
function prepareRegistration(envFile: string, templateFile: string) {
  const destination = resolve(envFile);
  const original = readFileSync(
    existsSync(destination) ? destination : templateFile,
    'utf8',
  );
  const values = parseEnv(original);
  const generated: Record<string, string> = {};
  const decoded: Buffer[] = [];
  for (const name of REGISTRATION_SECRET_NAMES) {
    const value = values[name];
    if (value?.trim()) {
      const bytes = Buffer.from(value, 'base64');
      if (bytes.length !== 32 || bytes.toString('base64') !== value)
        throw new Error(`Configuración inválida: ${name}.`);
      decoded.push(bytes);
    } else {
      generated[name] = randomBytes(32).toString('base64');
      decoded.push(Buffer.from(generated[name], 'base64'));
    }
  }
  if (new Set(decoded.map((v) => v.toString('hex'))).size !== 4)
    throw new Error('Las claves existentes deben ser independientes.');
  const keyPath = values.JWT_PRIVATE_KEY_FILE?.trim()
    ? resolve(values.JWT_PRIVATE_KEY_FILE)
    : join(dirname(destination), '.secrets', 'criterika-jwt-private.pem');
  if (values.JWT_PRIVATE_KEY_FILE?.trim() && !existsSync(keyPath))
    throw new Error(
      'JWT_PRIVATE_KEY_FILE no existe; no se reemplazó su clave.',
    );
  let keyCreated = false;
  if (!existsSync(keyPath)) {
    mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    writeFileSync(
      keyPath,
      pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      { mode: 0o600, flag: 'wx' },
    );
    keyCreated = true;
  }
  try {
    const key = createPrivateKey(readFileSync(keyPath));
    if (
      key.asymmetricKeyType !== 'rsa' ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    )
      throw new Error();
    // Export only if absent; another existing public key is never silently replaced.
    const publicPath = join(dirname(keyPath), 'criterika-jwt-public.pem');
    const publicPem = createPublicKey(key)
      .export({ type: 'spki', format: 'pem' })
      .toString();
    if (
      (keyCreated || !values.JWT_PRIVATE_KEY_FILE?.trim()) &&
      !existsSync(publicPath)
    )
      writeFileSync(publicPath, publicPem, { mode: 0o600, flag: 'wx' });
  } catch {
    throw new Error(
      'JWT_PRIVATE_KEY_FILE no contiene una clave RSA privada válida.',
    );
  }
  if (!values.JWT_PRIVATE_KEY_FILE?.trim())
    generated.JWT_PRIVATE_KEY_FILE = keyPath.replaceAll('\\', '/');
  for (const [name, value] of Object.entries({
    JWT_ISSUER: 'criterika-api',
    JWT_AUDIENCE: 'criterika-player',
    JWT_KEY_ID: 'player-v1',
  })) {
    if (!values[name]?.trim()) generated[name] = value;
  }
  let updated = original;
  for (const [name, value] of Object.entries(generated)) {
    const assignment = `${name}=${JSON.stringify(value)}`;
    const pattern = new RegExp(
      `^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=.*$`,
      'm',
    );
    updated = pattern.test(updated)
      ? updated.replace(pattern, () => assignment)
      : updated.replace(/\n?$/, '\n') + assignment + '\n';
  }
  const parsed = parseEnv(updated);
  for (const [name, value] of Object.entries({ ...values, ...generated }))
    if (parsed[name] !== value)
      throw new Error('No se pudo conservar la configuración original.');
  if (updated !== original || !existsSync(destination)) {
    mkdirSync(dirname(destination), { recursive: true });
    const temporary = destination + '.tmp-' + randomUUID();
    try {
      writeFileSync(temporary, updated, { flag: 'wx', mode: 0o600 });
      renameSync(temporary, destination);
      chmodSync(destination, 0o600);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  return {
    status: 'ok' as const,
    generatedVariables: Object.keys(generated),
    keyCreated,
    remainingConfiguration: operationalNames.filter(
      (name) => !parsed[name]?.trim() || parsed[name].startsWith('CAMBIAR_'),
    ),
  };
}

/** Serialize setup so concurrent invocations cannot rotate an initially empty configuration. */
export function prepareRegistrationFile(envFile: string, templateFile: string) {
  const lock = resolve(envFile) + '.setup.lock';
  mkdirSync(dirname(lock), { recursive: true });
  let fd: number;
  try {
    fd = openSync(lock, 'wx', 0o600);
  } catch {
    throw new Error(
      'Existe otra preparación o un bloqueo pendiente del registro.',
    );
  }
  try {
    return prepareRegistration(envFile, templateFile);
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
}
