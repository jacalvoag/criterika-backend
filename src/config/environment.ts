export interface DatabaseSettings {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  tlsMode: 'verify-full' | 'disable-local';
  caFile?: string;
  poolMax: number;
}

export interface ApplicationSettings {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  database: DatabaseSettings;
}

export function validateEnvironment(
  env: Record<string, unknown>,
): ApplicationSettings {
  const invalid = new Set<string>();
  const text = (key: string, fallback?: string): string => {
    const value = env[key] ?? fallback;
    if (typeof value !== 'string' || value.trim() === '') {
      invalid.add(key);
      return '';
    }
    return value.trim();
  };
  const integer = (
    key: string,
    fallback: string,
    min: number,
    max: number,
  ): number => {
    const value = text(key, fallback);
    const number = Number(value);
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(number) ||
      number < min ||
      number > max
    ) {
      invalid.add(key);
    }
    return number;
  };

  const nodeEnv = text('NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    invalid.add('NODE_ENV');
  }
  const tlsMode = text('DB_TLS_MODE', 'verify-full');
  if (!['verify-full', 'disable-local'].includes(tlsMode)) {
    invalid.add('DB_TLS_MODE');
  }
  const host = text('DB_HOST');
  if (
    tlsMode === 'disable-local' &&
    (nodeEnv === 'production' ||
      !['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase()))
  ) {
    invalid.add('DB_TLS_MODE');
  }
  const ca = env['DB_CA_FILE'];
  if (ca !== undefined && typeof ca !== 'string') invalid.add('DB_CA_FILE');
  const caFile = typeof ca === 'string' ? ca.trim() || undefined : undefined;
  if (caFile && tlsMode !== 'verify-full') invalid.add('DB_CA_FILE');
  const password = env['DB_PASSWORD'];
  if (typeof password !== 'string' || password.length === 0) {
    invalid.add('DB_PASSWORD');
  }

  const settings: ApplicationSettings = {
    nodeEnv: nodeEnv as ApplicationSettings['nodeEnv'],
    port: integer('PORT', '3000', 1, 65535),
    database: {
      host,
      port: integer('DB_PORT', '5432', 1, 65535),
      name: text('DB_NAME'),
      user: text('DB_USER'),
      password: typeof password === 'string' ? password : '',
      tlsMode: tlsMode as DatabaseSettings['tlsMode'],
      caFile,
      poolMax: integer('DB_POOL_MAX', '10', 1, 50),
    },
  };
  if (invalid.size) {
    // Solo nombres: nunca incluir valores del entorno ni credenciales.
    throw new Error(
      `Configuración inválida: ${[...invalid].sort().join(', ')}.`,
    );
  }
  return settings;
}
