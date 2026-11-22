# Arquitectura del backend de Criterika

Estado: acuerdo de implementación. Base: contrato OpenAPI 1.0.2, modelo PostgreSQL y [reparto del equipo](../team/responsabilidades.md). Describe cómo construir las funcionalidades; no acredita módulos o endpoints implementados.

## Decisión y alcance

Se utiliza un monolito modular NestJS: una aplicación HTTP, una base PostgreSQL y módulos por capacidad funcional. Los trabajos internos pueden tener un punto de entrada separado con la credencial técnica correspondiente, conservando el mismo proyecto. RDS aloja PostgreSQL; no decide las fronteras del código.

Cada funcionalidad agrupa su controlador, DTO, servicios, contratos internos, repositorios y pruebas. La complejidad se añade cuando existe una operación que la necesita. Se pueden conservar los actuales `src/config/` y `src/database/`.

| Responsabilidad       | Contenido                                                                                     | Límite                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Controlador y DTO     | HTTP, parámetros, headers, validación estructural y representación de respuestas              | Delega las decisiones de negocio. La identidad no procede del cuerpo.           |
| Servicio              | Reglas, permisos del caso, coordinación y resultado de la operación                           | No contiene SQL ni usa Request/Response de Express para sus reglas.             |
| Repositorio           | SQL parametrizado, relaciones, bloqueos, conversión de filas y conflictos de persistencia     | Utiliza la conexión transaccional recibida; no confirma por su cuenta.          |
| Infraestructura común | Configuración, pool, transacciones, correlación, errores, idempotencia y adaptadores técnicos | Exporta capacidades concretas y mantiene los secretos fuera de respuestas/logs. |

Un servicio puede coordinar una operación completa y utilizar funciones puras para cálculos o evaluación. Se extrae otro servicio cuando tenga una responsabilidad sustancial propia. Las interfaces se emplean para los acuerdos que necesitan José y los responsables funcionales o para un proveedor externo; no se exige una interfaz para cada clase ni un repositorio genérico.

## Módulos y dependencias

La tabla describe dependencias permitidas entre capacidades. Todas pueden usar infraestructura común; esa dependencia técnica se omite para facilitar la lectura. Cada módulo exporta solo sus servicios públicos necesarios. Los repositorios permanecen internos.

| Capacidad prevista | Responsable funcional | Puede consumir estas capacidades                                                                                                             |
| ------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `security`         | Uzzi                  | Infraestructura; verifica sesión, rol y confirmación reciente, sin importar módulos de negocio.                                              |
| `minigames`        | Rafael                | Tipos y funciones puras propias; sin HTTP, SQL o identidad.                                                                                  |
| `media`            | Uzzi                  | `security` y adaptador técnico de almacenamiento.                                                                                            |
| `legal`            | Uzzi                  | `security` para administración; versiones, finalidades y aceptación son propias.                                                             |
| `accounts`         | Uzzi                  | `security`, `media`. Expone perfil y estado mínimo de acceso.                                                                                |
| `auth`             | Uzzi                  | `security`, `accounts`, `legal`. Registro y acceso no importan el flujo de juego.                                                            |
| `content`          | Rafael                | `security`, `media`, `minigames`. Borradores, publicación y definiciones compartidas.                                                        |
| `economy`          | Rafael                | `security`, `accounts`, `legal`, `content`. Saldos, vidas, XP, racha, compras y beneficio de evoluciones.                                    |
| `collection`       | Rafael                | `security`, `content`, `economy`. Consulta/adquisición de cartas; las compras se delegan a economía.                                         |
| `dictionary`       | Rafael                | `security`, `content`. Consulta y concesión de términos propios.                                                                             |
| `gameplay`         | Rafael                | `security`, `accounts`, `legal`, `content`, `minigames`, `economy`, `collection`, `dictionary`. Coordina intentos y resultados.              |
| `audit`            | José                  | `security`. Consulta de bitácora y evidencia explícita de accesos administrativos.                                                           |
| `moderation`       | Uzzi                  | `security`, `accounts`, `gameplay`, `economy`, `audit`. Sanciones y resolución de casos.                                                     |
| `privacy`          | Uzzi                  | `security`, `accounts`, `auth`, `legal`, `media`, `gameplay`, `economy`, `collection`, `dictionary`, `audit`. Coordina derechos y ejecución. |
| `system`           | José                  | Infraestructura y `security` para el estado administrativo del mantenimiento.                                                                |

Son límites de capacidades, no una orden de generar todas las carpetas ahora. Cuando se implementen, los nombres de módulo corresponden al reparto. `AppModule`, mantenido por José, compone las funcionalidades disponibles. Los servicios de negocio se comparten mediante imports/exports explícitos.

