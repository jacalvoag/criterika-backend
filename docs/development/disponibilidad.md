# Disponibilidad pública

`GET /api/v1/health` implementa `getHealth` del contrato 1.0.2. Es público y devuelve exactamente `estado: "OK"` y `fechaServidor` en UTC cuando PostgreSQL acepta una comprobación actual de versión, esquema, rol y TLS. No usa el resultado del arranque como prueba de disponibilidad posterior.

Si la comprobación falla, devuelve `503`, código `SERVICE_UNAVAILABLE`, `Retry-After: 5` y cuerpo `application/problem+json`. Un error inesperado devuelve `500 / INTERNAL_ERROR`. Todas estas respuestas, incluidas las limitadas, llevan `Cache-Control: no-store` y un `X-Request-Id` generado por el servidor, que coincide con `requestId` en los errores. No incluye host, versión, certificados, SQL ni mensajes de excepciones.

Se mantiene el pool y los límites de conexión/consulta existentes: adquisición de conexión de hasta 5 segundos, timeout del servidor de 10 segundos y timeout de consulta del cliente de 12 segundos. Las peticiones simultáneas comparten una comprobación en curso; al terminarla, la siguiente petición vuelve a consultar. El cierre deja el servicio no disponible sin iniciar nuevas consultas.

## Límites y despliegue

Usa el paquete `@nestjs/throttler` ya instalado: 60 consultas por minuto por dirección y 500 por minuto para esta ruta, antes de consultar PostgreSQL. El mapa admite hasta 10 000 claves activas; rechaza nuevas claves al llenarse. Una respuesta limitada es `429 / RATE_LIMITED`, con `Retry-After: 60`.

Los contadores requieren una instancia HTTP con un proceso, igual que la configuración actual del registro. Las cabeceras de IP reenviada no se aceptan como identidad del cliente sin configurar un proxy de confianza. El indicador comprueba disponibilidad de dependencias: no configurarlo como señal para reiniciar el proceso por una caída de PostgreSQL, ya que reiniciar la API no repara la base.

Se revisó [Terminus de NestJS](https://docs.nestjs.com/recipes/terminus). Para este contrato mínimo y el cliente `pg` existente se reutiliza la comprobación PostgreSQL del proyecto, sin incorporar otro paquete ni publicar diagnósticos detallados. No agrega autenticación, mantenimiento administrativo ni migraciones.

## Validación: 2026-11-27

- Build, TypeScript estricto y lint correctos.
- 613 pruebas unitarias correctas en la rama `feat/jose-health`, basada en `develop` tras la PR #22.
- 13 pruebas HTTP correctas y una prueba PostgreSQL omitida por activación explícita en la suite ordinaria.
- Prueba HTTP con PostgreSQL 18.6 local desechable activada y correcta: disponibilidad pública y flujo de registro con login de aplicación.
- Casos añadidos: contrato 200, errores sanitizados 503/500, caída y recuperación, TLS/rol inválidos, límites sin eludirlos mediante `X-Forwarded-For`, consulta compartida concurrente, cierre, límite global y tamaño máximo del mapa.

Esta rama no incorpora la PR de operación del registro; por eso su total de unitarias difiere. Las pruebas HTTP aisladas sustituyen PostgreSQL; la comprobación adicional usa una base local recién instalada. No se accedió a RDS durante esta entrega. La ruta no acredita que SMTP, los documentos legales, las restauraciones o el resto de módulos estén listos.
