import { validateEnvironment } from './environment.js';

const env = {
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_NAME: 'criterika_prueba',
  DB_USER: 'criterika_api_prueba',
  DB_PASSWORD: 'clave ficticia con espacios',
  DB_TLS_MODE: 'disable-local',
};

describe('Configuración de entorno', () => {
  it('conserva la contraseña literal y aplica límites predeterminados', () => {
    const settings = validateEnvironment(env);
    expect(settings.database.password).toBe(env.DB_PASSWORD);
    expect(settings.port).toBe(3000);
    expect(settings.database.port).toBe(5432);
    expect(settings.database.poolMax).toBe(10);
  });

  it('usa verificación TLS completa por defecto', () => {
    const settings = validateEnvironment({ ...env, DB_TLS_MODE: undefined });
    expect(settings.database.tlsMode).toBe('verify-full');
  });

  it.each([
    ['DB_PORT', '5432texto'],
    ['DB_PORT', '0'],
    ['PORT', '65536'],
    ['DB_POOL_MAX', '51'],
    ['DB_POOL_MAX', '1.5'],
    ['DB_TLS_MODE', 'require'],
    ['NODE_ENV', 'produccion'],
    ['DB_HOST', ''],
    ['DB_NAME', ''],
    ['DB_PASSWORD', ''],
  ])('rechaza %s inválida sin mostrar su valor', (key, value) => {
    expect(() => validateEnvironment({ ...env, [key]: value })).toThrow(key);
  });

  it('no permite una conexión remota en texto plano', () => {
    expect(() =>
      validateEnvironment({ ...env, DB_HOST: 'db.example.invalid' }),
    ).toThrow('DB_TLS_MODE');
  });

  it('no permite desactivar TLS en producción ni siquiera en loopback', () => {
    expect(() =>
      validateEnvironment({ ...env, NODE_ENV: 'production' }),
    ).toThrow('DB_TLS_MODE');
  });

  it('admite una CA para la conexión remota verificada', () => {
    const settings = validateEnvironment({
      ...env,
      DB_TLS_MODE: 'verify-full',
      DB_CA_FILE: 'certs/ca.pem',
    });
    expect(settings.database.caFile).toBe('certs/ca.pem');
  });

  it('rechaza una CA que quedaría ignorada al desactivar TLS', () => {
    expect(() =>
      validateEnvironment({ ...env, DB_CA_FILE: 'certs/ca.pem' }),
    ).toThrow('DB_CA_FILE');
  });

  it('los errores solo contienen nombres de variables', () => {
    const secret = 'dato_que_no_debe_aparecer';
    expect(() => validateEnvironment({ ...env, NODE_ENV: secret })).toThrow(
      'Configuración inválida: NODE_ENV.',
    );
  });
});
