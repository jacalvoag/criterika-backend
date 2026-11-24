# Criterika — PostgreSQL modular v1

15 de noviembre de 2026. Implementación física del modelo lógico nuevo: **53 tablas de negocio, 88 claves foráneas, 119 CHECK y 77 triggers**. PostgreSQL 18 o superior; comprobado en 18.6. El esquema `control_sql` agrega una tabla técnica de migraciones, fuera de esas 53.

## Organización

La migración inicial es una sola unidad de cambio, dividida en **19 archivos SQL** por responsabilidad. Los archivos se ejecutan completos dentro de una transacción; no deben aplicarse individualmente.

| Ubicación                                       | Responsabilidad                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `aplicar.py`                                    | Comprobar las huellas de los SQL y ejecutar el instalador con `psql`.                              |
| `aplicar.sql`                                   | Orden explícito de ejecución, bloqueo de migraciones y transacción. No contiene todo el DDL.       |
| `bootstrap/registro.sql`                        | Crear el registro técnico de versiones. Puede permanecer vacío si falla la instalación de negocio. |
| `migrations/0001_inicial/00_esquemas_roles.sql` | Esquemas y grupos técnicos de permisos.                                                            |
| `10_tablas_cuentas.sql`                         | Identidad, sesiones y operación de cuentas.                                                        |
| `11a_tablas_aprendizaje.sql`                    | Unidades, niveles, actividades y revisiones.                                                       |
| `11b_tablas_cartas_diccionario_archivos.sql`    | Cartas, evoluciones, términos y archivos.                                                          |
| `12_tablas_participacion.sql`                   | Intentos, actividades del intento, ejecuciones e interacciones.                                    |
| `13_tablas_economia.sql`                        | Aprobaciones, gemas, vidas y adquisiciones.                                                        |
| `14a_tablas_aceptaciones.sql`                   | Versiones legales, finalidades y aceptaciones.                                                     |
| `14b_tablas_derechos_privacidad.sql`            | Solicitudes ARCO, verificaciones, resoluciones y ejecución.                                        |
| `14c_tablas_moderacion_auditoria.sql`           | Sanciones, correcciones y bitácora administrativa.                                                 |
| `15_tablas_soportes.sql`                        | Idempotencia, tareas y controles de eliminación.                                                   |
| `20_claves_y_relaciones.sql`                    | Claves únicas y relaciones entre tablas ya creadas.                                                |
| `21_restricciones.sql`                          | Rangos y combinaciones válidas de estados, fechas e importes.                                      |
| `22_indices.sql`                                | Índices de consulta y unicidad condicional.                                                        |
| `30_funciones_contexto_auditoria.sql`           | Contexto transaccional y captura de auditoría sin copiar PII.                                      |
| `31_funciones_proteccion.sql`                   | Protección de históricos, roles y estructura utilizada.                                            |
| `32_funciones_integridad_diferida.sql`          | Reglas que se comprueban al completar la transacción.                                              |
| `40_triggers.sql`                               | Asociar las funciones a los eventos de las tablas.                                                 |
| `50_permisos.sql`                               | Permisos de aplicación y mantenimiento.                                                            |
| `60_datos_base.sql`                             | Cinco estados técnicos de tareas; sin cuentas ni textos legales ficticios.                         |
| `manifest.json`                                 | Orden y huellas SHA-256 de los archivos de la migración.                                           |
| `fixtures/00_datos_prueba.sql`                  | Datos ficticios aislados; nunca se cargan al instalar.                                             |
| `tests/`                                        | Pruebas, dependencias e informe de la comprobación realizada.                                      |
| `docs/responsabilidades_backend.md`             | Reglas que debe completar el backend y la infraestructura.                                         |

Los nombres abreviados de la tabla anterior están dentro de `migrations/0001_inicial/`. Las tablas se separan por módulo; claves, funciones y triggers se separan por responsabilidad. Evitamos un archivo por tabla porque añadiría navegación sin aportar claridad suficiente.

## Instalación

Requisitos: una base de datos nueva dedicada a Criterika, PostgreSQL 18+, cliente `psql` y Python 3.10+. La instalación no requiere paquetes Python externos. Debe ejecutarla un operador con permisos para crear roles, conceder membresías y crear objetos en la base. En servicios administrados hay que comprobar esas facultades antes de ejecutar.

