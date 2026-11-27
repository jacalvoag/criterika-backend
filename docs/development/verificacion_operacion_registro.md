# Verificación de la operación del registro

Fecha: 2026-11-27. Base de trabajo: `develop` después de la integración de la PR #22 (`caee201c`).

| Comprobación | Resultado |
| --- | --- |
| `npm run build` | Correcto. |
| `npx tsc --noEmit` | Correcto. |
| `npm run lint` | Correcto. |
| `npm test` | 620 pruebas correctas en 62 archivos. |
| `npm run test:e2e` | 7 correctas; 1 de PostgreSQL omitida por activación explícita. |
| `npm run test:persistence` | 63 pruebas correctas con PostgreSQL 18.6 temporal. |
| Prueba HTTP con `REGISTRATION_HTTP_TEST=1` | Correcta; PostgreSQL temporal y correo sustituido. |
| Comando compilado `send-registration-mail.js 1` | Correcto sin pendientes: cero envíos y cero respuestas depuradas. |

Se utilizó una base local recién instalada con la migración existente, un login sin propiedad del esquema, miembro únicamente de `criterika_app`, secretos ficticios y una clave RSA generada fuera del repositorio. La prueba HTTP comprueba inicio, reenvío limitado, código incorrecto, verificaciones concurrentes y recuperación idempotente de sesión. Se amplió para comprobar que el trabajador ya cancelado no envía ni consume el mensaje, que el envío posterior funciona y que un ciclo operativo no vuelve a enviarlo.

Las pruebas unitarias añadidas comprueban conservación de secretos existentes, inicialización idempotente, rechazo de claves inválidas/reutilizadas y preparación concurrente; diagnóstico SMTP sin envío ni filtración del error; depuración confirmada antes del correo; procesamiento secuencial, recuperación tras fallo e interrupción de la espera.

No se accedió a RDS ni a un SMTP externo durante esta entrega. No se enviaron mensajes reales. La recepción de correo, los documentos legales reales, la instalación permanente del trabajador y el despliegue requieren la comprobación del entorno del equipo descrita en [operación del registro](operacion-registro.md). Tampoco se acreditan aquí login, renovación, autorización privada o el resto de las retenciones.
