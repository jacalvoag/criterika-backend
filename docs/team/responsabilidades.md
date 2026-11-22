# Equipo de Criterika: responsabilidades y coordinación

## Alcance

Reparto para la etapa de arquitectura, API NestJS, base de datos e integración con RDS. Integrantes: José, Uzzi y Rafael. El reparto de vistas de la aplicación móvil y del panel web se definirá antes de desarrollar esas interfaces; una ruta administrativa de la API no equivale a una pantalla del panel.

Se mantiene un monolito modular, organizado por funcionalidades, con controladores/DTO, servicios y repositorios. La coordinación por áreas no introduce nuevas capas técnicas. Solo se crean módulos y carpetas cuando se implementa su responsabilidad.

Los caminos de este documento son límites de trabajo previstos; no indican que los módulos funcionales ya existan. El contrato funcional vigente es OpenAPI 1.0.2.

La guía compartible con el contexto, las responsabilidades y los ejemplos de commits está en [criterika_coordinacion_equipo.json](criterika_coordinacion_equipo.json). Mantener ambos acuerdos coherentes cuando cambie una regla.

## Reparto principal

| Integrante | Área principal                                                   | Entregables                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| José       | Base de datos, persistencia, infraestructura común e integración | Modelo, SQL, migraciones, funciones, triggers, índices, permisos, semillas, repositorios SQL, conexión, transacciones, controles técnicos de retención/restauración, RDS y composición raíz.              |
| Uzzi       | Identidad, seguridad, privacidad y gestión de personas           | Registro/verificación, sesiones de jugador y administrador, recuperación, perfil, autorizaciones, documentos y aceptaciones, ARCO, medios, moderación, consulta de jugadores y panel de avisos de la API. |
| Rafael     | Contenido, minijuegos, participación y economía                  | Unidades/niveles/actividades y publicación, tableros, evaluación de minijuegos, intentos, progreso, vidas, gemas, XP, racha, compras, cartas/evoluciones, diccionario y correcciones de juego.            |

La responsabilidad funcional incluye controladores, DTO, servicios, reglas, pruebas y documentación del área. José conserva toda la persistencia: ni Uzzi ni Rafael introducen SQL, migraciones, modelos ORM, conexiones o adaptadores de almacenamiento de base de datos por su cuenta.

La cantidad de rutas no mide por sí sola la carga: José mantiene la persistencia y los controles comunes que utilizan todas las funcionalidades. Uzzi y Rafael tienen 69 operaciones de negocio asignadas cada uno; José tiene cuatro operaciones de sistema/auditoría, además de la responsabilidad completa de base de datos. La distribución se entrega en incrementos, no como tres ramas de varios meses.

La [matriz de operaciones](operaciones.md) identifica un responsable funcional para las 142 operaciones del contrato actual. Las rutas nuevas o modificadas requieren actualizar su asignación junto con el contrato.

## Límites de archivos

| Archivos o carpetas                                                                                                                 | Responsable de escritura                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `database/**`, `docs/database/**` y cualquier DDL, migración, función, trigger, índice o semilla                                    | José                                                                             |
| `src/database/**`, `src/config/**` y futuros trabajos técnicos de mantenimiento                                                     | José                                                                             |
| `src/modules/**/repositories/**` y sus pruebas de persistencia                                                                      | José, incluso cuando pertenecen a un módulo funcional de Uzzi o Rafael           |
| `src/modules/security/**`, `auth/**`, `accounts/**`, `legal/**`, `privacy/**`, `media/**`, `moderation/**` dentro de `src/modules/` | Uzzi, con la excepción de persistencia indicada arriba                           |
| `src/modules/content/**`, `minigames/**`, `gameplay/**`, `economy/**`, `collection/**`, `dictionary/**` dentro de `src/modules/`    | Rafael, con la excepción de persistencia indicada arriba                         |
| Futuros módulos `src/modules/system/**` y `src/modules/audit/**`                                                                    | José                                                                             |
| Pruebas HTTP y documentación propias de cada funcionalidad                                                                          | Su responsable funcional; los archivos deben tener nombres y ubicaciones propios |
| Infraestructura transversal nueva fuera de las áreas anteriores                                                                     | José coordina y asigna un único responsable antes de crearla                     |

