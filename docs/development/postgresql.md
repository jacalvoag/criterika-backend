# Conectar NestJS a PostgreSQL

La aplicación usa un pool `pg`, administrado por `PostgresModule`, y `@nestjs/config` para cargar y validar el entorno. La estructura sigue definida por las migraciones SQL. El backend comprueba la conexión al arrancar y cierra el pool al detenerse.

## Preparar la base

Se necesita PostgreSQL 18 o superior, una base dedicada a Criterika y la migración inicial aplicada. Seguir [las instrucciones de migraciones](../../database/README.md). La credencial migradora se usa fuera del backend.

### Preparación del propietario en Amazon RDS

Antes de la primera instalación en una instancia RDS nueva, conectar
como operador y preparar el rol propietario:

```sql
BEGIN;

CREATE ROLE criterika_owner
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;

GRANT criterika_owner TO postgres;
GRANT CREATE ON DATABASE criterika TO criterika_owner;

COMMIT;
```

Este ejemplo usa `postgres` como operador y `criterika` como base.
Adaptar los nombres al entorno.

Si el rol ya existe, comprobar sus atributos antes de reutilizarlo
y omitir `CREATE ROLE`.

El permiso `CREATE` sobre la base permite transferir al rol la
propiedad de los esquemas durante la instalación. Es distinto del
atributo `CREATEDB`, que permanece desactivado.

Después, aplicar la migración siguiendo `database/README.md`.

```sql
CREATE ROLE criterika_api LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT criterika_app TO criterika_api;
GRANT CONNECT ON DATABASE criterika TO criterika_api;
```

En `psql`, el operador puede asignar la contraseña de forma interactiva con `\password criterika_api`. Usar el nombre real de la base si no es `criterika`.

No conceder `criterika_owner` ni `criterika_maintenance` al login del backend. El arranque rechaza un superusuario, facultades administrativas o la pertenencia a esos grupos. El login debe heredar los permisos de `criterika_app`.

La conexión preparada en el código no instala PostgreSQL, no aplica migraciones automáticamente y no provisiona las tres cuentas administrativas de la aplicación.

## Configurar el entorno

Desde la raíz del repositorio, en Git Bash:

```bash
npm ci
cp .env.example .env
```

Completar `.env` con los datos del login de aplicación. Los valores del entorno del proceso tienen prioridad sobre el archivo. Las pruebas Vitest usan valores ficticios y omiten `.env` cuando `NODE_ENV=test`.

| Variable | Uso |
| --- | --- |
| `NODE_ENV` | `development`, `test` o `production`; predeterminado `development`. |
| `PORT` | Puerto HTTP, 1–65535; predeterminado 3000. |
| `DB_HOST` | Host del servidor; obligatorio. |
| `DB_PORT` | Puerto PostgreSQL, 1–65535; predeterminado 5432. |
| `DB_NAME` | Nombre de la base; obligatorio. |
| `DB_USER` | Login técnico de la aplicación; obligatorio. |
| `DB_PASSWORD` | Contraseña obligatoria; se conserva literalmente, incluidos los espacios. |
| `DB_TLS_MODE` | `verify-full` por defecto. `disable-local` solo admite `localhost`, `127.0.0.1` o `::1`, fuera de producción. |
| `DB_CA_FILE` | Ruta opcional al certificado CA de confianza; solo con `verify-full`. Si se omite, se usa el almacén de confianza de Node.js. |
| `DB_POOL_MAX` | Máximo de conexiones del proceso, 1–50; predeterminado 10. |

El ejemplo de `.env` configura explícitamente la excepción para PostgreSQL local en loopback. Cualquier conexión remota requiere `verify-full`. Para producción siempre se exige TLS. No existe una opción para desactivar la verificación del certificado.

Si el proveedor entrega una CA, indicar su ruta en `DB_CA_FILE`. Las rutas relativas se resuelven desde la carpeta en la que se ejecuta el proceso; en Windows se pueden usar barras `/`, por ejemplo `C:/certificados/ca.pem`. La clave del servidor y otros secretos no pertenecen al repositorio.

## Comprobar y arrancar

```bash
npm run db:check
npm run start:dev
```

`db:check` compila el proyecto y abre un contexto Nest sin servidor HTTP. Comprueba versión PostgreSQL, presencia de la migración, permisos del login y estado TLS; después cierra las conexiones. En una conexión local válida puede mostrar:

```json
{"status":"ok","postgresqlMajor":18,"tls":false,"tlsVersion":null}
```

En una conexión remota debe indicar `tls: true`. La versión TLS exacta depende del servidor. La salida no incluye usuario, contraseña, host ni nombre de base.

El pool usa un límite de 5 segundos para adquirir una conexión, 10 segundos para ejecutar una sentencia en el servidor y 12 segundos para esperar su respuesta en el cliente. Las sesiones inactivas se liberan tras 30 segundos. El backend abre HTTP solo después de completar su comprobación de arranque; no se añade un endpoint nuevo al contrato.

## Diagnóstico

| Código | Revisar |
| --- | --- |
| `CONFIGURATION_OR_STARTUP_ERROR` | Variables faltantes, rangos, combinación TLS o lectura del archivo CA. Los mensajes de validación del arranque identifican variables, sin mostrar sus valores. |
| `DB_CONNECTION_FAILED` | Host, puerto, autenticación, certificado y disponibilidad. También puede indicar que faltan roles técnicos de la migración. |
| `DB_VERSION_UNSUPPORTED` | PostgreSQL anterior a 18. |
| `DB_SCHEMA_NOT_READY` | Base seleccionada sin la migración inicial instalada. |
| `DB_ROLE_NOT_ALLOWED` | Login sin permisos heredados de aplicación o con facultades de administración. |
| `DB_TLS_REQUIRED` | La sesión no informa TLS aunque la configuración lo exige. |

Los errores originales del driver no se copian a la salida de diagnóstico ni a los logs de sesiones inactivas. Esta medida no sustituye la política de logs de los futuros módulos de negocio.

## Uso en servicios futuros

Los módulos que consulten PostgreSQL pueden importar `PostgresModule` e inyectar `POSTGRES_POOL`. Usar parámetros de consulta para todos los valores variables.

Para operaciones de negocio que necesiten auditoría, reservar un cliente del pool y ejecutar en esa misma conexión `BEGIN`, `criterika.establecer_contexto(...)`, las modificaciones y `COMMIT`. Ante un error, ejecutar `ROLLBACK` y devolver el cliente en `finally`. El actor se obtiene de la identidad autenticada en el servidor. No usar consultas independientes del pool para las partes de una transacción.

La conexión TLS contra Amazon RDS quedó comprobada según
[la verificación PostgreSQL](verificacion_postgresql.md).
Cada entorno nuevo debe repetir su comprobación.
