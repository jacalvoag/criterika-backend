# Registro de jugadores

La aplicación activa las rutas públicas `/api/v1/legal/documents/current` y
`/api/v1/auth/registrations`, incluido el reenvío y la verificación del
código. Antes de arrancar, configurar las variables del registro y PostgreSQL
descritas en [la guía de integración](../../../docs/architecture/registro-persistencia.md).
Si faltan documentos publicados o información del responsable, la consulta legal
responde `LEGAL_CONFIGURATION_MISSING`.

## Límite de solicitudes

La composición inicial utiliza `@nestjs/throttler` con almacenamiento en
memoria. Ejecutar **una sola instancia y un solo proceso HTTP**: los contadores
no se comparten entre procesos y se reinician al arrancar. Antes de agregar
réplicas, sustituir `REGISTRATION_RATE_LIMITER` por un proveedor con
almacenamiento compartido y pruebas de concurrencia.

El límite global es 500 solicitudes de registro por minuto. Por dirección y
minuto se admiten hasta 60 consultas de documentos, cinco inicios, diez reenvíos
y 30 verificaciones. Las respuestas limitadas incluyen `Retry-After`. Los
códigos también conservan el máximo de cinco intentos del contrato. Las
direcciones no se guardan en claro en el limitador.

Express utiliza la dirección de la conexión por defecto. Cuando haya un proxy,
configurar `trust proxy` únicamente para los proxies o subredes concretos del
despliegue. Una configuración general que confíe en cualquier dirección puede
permitir suplantar la IP y también afecta la evidencia de aceptación.

## Correo

El envío se realiza después de confirmar el registro en la base. El proceso
interno debe ejecutar periódicamente `npm run registration:mail -- 20` con la
misma configuración segura del backend. Consultar la guía de integración para
los detalles de reintentos, expiración y protección del material de correo.