`security` no importa `auth`: la verificación de una sesión es una capacidad básica que también usa el flujo de acceso. `accounts` puede consultar, mediante un repositorio de José, sanciones y restricciones del titular para ofrecer un estado mínimo; no importa `moderation` ni `privacy`. Así los módulos superiores pueden aplicarlas sin crear dependencias de ida y vuelta.

Los guards comunes verifican identidad y acceso de rol. El servicio decide el permiso de la operación concreta. Una cuenta restringida para juego conserva las consultas o mecanismos ARCO permitidos por el contrato; un bloqueo global indiscriminado impediría ese comportamiento.

## Propiedad de datos y escrituras

José conserva toda la persistencia y el esquema. El propietario funcional define la regla; el repositorio de José materializa su lectura o escritura. Las consultas pueden unir tablas para construir una vista autorizada; eso no habilita a un servicio a saltarse las capacidades públicas de otra funcionalidad.

| Información                                               | Regla funcional y coordinación                                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfil e identidad                                        | `accounts`; `auth` coordina el alta mediante su capacidad pública.                                                                                                    |
| Documentos, finalidades y aceptaciones                    | `legal`; registro conserva la evidencia original y la vincula al crear la cuenta.                                                                                     |
| Sesiones y credenciales temporales                        | `security`/`auth`, según el propósito; SQL de José.                                                                                                                   |
| Definiciones y revisiones publicadas                      | `content`; las ejecuciones usan su revisión fijada.                                                                                                                   |
| Intentos, ejecuciones, interacciones y primera aprobación | `gameplay`.                                                                                                                                                           |
| Contadores de `estados_jugador` y movimientos económicos  | `economy` coordina las modificaciones posteriores al alta, incluida la racha. `gameplay` le comunica el resultado dentro de la transacción.                           |
| Creación inicial de `estados_jugador`                     | Parte del alta atómica de `accounts`: cinco vidas y valores iniciales del contrato, revisados por Rafael. No necesita un servicio de juego para registrar una cuenta. |
| Adquisición de carta base y términos                      | `collection` y `dictionary`; `gameplay` solicita las concesiones en su transacción.                                                                                   |
| Compra de una evolución                                   | `economy` confirma gasto, movimiento y evolución adquirida; `collection` utiliza esa capacidad.                                                                       |
| Trámite y pasos ARCO                                      | `privacy`; el ejecutor técnico de José opera las purgas y controles de restauración con credencial separada.                                                          |
| Auditoría                                                 | Triggers de José para escrituras administrativas y capacidad explícita de `audit` para accesos que deban dejar evidencia.                                             |

El alta inicial y la ejecución técnica de una supresión son coordinaciones expresas; no justifican que todos los servicios editen cualquier tabla. Antes de agregar una escritura se identifica su propietario funcional y el repositorio que la implementará.

## Transacciones

`TransactionRunner`, implementado en `src/database/transaction-runner.ts` y exportado por `PostgresModule`, reserva un cliente del pool, ejecuta `BEGIN`, establece `criterika.establecer_contexto`, entrega ese mismo `PoolClient` al coordinador y confirma o revierte. Devuelve siempre la conexión y descarta una conexión dañada. Un `PoolClient` explícito como argumento es suficiente para este proyecto; no se introduce un framework de unidad de trabajo ni propagación transaccional oculta.

El coordinador funcional decide el conjunto atómico. Las capacidades participantes reciben el mismo cliente, sin `pool.query`, `COMMIT` propio ni transacciones anidadas independientes. Los comandos usan READ COMMITTED con bloqueos explícitos, conforme al modelo lógico. Las vistas compuestas usan `TransactionRunner.read` con REPEATABLE READ READ ONLY para conservar una misma instantánea entre consultas.

Se conserva el orden de bloqueo acordado: cuenta, estado, intento y actividad/ejecución; recursos del mismo tipo en orden estable. El contenido se bloquea como unidad/nivel. Registro bloquea su pendiente y código, y las versiones legales pertinentes, antes de crear recursos nuevos; no puede bloquear una cuenta que todavía no existe. Las implementaciones de purga y recuperación respetan los mismos recursos y comprueban sus concurrencias.

El contexto público del registro es `SISTEMA`, sin actor humano atribuido. Un actor jugador o administrador procede de una sesión comprobada. El contexto técnico de mantenimiento utiliza otra entrada/credencial; el proceso HTTP ordinario no lo elige desde parámetros del cliente.

Un error técnico o una excepción de negocio sin efectos aceptados revierte la operación. Cuando un rechazo debe guardar estado, como incrementar intentos de código, el servicio devuelve un resultado tipado de rechazo, se confirma ese estado y después el borde HTTP produce el error. Lanzar la excepción antes del commit borraría el contador.

Los reintentos técnicos de deadlock o conflicto transitorio serán acotados, conservando la intención y reevaluando el estado. Un fallo de red al confirmar puede dejar resultado incierto: se recupera por idempotencia, no se repite a ciegas el beneficio. Las llamadas a correo, objetos o terceros se realizan fuera de la transacción SQL.