Configurar la conexión mediante las variables estándar de PostgreSQL (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`) o `PGSERVICE`. Guardar el secreto mediante el mecanismo del entorno o un archivo de contraseñas de PostgreSQL protegido. Configurar validación TLS para conexiones reales. El instalador no solicita contraseñas de forma interactiva. `PSQL_BIN` permite indicar la ruta del cliente si no está en PATH.

Desde esta carpeta:

```bash
python aplicar.py
```

El instalador verifica los SQL antes de conectarse. Si `0001` ya está registrada con la misma huella, no vuelve a ejecutarla. Si cambia una migración aplicada, se rechaza. Si falla cualquiera de sus SQL, se revierte la migración de negocio y no se registra como aplicada. Un bloqueo asesor evita que dos instaladores de este paquete la apliquen simultáneamente. Las huellas detectan alteraciones accidentales; no sustituyen la revisión del código ni una firma de distribución.

El script crea grupos **NOLOGIN**: `criterika_owner`, `criterika_app` y `criterika_maintenance`. No crea usuarios de conexión ni contraseñas. El operador provisiona logins separados y concede a cada servicio únicamente el grupo que necesita; el login del backend no debe pertenecer a owner ni maintenance. Estos grupos técnicos son distintos de las tres cuentas administrativas de la aplicación.

Las tres cuentas administrativas reales se provisionan mediante un procedimiento controlado de mantenimiento y contraseñas con hash generado por el backend. La base limita su número a tres y bloquea cambios de rol. El instalador no inserta administradores con credenciales de ejemplo; el despliegue se considera pendiente hasta que estén provisionados los tres.

## Evolución del esquema

Una migración es un cambio versionado, no un tipo de objeto. Por eso `0001_inicial` contiene tablas, claves, funciones, triggers y permisos de la misma versión. No se mantiene otro `schema.sql` completo en paralelo: serían dos fuentes que podrían divergir.

Después de aplicar `0001`, no editar sus archivos. El siguiente cambio se agrega en `migrations/0002_descripcion/`, con solo los cambios necesarios, sus SQL ordenados y su manifiesto. En esa misma entrega se amplían **ambos** instaladores para verificar y ejecutar esa versión bajo el mismo bloqueo y con registro de su huella. El instalador actual implementa exclusivamente `0001`; no descubre carpetas futuras automáticamente. Antes de la primera aplicación se pueden ajustar los archivos, recalcular el manifiesto y volver a probarlos.

No se incluye un `down.sql` automático que borre datos. Si una migración ya aplicada necesita corregirse, se prepara una nueva migración. Una recuperación por respaldo requiere un procedimiento revisado y reconciliación de eliminaciones posteriores al respaldo.

## Pruebas reproducibles

Usar una base nueva, vacía y desechable cuyo nombre comience por `criterika_prueba_`. Aplicar primero la migración. El usuario de pruebas necesita capacidad para cambiar a los roles del paquete y crear una base temporal propia para verificar la reversión de una instalación fallida. Los datos ficticios incluyen tres administradores y jugadores con hashes deliberadamente no autenticables.

```bash
python -m pip install -r tests/requirements.txt
python tests/ejecutar.py
```

La suite rechaza bases con otro prefijo o con cuentas existentes. Carga sus fixtures y deja datos de prueba en esa base desechable. El caso de instalación fallida crea y elimina únicamente su propia base temporal. Resultado registrado: **34 pruebas, 0 fallos y 0 errores en PostgreSQL 18.6**. Ver `tests/informe_pruebas.md` para el alcance exacto.

## Integración con el contrato

### Repositorios TypeScript del flujo jugable

La [entrega de persistencia para Rafael](../docs/architecture/flujo-jugable-persistencia.md) implementa los repositorios sobre esta migración, sin modificar sus archivos. La suite adicional `npm run test:persistence` utiliza un login de aplicación limitado y el fixture independiente `fixtures/01_flujo_jugable.sql` en una base local desechable. Su preparación y carácter destructivo están detallados en esa guía; no sustituye `tests/ejecutar.py` ni se ejecuta contra RDS. Ver el [informe de persistencia](tests/informe_persistencia_juego.md).

Compatible con el [contrato OpenAPI](../docs/openapi/criterika_openapi_v1.yaml), versión 1.0.2. Se añadió al contrato el motivo de finalización `PRIVACIDAD`, que ya corresponde a la cancelación por restricciones de tratamiento acordada. No se agregaron rutas.

Se conserva el modelo lógico de 53 tablas. `revisiones_nivel.transaccion_creacion` es metadato físico interno para impedir que se agreguen componentes a una revisión fuera de su transacción de creación; no forma parte del DTO público.

Esta entrega establece la base física modular y comprobaciones SQL. La implementación de los servicios, las tareas de privacidad, los respaldos y la configuración del entorno se completan en la etapa de backend.

La [persistencia del registro](../docs/architecture/registro-persistencia.md) utiliza el esquema instalado sin otra migración. Sus pruebas locales incluyen documentos ficticios y los repositorios reales de registro, cuenta, aceptación y sesión.
