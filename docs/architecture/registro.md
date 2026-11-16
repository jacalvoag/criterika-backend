# Primer flujo: registro, aceptación y sesión

Acuerdo entre José (persistencia e infraestructura), Uzzi (coordinación funcional) y Rafael (revisión de valores iniciales de juego). Complementa la [arquitectura](backend.md) y el [reparto](../team/responsabilidades.md). No implementa los endpoints.

## Operaciones y significado del identificador

| Operación del contrato | Resultado |
| --- | --- |
| `GET /api/v1/legal/documents/current` | 200 con `CurrentLegalDocuments`; 503 `LEGAL_CONFIGURATION_MISSING` si faltan documentos/configuración reales. |
| `POST /api/v1/auth/registrations` | 202 con `Challenge`; todavía no existe una cuenta activa. |
| `POST /api/v1/auth/registrations/{registrationId}/resend` | 202 con `Challenge`; invalida el código anterior y conserva el límite absoluto del pendiente. |
| `POST /api/v1/auth/registrations/{registrationId}/verify` | 201 con `PlayerSession` cuando se crea la nueva cuenta y su sesión. |

En estas rutas de registro, **`Challenge.id` es `registrationId`**, es decir, el UUID de `registros_pendientes`. El cliente lo utiliza en las rutas de reenvío y verificación. El UUID de la fila de `desafios_verificacion` es interno y cambia al reenviar; no sustituye al identificador del registro. Esta convención concreta la relación entre las rutas y el schema existente, sin agregar propiedades HTTP.

Las tres operaciones POST requieren `Idempotency-Key`. Los nombres y restricciones de `RegistrationInput`, `AcceptanceInput`, `CodeInput`, `Challenge` y `PlayerSession` proceden del [YAML](../openapi/criterika_openapi_v1.yaml); no se define otro DTO HTTP en este documento.

## Capacidades que se entregan

Las [firmas TypeScript](registration-contracts.ts) son acuerdos de implementación verificables por compilación. Solo declaran tipos y métodos; no simulan persistencia. `src/` nunca importa desde `docs/`. Al implementar, cada firma se traslada al módulo responsable y el documento pasa a referenciar esa fuente para evitar mantener dos versiones divergentes.

| Capacidad | Responsable | Quién la utiliza |
| --- | --- | --- |
| `TransactionRunner.run(context, work)` | José | Coordinador de registro de Uzzi; entrega un `PoolClient` y la hora de transacción. |
| `RegistrationRepository` | José, dentro de `auth/repositories/` | Servicio de registro de Uzzi. |
| `LegalRegistrationRepository` | José, privado de `legal` | `LegalService`, implementado por Uzzi. |
| `AccountRegistrationRepository` | José, privado de `accounts` | `AccountsService`, implementado por Uzzi. |
| `PlayerSessionRepository` | José, privado de `security` | Capacidad de sesiones de Uzzi. |
| `IdempotencyRepository` | José, privado de la capacidad común | Servicio común de idempotencia de José. |
| Hash de contraseña, códigos y preparación de tokens | Uzzi, en `security` | Registro/acceso; los secretos en claro permanecen únicamente en memoria durante su preparación. |
| Protección de respuestas/mensajes y transporte de correo | José | Registro y emisor interno, mediante sus capacidades técnicas acordadas. |

El coordinador de registro invoca los servicios públicos de `legal`, `accounts` y `security`, pasándoles `tx`. No importa sus repositorios privados. Los métodos de repositorio de las firmas indican lo que José implementa detrás de esas capacidades.

El resultado funcional es éxito o rechazo con código estable. El adaptador común de idempotencia utiliza el mapeo HTTP de esa operación para proteger y confirmar la representación recuperable antes del commit; el controlador la entrega después. El servicio no necesita objetos Request/Response para producir ese resultado.

Los métodos públicos mínimos son `LegalService.assertCurrentSelection(tx, selection)`, `LegalService.recordOriginalAcceptance(tx, accountId, acceptance)`, `AccountsService.createVerifiedPlayer(tx, input)` y `PlayerSessionsService.issueForNewPlayer(tx, accountId, at)`. Sus entradas utilizan los tipos del acuerdo. La primera compara las versiones y finalidades; la última prepara tokens en memoria y persiste solo el verificador de refresh antes de devolver la representación de sesión al coordinador.