Ejemplos: `src/modules/auth/auth.service.ts` corresponde a Uzzi y `src/modules/auth/repositories/auth.repository.ts` a José. `src/modules/gameplay/gameplay.service.ts` corresponde a Rafael y `src/modules/gameplay/repositories/gameplay.repository.ts` a José.

Los repositorios permanecen dentro de sus módulos para conservar la organización funcional. El módulo exporta los servicios públicos necesarios; los repositorios son detalles internos. La propiedad de archivos del equipo no cambia las dependencias de la arquitectura.

Los tests de repositorio y sus fixtures SQL pertenecen a José. Los casos de prueba en memoria de reglas de negocio pertenecen al responsable funcional. Toda consulta SQL, aunque esté incrustada en TypeScript o en una prueba, sigue bajo responsabilidad de José.

## Archivos compartidos: un solo integrador

José administra los cambios en estos puntos de coordinación:

- `src/main.ts`, `src/app.module.ts` y los componentes raíz generados mientras se sustituyen por funcionalidades.
- `package.json`, `package-lock.json`, `tsconfig*.json`, `nest-cli.json`, configuraciones de Vitest, Oxlint y Prettier.
- `.env.example`, `.gitignore`, `.gitattributes`, `AGENTS.md` y `.github/**`.
- `README.md`, índices de documentación, `docs/architecture/**`, `docs/team/**` y el contrato/guía en `docs/openapi/**`.
- Componentes técnicos comunes de errores, correlación, idempotencia y coordinación de transacciones.
- `test/app.e2e-spec.ts` y otras pruebas globales de arranque.

Uzzi conserva la implementación de la seguridad y sus tipos públicos dentro de `security`. José registra esa capacidad en el arranque cuando esté lista. Rafael y Uzzi pueden pedir nuevas dependencias o variables explicando el módulo, el motivo y el cambio requerido. José incorpora el cambio común en una entrega pequeña; no se generan tres lockfiles distintos en paralelo.

Los contratos públicos de un módulo pertenecen a su responsable funcional y se mantienen dentro de ese módulo. Cambiar una firma consumida por otro exige acordar el cambio antes de integrarlo. No se utiliza una carpeta común como depósito de todos los tipos del proyecto.

## Reglas de colaboración

1. Antes de una tarea, indicar alcance, archivos propios, dependencias y resultado esperado. Cada archivo tiene un responsable de escritura durante esa tarea.
2. Si se necesita un archivo ajeno, solicitar el cambio a su responsable. Una delegación excepcional debe indicar archivos y entrega; durante ella, el propietario evita editarlos en paralelo.
3. No cambiar autenticación, contratos, estructura SQL, errores o configuración para resolver de forma local una dependencia pendiente.
4. No copiar otro repositorio, acceder a las tablas de otro flujo desde un servicio ni agregar una segunda conexión para evitar un bloqueo.
5. Las dependencias se consideran disponibles cuando están implementadas, probadas e integradas en `develop`. Un nombre acordado o un archivo que compila no acredita una implementación lista.
6. Mientras falta una dependencia, avanzar reglas puras, DTO, pruebas aisladas y documentación. Los dobles quedan únicamente en pruebas. La entrega dependiente permanece en borrador hasta comprobar la integración real.
7. Formatear y modificar solo los archivos de la tarea. Los cambios de herramientas o formato global se entregan por separado.
8. La publicación de versiones estables, la configuración RDS y las migraciones se coordinan por José. Este acuerdo no crea recursos ni concede permisos de infraestructura.

## Handoffs de persistencia