## Flujos que cruzan capacidades

| Caso                  | Coordinador                             | Confirmación conjunta                                                                                                                                           |
| --------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro verificado   | Servicio de registro de Uzzi            | Cuenta, estado inicial, aceptación original, consumo de código, marca del pendiente, sesión y recuperación idempotente. Ver [acuerdo de registro](registro.md). |
| Aprobación de nivel   | Servicio de cierre de intento de Rafael | Resultado e interacción; aprobación única; gemas, XP, racha, vida y concesiones aplicables. Una repetición no duplica el premio inicial.                        |
| Compra/evolución      | Servicio de compra de Rafael            | Regeneración/reserva comprobadas, saldo, recibo, movimiento y beneficio completo.                                                                               |
| Cancelación de cuenta | Servicio de privacidad de Uzzi          | Admisión/restricción, revocación y cancelación de intento sin consumo; posteriormente pasos de supresión confirmables ejecutados por José.                      |

Para cancelar una cuenta no se presenta como atómico lo que sucede en PostgreSQL y en proveedores externos. El trámite persiste su avance y solo se marca completado cuando termina lo requerido. El control mínimo de eliminación tiene una copia protegida fuera del respaldo restaurable; las eliminaciones se reaplican antes de habilitar una restauración. Son procedimientos pendientes de implementación y prueba, no garantías producidas por este documento.

## HTTP, seguridad y operación común

- El contrato conserva `/api/v1`, sus propiedades, estados, límites, idempotencia y concurrencia optimista. Los DTO de transporte no se convierten en entidades de base de datos.
- José establece un único formato `application/problem+json`, correlación y traducción de errores. Los errores incluyen códigos del contrato; no SQL, valores de contraseñas, tokens o trazas privadas.
- Uzzi implementa guards y capacidades de identidad. Los servicios verifican titularidad y permisos del caso, incluso en consultas y recuperación de respuestas idempotentes.
- La IP de aceptación procede de la conexión y de una política explícita de proxies confiables. No se acepta una IP del cuerpo ni se confía libremente en `X-Forwarded-For`.
- José proporciona idempotencia, protección de respuestas recuperables, almacenamiento y transporte técnico. Uzzi controla el flujo y contenido de mensajes de identidad; Rafael los resultados de juego.
- El worker de correo inicial puede recuperar las intenciones persistidas en `desafios_verificacion`; la primera implementación utiliza un solo emisor coordinado. Se definen timeout, reintentos y caducidad antes de habilitarlo. Un fallo de entrega no crea otra cuenta ni otra intención de negocio.
- Los trabajos se ejecutan mediante el mecanismo interno del despliegue; no son endpoints cron públicos ni automatizaciones de ChatGPT.
- Los logins de RDS para migración, aplicación y mantenimiento permanecen separados. La conexión real y su certificado se comprueban al preparar ese entorno.

## Organización y forma de crecer

Un módulo sencillo puede empezar con `auth.module.ts`, un controlador, un servicio, `dto/` y `repositories/`. Los contratos compartidos con otra persona o módulo se ubican junto a la capacidad que los ofrece. Los tests de reglas se colocan con esas reglas; los tests HTTP y de persistencia conservan los propietarios definidos en el acuerdo del equipo.

No se generan carpetas vacías, capas de mapeo sin uso ni clases por cada método HTTP. Las funciones de evaluación se separan cuando permiten probar una regla de forma independiente. Una necesidad concreta de rendimiento, despliegue o proveedor justifica la siguiente abstracción.

## Aceptación de esta arquitectura

1. Cada operación del contrato tiene responsable funcional en la [matriz del equipo](../team/operaciones.md).
2. Las dependencias propuestas forman un grafo sin ciclos; ningún módulo inferior depende de la coordinación que lo utiliza.
3. Registro, aprobación y cancelación tienen un coordinador, datos propios y una estrategia de confirmación/fallo identificada.
4. Las firmas del primer flujo permiten que José prepare persistencia y Uzzi servicios sin inventar otra base o cambiar HTTP.
5. Las capacidades futuras se prueban primero de forma aislada y después con persistencia y seguridad reales. Una firma o una prueba con dobles no acredita integración terminada.

La conexión a RDS y la infraestructura transaccional/repositorios del primer flujo jugable están comprobadas con los alcances de sus respectivos informes. La [entrega de persistencia del juego](flujo-jugable-persistencia.md) identifica métodos y dependencias funcionales. Registro, seguridad y endpoints conservan su propio proceso de implementación e integración; disponer de SQL no los completa automáticamente.

Referencias técnicas: [módulos NestJS](https://docs.nestjs.com/modules), [proveedores personalizados](https://docs.nestjs.com/fundamentals/custom-providers) y [transacciones de node-postgres](https://node-postgres.com/features/transactions).