La capacidad de sesiones devuelve `PreparedPlayerCredentials`, sin perfil. `accounts` construye el perfil inicial con los datos verificados y el resultado del alta; `auth` combina ambos para producir `PlayerSession`. `security` no importa `accounts` para construir ese perfil, evitando la dependencia circular descrita en la arquitectura.

Para la consulta inicial, `LegalService.getCurrentDocuments()` obtiene la selección vigente y los dos documentos publicados y los convierte a `CurrentLegalDocuments`. Una configuración operativa incompleta o un documento no publicado no se sustituye por un texto de ejemplo. En Nest las interfaces TypeScript no son tokens de inyección en runtime: el módulo compone las clases concretas o un token explícito acordado junto a su contrato.

## Responsabilidad de cada método de persistencia

| Método | Semántica acordada |
| --- | --- |
| `createPending` | Inserta datos validados, hash de contraseña, versiones, finalidades e IP/hora originales. No crea cuenta, sesión ni premio. |
| `findPendingForUpdate` | Bloquea el pendiente. Devuelve su expiración y `cuenta_creada_id`; no oculta un pendiente completado como si fuera nuevo. |
| `findLatestChallengeForUpdate` | Devuelve y bloquea el último código de ese registro, incluyendo caducidad, consumo e intentos. Selección determinista; no busca el código enviado en texto plano. |
| `createChallenge` | Inserta un código de finalidad REGISTRO y clase CODIGO; verificador seguro, mensaje cifrado y estado de envío PENDIENTE. |
| `invalidatePreviousCodes` | Invalida códigos anteriores del registro y elimina su mensaje recuperable; participa en la misma transacción del reenvío. |
| `incrementFailedAttempts` | Incremento atómico bajo bloqueo, hasta el máximo cinco; devuelve el contador resultante y no provoca un sexto valor incompatible con el CHECK. |
| `consumeChallenge` | Marca un uso dentro de la confirmación. No reactiva un código consumido. |
| `markCompleted` | Vincula el pendiente con la cuenta creada; impide volver a tratarlo como registro nuevo. |
| `getCurrentForShare` | Obtiene versiones publicadas vigentes y finalidades, con bloqueos compatibles con su lectura y que impidan confirmar una publicación incompatible simultánea. Reevalúa vigencia después de esperar un bloqueo. |
| `getPublishedDocument` | Recupera una versión publicada con contenido, huella y finalidades; devuelve null para un identificador ausente o un borrador. No obtiene PII ni permite modificar el texto publicado. |
| `createAcceptance` | Inserta aceptación y finalidades específicas, con los valores originales del pendiente. Las manifestaciones true ya fueron exigidas al captar el registro. |
| `createVerifiedPlayer` | Crea cuenta JUGADOR y estado inicial conjuntamente. Devuelve `email_in_use` de forma controlada si el correo ya está ocupado, sin actualizar esa cuenta ni dejar la transacción inutilizable por una excepción de unicidad no manejada. |
| `PlayerSessionRepository.create` | Inserta la sesión revocable con hash del refresh y vencimiento absoluto. No almacena access JWT ni refresh en claro. |
| `claimOrLoad` / `confirm` | Reserva o recupera una intención única; contrasta huella y conserva la respuesta protegida en la misma confirmación que sus efectos. |

Los timestamps y binarios internos utilizan `Date` y `Uint8Array`. José convierte a los tipos de `pg`, incluidos `bytea`, `inet`, `date` y `timestamptz`. Los datos recibidos del driver se validan/convierten; no se da por hecho que un `bigint` de PostgreSQL sea un número JavaScript. Uzzi produce fechas RFC3339 UTC y los tipos de respuesta del contrato en el borde HTTP.

