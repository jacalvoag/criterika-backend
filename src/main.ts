import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { APPLICATION_SETTINGS } from './config/application-config.module.js';
import type { ApplicationSettings } from './config/environment.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.enableShutdownHooks();
  try {
    const settings = app.get<ApplicationSettings>(APPLICATION_SETTINGS);
    await app.listen(settings.port);
  } catch (error) {
    await app.close();
    throw error;
  }
}
try {
  await bootstrap();
} catch {
  console.error(
    'No se pudo iniciar Criterika. Revisar configuración y conectividad PostgreSQL.',
  );
  process.exitCode = 1;
}