Antes de que José implemente un repositorio, el responsable funcional entrega las operaciones necesarias: entradas, salida esperada, reglas, errores y si participan en una transacción. Se acuerdan las firmas TypeScript que hagan falta para esa integración, sin crear interfaces genéricas para todas las clases.

José implementa SQL y pruebas de persistencia respetando esas firmas y el modelo vigente. El responsable funcional integra el repositorio en su módulo, ejecuta sus casos y comprueba las respuestas del contrato. Las solicitudes de esquema o índices se entregan a José; no se modifica una migración aplicada.

Para no acumular toda la API detrás de la base, se prepara persistencia por flujo pequeño: primero documentos/registro, después el siguiente caso priorizado. Se alternan entregas funcionales y de persistencia, y se detectan bloqueos antes de iniciar una rama larga.

## Flujos que atraviesan áreas

| Flujo                                   | Coordinador funcional             | Contribuciones e integración                                                                                                                                                                                                                                                                             |
| --------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro, aceptación y estado inicial   | Uzzi                              | José implementa persistencia y transacción; Rafael confirma las reglas del estado inicial ya fijadas en el contrato. La creación del estado inicial no requiere importar el flujo de juego dentro de autenticación. Cuenta, aceptaciones y estado inicial se confirman conjuntamente cuando corresponda. |
| Inicio, respuesta y aprobación de nivel | Rafael                            | José implementa los repositorios y bloqueos; Uzzi proporciona identidad y políticas públicas de acceso. Intento, economía y concesiones se confirman en una misma transacción.                                                                                                                           |
| Compra de vidas o evolución             | Rafael                            | José implementa recibo, movimientos, adquisición y bloqueo del estado en la misma conexión. El servicio funcional aplica elegibilidad, precios y beneficio completo.                                                                                                                                     |
| Cancelación de cuenta y ejecución ARCO  | Uzzi                              | Rafael proporciona cancelación de intento sin consumo; José proporciona revocación/purga transaccional, controles de eliminación y mantenimiento con acceso técnico separado. Archivos, terceros y respaldos se siguen por pasos confirmables.                                                           |
| Publicación y cambios administrativos   | Responsable funcional del recurso | José proporciona persistencia, ETag y auditoría atómica; Uzzi proporciona rol y confirmación reciente. La ruta `/admin` no reasigna todas las funcionalidades a una sola persona.                                                                                                                        |

El coordinador funcional abre una sola operación transaccional mediante la capacidad común de José. Todos los repositorios participantes reciben la misma conexión; ninguno confirma por separado ni abre una transacción anidada independiente. El contexto de actor procede del servidor y se establece en esa conexión.

Las llamadas a correo, almacenamiento o terceros se realizan fuera de la transacción SQL, con estado pendiente y reintentos según el flujo. La auditoría de una escritura administrativa forma parte de la confirmación SQL; no se sustituye por un log posterior.

La implementación de estos puntos públicos debe dejar dependencias en una dirección. Si dos módulos empiezan a importarse mutuamente, se revisa la ubicación de la coordinación antes de integrar. No se usa una dependencia circular como solución predeterminada.

## Ramas, revisión e integración

- `develop` es la base de las tareas y el destino de sus pull requests; `main` recibe versiones estables mediante una promoción coordinada.
- Una rama por funcionalidad o bloque coherente, acotado y revisable; se permanece en ella durante sus varios commits y correcciones. Ejemplos: `feat/jose-persistencia-registro`, `feat/uzzi-registro` o `feat/rafael-evaluacion-preguntas`.
- No abrir otra rama por cada commit, archivo, método, prueba o corrección de la misma PR. Cambiar solo por otro bloque, trabajo independiente en paralelo o urgencia coordinada. Una rama ya integrada no se reutiliza para un bloque nuevo; tampoco hay ramas personales permanentes con toda el área.
- Usar commits pequeños y `git add` con rutas explícitas. Revisar el diff antes del commit.
- Actualizar la rama con `develop` antes de terminar la revisión y resolver los conflictos en la rama de tarea. No sobrescribir el historial remoto de otros.
- José coordina la integración. El responsable funcional revisa los cambios que afecten a su área; los cambios de José también reciben revisión de Uzzi o Rafael. La revisión de infraestructura no convierte a otro integrante en escritor simultáneo de sus archivos.
- Las protecciones y revisiones automáticas se configuran y verifican por separado. Esta guía es un acuerdo de trabajo y no acredita reglas técnicas de GitHub. No se crea un CODEOWNERS con usuarios de GitHub supuestos.

