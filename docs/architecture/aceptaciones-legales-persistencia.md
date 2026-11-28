# Documentos publicados y aceptaciones posteriores al registro

Entrega de José sobre `develop` después de la PR #30. Cubre persistencia para consultar documentos publicados por versión, listar evidencias propias y registrar una nueva aceptación explícita. No agrega rutas HTTP ni administración/publicación de borradores; esas operaciones siguen en un bloque posterior. Reutiliza la migración 0001 sin modificaciones.

## Capacidades para Uzzi

| Operación | Capacidad disponible |
| --- | --- |
| `getLegalDocument` | Reutilizar `PostgresLegalRegistrationRepository.getPublishedDocument(tx, versionId)`. Devuelve la revisión publicada aunque ya no sea vigente; devuelve `null` para borrador o inexistente. |
| `listMyAcceptances` | `PostgresLegalAcceptanceRepository.listOwned(tx, authenticatedPlayerId, limit?, after?)`. Devuelve `{ items, nextPosition }`. |
| `createMyAcceptance` | `PostgresLegalAcceptanceRepository.createOwned(tx, authenticatedPlayerId, input, trustedIp, clock?)`. Devuelve `{ ok: true, value }` o un rechazo tipado. |

El nuevo repositorio recibe un `RegistrationLegalService` construido con el repositorio legal existente y su configuración operativa de privacidad. Registrar esos proveedores mediante la fábrica/composición de legal; no crear otra conexión ni duplicar la selección de documentos y las inserciones de registro.

`LegalAcceptanceSnapshot` contiene los campos de `Acceptance`: ID de evidencia, `usuarioId`, `aceptadaEn` como `Date`, IP individual, versiones de términos/aviso, ambas manifestaciones `true` y códigos de finalidad ordenados. La capa HTTP convierte la fecha a ISO UTC y protege estos datos personales; no registra la IP ni todo el snapshot en logs.

La lectura por versión reutilizada devuelve `PublishedRegistrationDocument`, una proyección interna con fecha y huella binaria. Uzzi debe construir el DTO `LegalDocument` del contrato, verificando la huella SHA-256 UTF-8 y proyectando sus finalidades; no devolver directamente el objeto interno ni aplicar a una revisión histórica la exigencia de ser vigente.

## Nueva aceptación

La identidad se obtiene de la sesión y el cuerpo se valida con `parseAcceptanceInput`, ya existente. No se aceptan campos de usuario, IP u hora en el cuerpo. Deben ser explícitos `aceptaTerminos` y `reconoceAvisoPresentado`, y los códigos de finalidad deben ser únicos. La IP se toma de la conexión/proxy confiable, se valida como IPv4/IPv6 individual y no admite rangos CIDR.

Dentro de `TransactionRunner.run` se exige contexto `JUGADOR` del mismo titular y se bloquea su cuenta. Se reutiliza `RegistrationLegalService.assertCurrentSelection` para validar versiones vigentes y finalidades necesarias/declaradas. El reloj del servidor se captura después de los bloqueos y se reutiliza `recordOriginalAcceptance` para insertar evidencia y finalidades con el mismo cliente. Una nueva manifestación agrega evidencia; nunca sobrescribe la anterior.

Los rechazos internos son `INVALID_ACCEPTANCE`, `INVALID_PURPOSES`, `LEGAL_VERSION_OUTDATED`, `LEGAL_CONFIGURATION_MISSING` y `ACCOUNT_UNAVAILABLE`. La configuración legal faltante falla de forma cerrada. IP/reloj inválidos o contexto SQL incorrecto generan `PersistenceInvariantError`. Uzzi traduce esos resultados a las respuestas del contrato; no filtrar errores SQL o contexto técnico.

El permiso de sesión, incluido el acceso con aceptación pendiente, pertenece a security/legal. Este repositorio no autentica JWT, no decide restricciones de juego ni levanta automáticamente restricciones de privacidad. Una nueva aceptación no borra oposiciones/revocaciones previas ni elimina su historial; cualquier levantamiento requiere el flujo funcional expresamente autorizado.

## Publicación y atomicidad

La comprobación vigente usa el bloqueo compartido de transacción `criterika:legal:current:v1` que ya utiliza el registro. El futuro publicador debe tomar su compañero exclusivo mediante `pg_advisory_xact_lock(hashtextextended('criterika:legal:current:v1',0))` antes de cambiar la selección, respetar el orden de filas legales y no adquirir cuentas de jugadores después de ese bloqueo. Las pruebas simulan ese protocolo con un operador en una base desechable; no acreditan que ya exista la API administrativa de publicación.

Una publicación confirmada antes de obtener el bloqueo obliga a volver a validar los IDs presentados y rechazar versiones obsoletas. Si se aceptan primero los documentos, el bloqueo compartido los conserva vigentes hasta confirmar la evidencia. La IP y el instante originales quedan asociados a esas revisiones, que siguen consultables al cambiar la vigencia.

Compartir transacción con idempotencia y la respuesta del caso de uso. Resolver el replay antes de insertar otra evidencia: dos intenciones distintas pueden producir dos aceptaciones, pero reintentar la misma intención no debe duplicarla. El repositorio no implementa por sí solo ese protocolo HTTP. Un fallo al insertar finalidades o confirmar la operación revierte todas las inserciones; no hay `COMMIT` interno ni conexiones adicionales.

## Historial y cursor

Usar `TransactionRunner.read` para resolver el ancla y la página bajo un mismo snapshot. El listado se limita a la cuenta suministrada y a rol jugador; el coordinador debe pasar siempre la identidad autenticada. Se ordena por instante y UUID descendentes, con límite de 1–100 (20 predeterminado).

`nextPosition` contiene únicamente `{ acceptanceId }` y es interno. La siguiente consulta resuelve su instante en PostgreSQL conservando microsegundos; no usa la fecha pública redondeada a milisegundos como clave. Un ancla ajena o inexistente produce `AcceptancePositionError`. Uzzi debe proteger el cursor opaco, ligarlo al titular y validar su formato antes de traducir errores a `INVALID_CURSOR`.

## Pruebas y cierre funcional

La suite `database/tests/aceptaciones-legales.integration.ts` usa PostgreSQL local desechable, fixtures ficticios y un login miembro solo de `criterika_app`. Las URL `PERSISTENCE_TEST_URL` y `PERSISTENCE_TEST_ADMIN_URL` deben apuntar a la misma base local `criterika_prueba_*`, con usuarios distintos; la suite reinicia sus datos. No usar RDS ni una base con datos a conservar.

Uzzi conserva la integración de las tres rutas, DTO/errores, autenticación, idempotencia, cursor público y pruebas HTTP. La administración/publicación legal y las aceptaciones del registro original mantienen sus alcances separados; no se modifica el flujo de registro existente.

Verificado: build, TypeScript, lint y formato correctos; 624 unitarias, 13 HTTP ordinarias, 226 pruebas de persistencia (37 nuevas de documentos/aceptaciones) y una HTTP de registro con PostgreSQL 18.6 efímero. Incluye publicación concurrente simulada con bloqueo real, captura del reloj tras espera, microsegundos, restricciones preservadas y rollback por fallo de finalidades. No se accedió a RDS ni SMTP externos.
