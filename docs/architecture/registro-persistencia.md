# Persistencia e infraestructura del registro

Entrega de José sobre `develop` `fc209ff`, después de integrar la PR #19 de Uzzi.
Implementa las dependencias concretas del registro sin modificar la migración
`0001_inicial`, sus permisos ni los servicios funcionales de Uzzi. No aplica
cambios ni carga fixtures en RDS.

## Qué puede integrar Uzzi

Importar `RegistrationInfrastructureModule` desde el módulo que declare los
controladores del registro. El módulo compone las clases funcionales existentes
con sus repositorios y proveedores reales. No volver a declarar esas clases con
dobles ni registrar una segunda conexión.

| Capacidad pública exportada     | Uso                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `RegistrationCommands`          | Inicio, reenvío y confirmación existentes de Uzzi.                                         |
| `RegistrationPasswords`         | Argon2id asíncrono; ejecutar antes de tomar bloqueos SQL.                                  |
| `PublicRegistrationIdempotency` | Huella HMAC del cuerpo normalizado, antes del hash con salt aleatorio.                     |
| `RegistrationUnitOfWork`        | Reserva/replay público, bloqueos, callback y confirmación atómica.                         |
| `RegistrationLegalReader`       | Documentos vigentes mediante una instantánea READ ONLY, sin `FOR SHARE`.                   |
| `RegistrationMailWorker`        | Envío y reintento interno del material protegido ya confirmado.                            |
| `REGISTRATION_SETTINGS`         | Política de fecha y configuración validada, exportada mediante el módulo de configuración. |

Los repositorios son privados de sus módulos; sus implementaciones están en
`src/modules/{auth,legal,accounts,security}/repositories/registration*.ts`.
Respetan las interfaces que Uzzi publicó en sus servicios. Los contratos de
`docs/architecture/registration-contracts.ts` son el acuerdo histórico; las
firmas ejecutables vigentes son las de `src/`.

`AppModule` sigue sin activar las rutas del registro. La integración HTTP,
validación del borde, límites de solicitudes e IP de proxy confiable pertenecen
a Uzzi. Esta entrega deja las dependencias conectadas y verificadas en Nest;
no acredita las cuatro rutas HTTP como terminadas.

## Secuencia de una operación pública

1. Validar cuerpo, UUID e `Idempotency-Key` con los parsers existentes. Para
   inicio, usar `Etc/UTC` y `FEBRUARY_28`, según la propuesta documentada para
   esta versión. La edad mínima sigue siendo 18 años. La fecha de nacimiento es
   una fecha de calendario. Se mantienen correos ASCII sin comillas.
2. Construir `{ key, route }`. Las rutas admitidas son exactamente
   `/api/v1/auth/registrations` y
   `/api/v1/auth/registrations/{UUID}/resend|verify`, con UUID canónicos en
   minúsculas. La clave debe ser un UUID aleatorio por intención.
3. Calcular `fingerprint(intention, normalizedBody)`. Para inicio, el cuerpo
   incluye la contraseña original, sin trim ni normalización Unicode, y los
   datos legales normalizados; ordenar los códigos de finalidad como conjunto.
   No incluir el hash Argon2id, IP ni horas generadas por el servidor. No aceptar
   una huella proporcionada por el cliente. Persistencia guarda solo HMAC.
4. Para inicio, generar el hash con `RegistrationPasswords.hash` fuera de la
   transacción. Conservar la aceptación original capturada en el servidor.
5. Llamar a `RegistrationUnitOfWork.execute(intention, fingerprint, callback)`.
   Para una intención nueva prepara los bloqueos de pendiente/código/documentos
   correspondientes, antes de invocar el callback. Este recibe `tx` y `clock`.
   Inicio llama a `commands.start(tx, input, clock())`; reenvío y verificación
   pasan `clock` a los métodos existentes. Todos usan ese mismo `tx`.
6. El callback convierte el resultado funcional al contrato HTTP y retorna
   `{ status, body }`. Los rechazos esperados también se retornan: así se
   confirman contadores de código incorrecto. Las excepciones técnicas revierten
   el conjunto. El borde HTTP entrega el resultado después del commit.
7. Una confirmación 201 con tokens debe añadir
   `sessionBinding: { accountId, sessionId }`, obtenidos del servicio y de la
   sesión recién creados, nunca del cuerpo del cliente. La infraestructura
   rechaza una respuesta con tokens sin vinculación o con IDs incompatibles.

El adaptador devuelve estos resultados; Uzzi aplica el mapeo del contrato:

| `kind`                | Tratamiento                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `EXECUTED` / `REPLAY` | Entregar `status` y `body` originales, sin recalcular ni volver a emitir tokens.                                 |
| `MISMATCH`            | 409 `IDEMPOTENCY_KEY_REUSED`.                                                                                    |
| `IN_PROGRESS`         | 409 `REQUEST_IN_PROGRESS`.                                                                                       |
| `EXPIRED`             | La respuesta ya no es recuperable. No repetir el callback ni emitir otra sesión; aplicar el conflicto del flujo. |
| `REPLAY_DENIED`       | La recuperación sensible ya no está permitida. No entregar tokens; aplicar el rechazo de acceso del contrato.    |

Los ejemplos ejecutables de esta composición están en
`database/tests/registro.integration.ts`, incluyendo `verify` y las carreras.
No pasar `RegistrationCommands` directamente al controlador sin esta adaptación.

## Idempotencia y recuperación protegida

La intención pública se identifica mediante HMAC de ruta y clave aleatoria; su
huella contrasta el cuerpo normalizado completo. Ni correo, IP ni el UUID del
registro por sí solos permiten recuperar una respuesta. El cliente debe repetir
la intención y el mismo cuerpo, incluido el código en confirmación. Los límites
públicos de intentos/solicitudes siguen siendo obligatorios en las rutas.

Las respuestas se cifran con AES-256-GCM, vinculadas a su ID. Inicio/reenvío y
rechazos ordinarios conservan la ventana de 24 horas. Un éxito con tokens tiene
cinco minutos de recuperación; el límite vuelve a comprobarse después de esperar
los bloqueos. La recuperación bloquea cuenta y sesión, comprueba vinculación,
revocación, caducidad, situación operativa, edad y restricciones/sanciones. Esta
comprobación no sustituye la autorización general que Uzzi mantiene para el resto
de rutas.

Al vencer se niega el replay y se conserva la marca de intención; no se elimina
para tratarla como nueva. `pruneExpiredResponses` elimina ciphertexts caducados
en lotes. La retención y purga general de metadatos corresponde a la tarea de
mantenimiento; no debe borrar prematuramente una marca que todavía evita
repetir efectos. Una confirmación posterior con otra clave encuentra el pendiente
completado y no crea otra sesión.

No hay reintentos automáticos del callback ante un COMMIT incierto. Repetir la
misma intención permite recuperar una operación que sí llegó a confirmar.

## Documentos y reloj

`RegistrationLegalReader.getCurrentDocuments()` utiliza
`TransactionRunner.read`: versiones, textos y finalidades pertenecen a una misma
instantánea. Los comandos usan `getCurrentForShare`; no ejecutar esa operación
con bloqueos dentro de `read`.

La selección legal toma el bloqueo asesor transaccional compartido
`hashtextextended('criterika:legal:current:v1', 0)`, bloquea revisiones publicadas
en orden estable y relee vigencia después de esperar. La futura publicación de
Uzzi debe tomar **el bloqueo exclusivo del mismo nombre antes de modificar la
selección**, en su misma transacción. Esto cubre también publicaciones de filas
nuevas; no basta bloquear únicamente los documentos antes vigentes.

Falta de documentos publicados, finalidades o configuración del responsable
produce `LEGAL_CONFIGURATION_MISSING` en el servicio; el GET lo mapea a 503.
No se generan textos legales sustitutos. La configuración de privacidad puede
estar vacía para conservar ese rechazo funcional; las claves y proveedores
activados sí se validan al componer el módulo.

La aceptación conserva IP, fecha, versiones y finalidades originales. La fecha de
creación/confirmación de cuenta y sesión es la de la operación, independiente de
la aceptación. La infraestructura prepara los bloqueos antes del callback para
que el reloj de Uzzi no se capture antes de una espera.

## Configuración

Requiere Node.js >=24.7; se probó con 24.22.3. `node:crypto.argon2` genera PHC
Argon2id v19 con memoria 65536 KiB, tres pasadas, un carril, salt aleatorio de 16
bytes y salida de 32 bytes. El secreto se conserva literalmente. `verify` admite
este perfil de parámetros; una futura actualización de costos requiere ampliar
la verificación/migración de hashes conscientemente.

Se añade `@nestjs/mail` 0.0.2 para SMTP. No se añade ORM ni otro pool.

Completar las variables de `.env.example` solo en el entorno privado:

| Variable                                                                      | Requisito                                                                                                                        |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `IDEMPOTENCY_HMAC_KEY_BASE64`                                                 | Clave aleatoria de 32 bytes.                                                                                                     |
| `IDEMPOTENCY_ENCRYPTION_KEY_BASE64`                                           | Otra clave de 32 bytes, cifrado de respuestas.                                                                                   |
| `REGISTRATION_CODE_HMAC_KEY_BASE64`                                           | Otra clave de 32 bytes, verificador de códigos.                                                                                  |
| `REGISTRATION_MAIL_KEY_BASE64`                                                | Otra clave de 32 bytes, cifrado de mensajes.                                                                                     |
| `JWT_PRIVATE_KEY_FILE`                                                        | Ruta al PEM RSA privado de al menos 2048 bits.                                                                                   |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_KEY_ID`                                    | Identificadores que también utilizará el verificador de acceso de Uzzi.                                                          |
| `SMTP_URL`                                                                    | URL `smtp://` o `smtps://`; credenciales percent-encoded. STARTTLS es obligatorio sin TLS implícito y se verifican certificados. |
| `MAIL_FROM`                                                                   | Dirección del remitente autorizada por el proveedor.                                                                             |
| `PRIVACY_RESPONSIBLE_NAME`, `PRIVACY_CONTACT_EMAIL`, `PRIVACY_POSTAL_ADDRESS` | Datos reales del responsable antes de admitir registros reales.                                                                  |

Generar cada clave simétrica por separado con
`node:crypto.randomBytes(32).toString('base64')`. Mantenerlas estables entre
procesos del despliegue y durante la vigencia de verificadores/respuestas. No
compartir la misma clave entre propósitos ni subir valores/PEM al repositorio.

La firma es RS256 con `kid`, `iss`, `aud`, `sub`, `sid`, `rol`, `iat` y `exp`.
El access dura 900 segundos. Uzzi debe fijar algoritmo, emisor y audiencia en el
verificador, y comprobar la sesión revocable en cada operación. El refresh
opaco y su hash SHA-256 conservan el formato de su servicio de sesiones.

## Envío y depuración interna

Tras confirmar SQL, se puede invocar `RegistrationMailWorker.drain(limit)` desde
un proceso interno. También se entrega el comando, por lotes de hasta 100:

```bash
npm run registration:mail -- 20
```

El comando construye las dependencias, procesa el lote, depura respuestas vencidas
y cierra conexiones. Emite únicamente contadores. El proceso o programador de
trabajos del despliegue debe ejecutarlo periódicamente; esta entrega no instala
un cron ni da por configurado un proveedor de correo remoto.

El emisor toma un lease asesor de sesión por registro, revalida pendiente/código
y envía **sin una transacción SQL abierta**. Reenvío/confirmación toman el lease
transaccional compañero antes de bloquear el pendiente. Dos emisores no envían el
mismo código simultáneamente. Hay límites de tiempo de red; un fallo queda ERROR
con el mismo material protegido, y no genera otro código. Al enviar, consumir,
invalidar o caducar se elimina ese material. SMTP puede aceptar un mensaje y
perderse su confirmación: no se promete entrega exactamente una vez. Los reintentos
usan el mismo Message-ID y el mismo código.

## Pruebas y límites

Seguir la preparación de base local desechable y dos logins de
[la guía del juego](flujo-jugable-persistencia.md#pruebas-reproducibles). Las suites
comparten `PERSISTENCE_TEST_ADMIN_URL` y `PERSISTENCE_TEST_URL`, rechazan servidores
remotos y vacían las tablas de la base `criterika_prueba_*` antes de cada caso.

```bash
npm ci
npm run build
npx tsc --noEmit
npm run lint
npm test
npm run test:e2e
npm run test:persistence
```

La prueba de composición requiere además las variables de configuración del
registro, apuntando a la base local de pruebas y a claves/configuración
**ficticias**. El fixture `02_registro.sql` es exclusivamente de prueba. La prueba SMTP requiere `openssl` en PATH y genera un par TLS temporal, que elimina
inmediatamente después de cargarlo en memoria. No se versionan claves privadas.

El [informe de verificación](../../database/tests/informe_persistencia_registro.md)
registra lo ejecutado. Los controladores, pruebas HTTP del registro, límites de
solicitudes, configuración del proveedor remoto y publicación productiva de
textos legales siguen a cargo de la integración correspondiente. El esquema RDS
existente sirve para esta entrega; no hay migración nueva que ejecutar.

Referencias técnicas: [Argon2 de Node](https://nodejs.org/api/crypto.html#cryptoargon2algorithm-parameters-callback)
y [correo de Nest](https://docs.nestjs.com/application/mail).