### Commits dentro del bloque

Cada commit tiene un propósito concreto que pueda explicarse en una frase. Código y pruebas necesarias pueden confirmarse juntos. El tamaño se decide por coherencia y facilidad de revisión, sin una cuota de líneas, archivos o commits. No se fragmenta una implementación para dejar imports o pruebas deliberadamente rotos.

Usar mensajes claros en español con el formato `tipo(alcance): descripción`, por ejemplo `feat(auth): valida la solicitud y aceptación del registro` o `fix(auth): conserva los intentos de código incorrecto`. Evitar títulos como `cambios`, `update`, `avance` o `final final`.

Guardar avances lógicos y continuar en la misma rama. Un push puede compartir varios commits. Antes de confirmar, revisar `git status`, el diff y los archivos preparados mediante rutas explícitas; no mezclar trabajo ajeno ni reformateos globales. Comprobar lo afectado y ejecutar el conjunto pertinente antes de integrar.

Conservar la secuencia mediante **Create a merge commit** al integrar la PR. Evitar squash masivo o reescritura de historial compartido sin acuerdo. Las pruebas y documentación de revisión se agregan a esa misma rama y PR.

Cada PR indica problema, resultado, alcance, archivos compartidos, dependencias, cambios de contrato/esquema y comprobaciones realmente ejecutadas. Mientras falte una dependencia de integración, permanece en Draft.

## Criterio de entrega

La [entrega de persistencia del primer flujo jugable](../architecture/flujo-jugable-persistencia.md) concreta las ocho operaciones solicitadas por Rafael, sus repositorios SQL de José, el orden de integración y las dependencias de acceso de Uzzi. Incluye transacciones, idempotencia y pruebas SQL; los servicios públicos y HTTP se integran por su responsable funcional.

Para cerrar una funcionalidad: contrato respetado, autorización y titularidad probadas cuando aplican, reglas de negocio cubiertas, persistencia real integrada, transacción y auditoría comprobadas si corresponden, y errores/logs sin secretos. El responsable entrega también su documentación y atiende las pruebas de regresión afectadas.

Ejecutar build, lint, chequeo de tipos y las pruebas correspondientes con las herramientas vigentes del repositorio. Una entrega solo documental comprueba sus enlaces y coherencia de asignación; no declara pruebas de aplicación ejecutadas si no se ejecutaron.

## Primer trabajo paralelo

| Integrante | Primer bloque                                                                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| José       | Completar la arquitectura y las firmas comunes; acordar con Uzzi la persistencia de documentos/registro y con Rafael los contratos de contenido/estado. Preparar los repositorios iniciales y la coordinación transaccional. RDS se configura después de cerrar estos acuerdos. |
| Uzzi       | Definir el flujo de documentos/registro y las capacidades públicas de seguridad; preparar DTO, reglas y pruebas aisladas de ese primer flujo.                                                                                                                                   |
| Rafael     | Definir contratos de contenido y evaluación; implementar y probar la evaluación pura de un primer minijuego y las validaciones de composición de nivel.                                                                                                                         |

El objetivo es habilitar un flujo completo pequeño y, mientras tanto, mantener trabajo independiente verificable. Si una carga crece, se delega un bloque concreto con sus archivos y criterio de cierre; no se reparte silenciosamente la misma responsabilidad entre dos personas.
