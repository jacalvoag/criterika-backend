import { resolve } from 'node:path';
import { prepareRegistrationFile } from './operations/prepare-registration.js';

try {
  if (process.argv.length > 3)
    throw new Error('Usar registration:setup -- RUTA_ENV_OPCIONAL.');
  const result = prepareRegistrationFile(
    process.argv[2] ?? '.env',
    resolve('.env.example'),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  // Only the controlled diagnostics below may leave the process. Never print an fs/crypto error.
  const message = error instanceof Error ? error.message : '';
  const controlled =
    /^(Configuración inválida: [A-Z_]+\.|Las claves existentes deben ser independientes\.|JWT_PRIVATE_KEY_FILE [^\n]+\.|No se pudo conservar la configuración original\.|Usar registration:setup -- RUTA_ENV_OPCIONAL\.|Existe otra preparación o un bloqueo pendiente del registro\.)$/.test(
      message,
    );
  console.error(
    controlled ? message : 'No se pudo preparar la configuración del registro.',
  );
  process.exitCode = 1;
}