El pendiente solo conserva `correo_normalizado`; la cuenta nueva usa ese valor también como `correo_presentacion`. No se presume que se haya conservado una capitalización original que la tabla pendiente no almacena. La normalización respeta la política del contrato, sin reglas especiales de proveedores de correo.

## Inicio del registro

1. Uzzi valida el schema, elegibilidad de edad, correo y manifestaciones explícitas. Captura la IP confiable y la hora original del servidor. La fecha de nacimiento se trata como fecha de calendario, no se desplaza por zona horaria.
2. Se obtiene la huella protegida de la solicitud normalizada antes de generar un hash de contraseña con salt aleatorio. El mismo cuerpo no debe parecer diferente por producir otro hash Argon2id en un reintento.
3. La contraseña se convierte a Argon2id antes de mantener bloqueos SQL. El código se genera mediante un mecanismo criptográficamente seguro; su verificador y el mensaje de envío se protegen mediante las capacidades acordadas.
4. Bajo contexto SISTEMA, el coordinador reserva idempotencia, valida las versiones/finalidades actuales, guarda pendiente y código, y confirma la respuesta 202 protegida. Un documento desactualizado devuelve 409 `LEGAL_VERSION_OUTDATED`; faltas de configuración devuelven 503 `LEGAL_CONFIGURATION_MISSING`.
5. El emisor continúa fuera de esa transacción. 202 acredita admisión del trámite, no entrega garantizada en el buzón. Un envío pendiente/error es recuperable hasta su caducidad.

Una solicitud con correo existente recibe una respuesta genérica equivalente. El diseño no utiliza una diferencia pública de resultado para enumerar cuentas; puede crear un trámite temporal y enviar una comprobación del destino sin que esa comprobación se convierta en inicio de sesión de una cuenta existente. Nunca reemplaza su contraseña o perfil. Si al confirmar el alta el correo está ocupado, no se crea otra cuenta ni se emite una sesión de la cuenta anterior.

Aunque la propiedad HTTP se denomine `consienteFinalidadesIds`, contiene códigos estables de finalidad, no UUID: se traduce a `purposeCodes` y a `finalidad_codigo`. Se exige que sean únicos, pertenezcan al aviso presentado e incluyan las finalidades necesarias. La normalización conserva la contraseña literalmente; no aplica trim ni normalización de Unicode a ese secreto.

Pendiente: máximo 24 horas. Código: 10 minutos y máximo cinco intentos. Reenvío: al menos 60 segundos. La verificación exige cumplir tanto la ventana del código como la del pendiente; generar otro código nunca amplía el vencimiento absoluto del registro.

## Reenvío

El coordinador de Uzzi recupera idempotencia, bloquea el pendiente y su código actual, comprueba que el trámite siga pendiente y vigente y aplica el límite de reenvío. En la misma transacción invalida códigos previos, registra el nuevo verificador/mensaje y guarda el resultado 202. La evidencia de aceptación y el identificador del registro se conservan.

Una misma intención de reenvío recuperada no genera otro código. El worker revalida vigencia/consumo antes de enviar y utiliza el mensaje ya preparado; un reintento de entrega no genera un código nuevo.

## Confirmación de registro

1. Recuperar la intención idempotente y bloquear pendiente/código. Un replay autorizado se recupera antes de volver a tratar el código consumido como una nueva verificación.
2. Comprobar que no esté completado, que ambas ventanas sigan vigentes y que el código corresponda al registro, propósito y número de intentos permitidos. El correo verificado no permite entrar a una cuenta distinta o anterior.
3. Si el código es incorrecto, incrementar y guardar el contador una sola vez por intención. Confirmar el rechazo esperado y después devolver 401 `CODE_INVALID`; no lanzar una excepción que revierta ese incremento. Un código vencido produce `CODE_EXPIRED` y uno consumido no vuelve a funcionar.
4. Verificar y bloquear las versiones legales pertinentes. Si cambiaron, devolver 409 `LEGAL_VERSION_OUTDATED` y exigir un nuevo registro/aceptación explícita; no asignar silenciosamente versiones nuevas al pendiente.
5. Crear la cuenta JUGADOR y su estado inicial mediante `accounts`. Un correo ocupado se traduce a un conflicto controlado del flujo; no se convierte en recuperación de cuenta ni permite iniciar sesión.
6. Vincular la aceptación usando exactamente IP, hora, versiones y finalidades de la manifestación original; marcar código consumido y pendiente completado.
7. `security` prepara la sesión y los tokens y persiste el verificador de refresh. El coordinador guarda la representación 201 cifrada para recuperación y confirma toda la operación.

