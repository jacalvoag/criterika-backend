# Operar el registro

La integración de las PR #20, #21 y #22 conecta el registro HTTP con los repositorios PostgreSQL y los proveedores de seguridad. Este bloque prepara el entorno y ejecuta el correo pendiente. Requiere Node.js >=24.7.0 y el login de aplicación; no utiliza el usuario maestro de RDS.

## 1. Preparar las claves una sola vez

Desde la raíz del backend, en Git Bash o PowerShell:

```bash
npm ci
npm run registration:setup
```

Si no existe `.env`, se toma `.env.example`. Si existe, conserva la conexión, las contraseñas y las demás variables. Solo completa claves y valores JWT que estén vacíos. Genera cuatro claves independientes de 32 bytes y una clave RSA privada de 2048 bits en `.secrets/`; no muestra sus valores. El archivo de configuración y los PEM quedan excluidos de Git.

Repetir el comando conserva las claves existentes. Una clave inválida, reutilizada o una ruta privada configurada pero ausente produce un error; no intenta rotarla. No sustituir las claves para solucionar un fallo: se perdería acceso a códigos, correos y respuestas cifradas anteriores. Respaldar los secretos mediante el mecanismo privado del equipo. Los permisos POSIX solicitados no sustituyen los permisos de acceso de Windows.

Se puede indicar otro archivo: `npm run registration:setup -- RUTA_ENV`. Los comandos de ejecución siguen leyendo `.env` o variables del proceso; no seleccionan automáticamente esa ruta alternativa. Si un proceso terminó abruptamente y dejó `.env.setup.lock`, comprobar que no haya otra preparación activa antes de retirar únicamente ese archivo de bloqueo.

## 2. Completar el entorno real

Editar `.env` localmente. Para RDS, conservar los valores de la conexión que ya pasó `db:check`:

| Variable                                       | Valor requerido                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Instancia, base y login de aplicación existentes.                                                                                                                  |
| `DB_TLS_MODE`                                  | `verify-full` para RDS.                                                                                                                                            |
| `DB_CA_FILE`                                   | Certificado regional ya descargado; rutas Windows con `/`.                                                                                                         |
| `SMTP_URL`                                     | URL `smtp://usuario:clave@servidor:587` o `smtps://usuario:clave@servidor:465`, según el proveedor. Codificar caracteres reservados de las credenciales en la URL. |
| `MAIL_FROM`                                    | Dirección de correo autorizada por el proveedor.                                                                                                                   |
| `PRIVACY_RESPONSIBLE_NAME`                     | Nombre real del responsable.                                                                                                                                       |
| `PRIVACY_CONTACT_EMAIL`                        | Canal real de privacidad.                                                                                                                                          |
| `PRIVACY_POSTAL_ADDRESS`                       | Domicilio real del responsable.                                                                                                                                    |

No escribir secretos en comandos compartidos, capturas, incidencias o documentos del repositorio. El transporte verifica TLS y exige STARTTLS en SMTP; no deshabilitar la validación para resolver problemas del proveedor.

La base también necesita las versiones publicadas y vigentes de términos y aviso de privacidad, compatibles con el contrato. El comprobador las lee desde los mismos repositorios del registro. **No cargar fixtures de pruebas en RDS** para completar documentos reales. Su contenido y los datos del responsable deben acordarse y publicarse por el flujo correspondiente.

```bash
npm run db:check
npm run registration:check
```

`registration:check` valida las dependencias, lee los documentos vigentes y comprueba conexión/autenticación SMTP sin enviar un correo. Devuelve JSON con `database`, `legalDocuments` y `smtp`, y termina con código distinto de cero si el entorno está incompleto. Un resultado correcto no comprueba que el proveedor entregue un mensaje en la bandeja del destinatario.

## 3. Ejecutar API y trabajador

Para desarrollo, usar dos terminales en la misma carpeta y con la misma configuración:

```bash
# Terminal 1
npm run start:dev
```

```bash
# Terminal 2
npm run registration:worker:dev
```

Para un artefacto ya compilado, el trabajador se ejecuta con `npm run registration:worker`. Necesita permanecer activo: no arranca automáticamente con la API. En un servidor, su instalación como servicio y reinicio dependen del sistema operativo elegido.

Cada ciclo depura un lote de respuestas idempotentes vencidas, confirma esa transacción y después procesa los correos. Un fallo de SMTP no revierte la depuración. Los ciclos son secuenciales, los errores dejan un resultado sin datos privados y el siguiente ciclo vuelve a intentar los candidatos permitidos por el repositorio. El apagado con Ctrl+C/SIGTERM interrumpe la espera y solicita cancelar el envío activo antes de cerrar el pool.

| Variable                        | Predeterminado | Intervalo admitido                 |
| ------------------------------- | -------------- | ---------------------------------- |
| `REGISTRATION_WORK_INTERVAL_MS` | `5000`         | `1000`–`60000` ms entre ciclos.    |
| `REGISTRATION_WORK_BATCH`       | `20`           | `1`–`100` elementos por operación. |

Para una ejecución puntual: `npm run registration:mail -- 20`. Ejecuta depuración y correo una sola vez; devuelve código de error si hubo envíos fallidos. No ejecutar un segundo planificador si ya se usa el trabajador continuo, salvo una intervención consciente.

Los envíos usan el bloqueo PostgreSQL existente por registro. SMTP puede aceptar un mensaje y perder su confirmación; un reintento podría entregar un duplicado. No se promete entrega exactamente una vez.

Mantener **una instancia HTTP y un proceso HTTP**, conforme a la topología admitida por los límites de solicitudes de la PR #22. El trabajador separado no sirve rutas HTTP y no cuenta como una segunda instancia HTTP. No habilitar réplicas, clúster o una cadena de proxies sin adaptar y comprobar ese control.

## 4. Cierre en el entorno del equipo

1. `db:check` y `registration:check` correctos, con el login de aplicación.
2. API y trabajador activos; obtener documentos e iniciar un registro con una cuenta de prueba autorizada.
3. Comprobar recepción y vencimiento del código, verificarlo y revisar la respuesta de sesión.
4. Repetir la misma solicitud con su misma clave de idempotencia y confirmar la misma respuesta mientras sea recuperable.
5. Detener/reanudar el trabajador y comprobar el procesamiento de pendientes sin copiar códigos, tokens ni contraseñas al reporte.

La prueba HTTP aislada del repositorio utiliza PostgreSQL desechable y un proveedor de correo sustituido. Es evidencia de integración del código; no acredita entrega SMTP real, despliegue, restauración o configuración actual de RDS.

## Alcance restante

Este trabajador depura respuestas idempotentes; no implementa por sí solo todas las retenciones de pendientes, códigos, sesiones, respaldos o solicitudes ARCO. El inicio de sesión, renovación, autorización de rutas privadas, administración y flujo jugable HTTP pertenecen a entregas posteriores. No modificar ni reaplicar la migración `0001` para instalar estas herramientas: este bloque no cambia el esquema.