Un error técnico antes de confirmar revierte cuenta, estado, aceptación, sesión y marcas de consumo. Dos verificaciones concurrentes no producen dos altas o premios: los bloqueos del pendiente/código, la unicidad del correo y la idempotencia forman parte de la comprobación de integración.

## Valores iniciales y sesión

| Dato | Valor |
| --- | --- |
| Rol | JUGADOR |
| Situación operativa de cuenta | HABILITADA |
| Gemas / XP | 0 / 0 |
| Vidas totales | 5 |
| Próxima regeneración | NULL, porque las vidas ya están al máximo |
| Último día / contador de racha | NULL / 0 |
| Zona inicial | Etc/UTC |
| Carta, evolución o recompensa de registro | Ninguna |
| Sesión de jugador | Hasta 30 días absolutos; access hasta 900 segundos |

Rafael revisa estos valores frente al contrato, pero el registro no espera una implementación de gameplay ni importa ese módulo para crear el estado inicial. La fecha/hora de confirmación del correo y creación de la cuenta son distintas de la fecha original de aceptación.

## Idempotencia y protección de datos

El ámbito público usa datos protegidos del trámite/intención; no basta con una IP compartida ni con conocer el correo para recuperar secretos. La huella es protegida con clave del servidor y se valida contra el mismo contenido normalizado. Misma clave y cuerpo diferente: 409 `IDEMPOTENCY_KEY_REUSED`; intención aún no recuperable: 409 `REQUEST_IN_PROGRESS`.

Las respuestas ordinarias tienen la ventana de recuperación de 24 horas acordada; una respuesta con tokens solo se conserva protegida durante cinco minutos. El vencimiento de recuperación no renueva access, refresh, pendiente o código. Después de esa ventana no se emiten otra sesión o tokens solo por repetir la verificación ya completada; se aplica el conflicto del flujo y el usuario utiliza el acceso normal si necesita otra sesión.

Al recuperar una respuesta sensible, se comprueban sus vínculos de cuenta/sesión y que su acceso siga permitido; una sesión revocada o una cancelación no se eluden mediante replay. Los campos `accountId` y `sessionId` del control se usan para esa validación y depuración.

Contraseña, código, tokens y mensaje de correo no se guardan en claro en PostgreSQL, logs o auditoría. El emisor descifra el mensaje únicamente para enviarlo y José elimina el contenido recuperable al enviarlo o caducar; la protección de respuestas usa claves fuera de la BD. Los errores del proveedor se normalizan sin copiar destinatarios, cuerpos o credenciales.

## Orden de entregas y aceptación

1. José: `TransactionRunner`, protección/idempotencia y repositorios mínimos; Uzzi: tipos, validación, capacidades de identidad y reglas aisladas. Las firmas no son repositorios disponibles en producción.
2. Uzzi y José: documentos e inicio/reenvío con persistencia real y emisor confirmado. Las pruebas de proveedores usan dobles solo en pruebas.
3. Uzzi y José: confirmación atómica, sesión y recuperación segura. Rafael confirma el estado inicial y continúa sus reglas de minijuegos.

Para cerrar el flujo se comprueba: esquema HTTP; falta/cambio de documentos; IP/hora originales; pendiente sin cuenta activa; código incorrecto con contador persistido; vencimiento, consumo y reenvío; no enumeración de cuentas; dos verificaciones simultáneas; fallo de inserción intermedia; estado inicial exacto; error/reintento de correo; replay de éxito/error sin duplicación y rechazo de replay revocado; expiración de la recuperación de tokens; ausencia de PII/secretos en errores y logs. Son pruebas por implementar, no resultados ejecutados en esta entrega.
