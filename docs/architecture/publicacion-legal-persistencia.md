# Persistencia de administración y publicación legal

Entrega de José sobre `develop` después de la PR #31. Cubre consultas administrativas, creación/reemplazo de borradores y publicación transaccional. Reutiliza la migración 0001: no necesita aplicar DDL ni cambiar RDS. Las rutas, permisos y decisiones funcionales siguen en legal/security de Uzzi.

## Organización y firmas

| Archivo en `src/modules/legal/repositories/` | Responsabilidad |
| --- | --- |
| `admin-legal-read.repository.ts` | `PostgresAdminLegalReadRepository.get(tx,id)` y `list(tx,limit?,after?)`; proyección común para lectores/escritores. |
| `legal-draft.repository.ts` | `PostgresLegalDraftRepository.create(tx,input)` y `replace(tx,id,expectedVersion,input)`; solo borradores. |
| `legal-publication.repository.ts` | `PostgresLegalPublicationRepository.publish(tx,id,expectedVersion,requiresAcceptance,clock?)`; publicación y sustitución de vigente. |
| `legal-document.types.ts` | Entrada de borrador, snapshot administrativo interno y resultados de escritura. |
| `legal-document.input.ts` | Validación de persistencia y rango exacto de versión. |
| `legal-privacy.configuration.ts` | Configuración de privacidad compartida con registro y aceptaciones, sin duplicar su comprobación. |

El tipo `RegistrationPrivacyConfiguration` sigue exportándose desde el repositorio de registro para conservar sus consumidores. Registrar el publicador con una fábrica que le pase la configuración real; no intentar inyectar automáticamente una interfaz. No se agregan dependencias ni una nueva conexión.

Las escrituras devuelven `saved` con `document`, o `not_found`, `version_conflict`, `already_published`, `version_label_conflict`, `legal_configuration_missing`, `invalid_purposes` o `invalid_acceptance_policy`. Contexto, entrada, reloj o rango de versión inválidos generan errores controlados. Las colisiones normales de etiqueta no dejan abortada la transacción.

El snapshot incluye el contrato administrativo más `requiereAceptacion` y `vigente`, que son internos. `versionRecurso` es `bigint`, `publicadoEn` es `Date | null` y `sha256` es hexadecimal o nulo. Uzzi debe proyectar el DTO, retirar los dos campos internos, serializar fechas y convertir versiones con `safeInteger(version.toString())`, sin redondear. ETag fuerte: `"v<versionRecurso>"`.

## Borradores y catálogo de finalidades

La entrada respeta límites, tipos y finalidades necesarias de v1. Términos no llevan finalidades; un aviso puede prepararse incompleto, pero no publicarse sin ellas. Las propiedades desconocidas se rechazan. No se normalizan los bytes del contenido: espacios, Unicode y saltos de línea se conservan.

Las etiquetas son únicas por tipo. Un bloqueo de la etiqueta de destino precede al bloqueo de fila para que creación y reemplazo no compitan por el mismo nombre. El reemplazo exige la versión observada, incrementa el contador una vez y nunca modifica una revisión publicada. Al guardar finalidades se preserva su descripción presentada en esa revisión. Un código existente no cambia su descripción base ni su significado; los códigos nuevos se registran una vez y no se reciclan al retirar una finalidad de un borrador.

## Publicación y auditoría

Todas las operaciones administrativas usan `TransactionRunner.run` con actor `ADMINISTRADOR` verificado. Se reutiliza la comprobación de contexto administrativo habilitado; no autentica JWT ni comprueba `ADMIN_MANAGE`. La publicación exige además motivo de al menos diez caracteres en el contexto transaccional, consistente con `ReasonInput`.

El publicador toma el bloqueo exclusivo `criterika:legal:current:v1`, compañero del compartido que ya usan registro/aceptaciones. Después bloquea vigentes y borrador en orden de tipo/UUID, vuelve a comprobar versión/publicación y captura el instante del servidor. Los lectores administrativos toman primero el bloqueo de su cuenta administrativa; no adquirir cuentas de jugadores después del bloqueo legal.

La publicación exige configuración de responsable/canal/domicilio y un aviso con finalidades necesarias. `requiresAcceptance` es una decisión del servicio legal, nunca un campo adicional aceptado del cuerpo público. Se rechaza `false` para cambios contractuales, nueva finalidad o un aviso que añada códigos respecto al vigente, incluso si fue etiquetado editorial. Uzzi conserva la revisión semántica: reutilizar un código para otro significado no se detecta comparando cadenas, y un cambio editorial sin nueva finalidad no fuerza aceptación por defecto.

Se calcula SHA-256 sobre los bytes UTF-8 exactos del borrador. La vigente anterior del mismo tipo pasa a no vigente e incrementa su ETag, conservando texto, huella y fecha originales. El borrador se publica con fecha, huella, política y versión incrementada. El otro tipo de documento no cambia. No se republican revisiones históricas ni se crean aceptaciones retroactivas.

Cambio y evidencia administrativa se confirman juntos mediante los triggers existentes. Si falla la auditoría o cualquier parte de la transacción, se revierte también la retirada de la revisión anterior. No se elimina historial, no se levantan restricciones de privacidad y no se copian textos legales completos en el evento de auditoría.

## Integración pendiente para Uzzi

Registrar los proveedores en legal, validar DTO/cursor/UUID/If-Match, comprobar identidad, `ADMIN_MANAGE` y confirmación reciente de cinco minutos al publicar. La comprobación debe seguir siendo válida después de esperas por bloqueos y antes de confirmar; si vence o falla, lanzar el rechazo para revertir la operación. La fecha inyectable es del servidor, nunca del cliente.

Compartir cliente y transacción con idempotencia y su respuesta. El replay se resuelve antes de volver a escribir. El repositorio no confirma transacciones ni guarda respuestas HTTP; devolver un resultado tipado confirma los efectos aceptados del callback, mientras lanzar un error revierte. Traducir resultados a los errores ya definidos por el contrato.

El listado devuelve `{ items,nextPosition }`, con límite de 1–100 (20 por defecto) y orden técnico por UUID ascendente, estable ante cambios de etiqueta. `nextPosition: { documentId }` es interno: protegerlo como cursor opaco y vincularlo al contexto de consulta. Un ancla inexistente genera `AdminLegalPositionError`; la validación del formato y su traducción a `INVALID_CURSOR` pertenecen al adaptador HTTP. El cargador interno compartido no debe usarse para evitar la autorización.

## Pruebas

`borradores-legales.integration.ts` y `publicacion-legal.integration.ts` comparten solo el aprovisionamiento de prueba en `helpers/legal-publication.fixture.ts`. Usan las mismas URL locales desechables `PERSISTENCE_TEST_URL` y `PERSISTENCE_TEST_ADMIN_URL`, con roles separados y base `criterika_prueba_*`; reinician datos antes de cada caso. El login de aplicación pertenece únicamente a `criterika_app`.

Incluyen etiquetas/CAS concurrentes, bigint, datos inválidos, contenido publicado inmutable, finalidades, huella UTF-8, única vigente, edición contra publicación, publicación esperando una aceptación real, evidencia histórica preservada, motivo/autor y rollback por fallo de auditoría. No se prueban aquí los permisos HTTP ni se presenta el contexto SQL como sustituto de la autorización.

Verificado en PostgreSQL 18.6 efímero: 269 casos de persistencia, incluidos 43 nuevos, más una prueba HTTP de registro con PostgreSQL. También pasaron 624 unitarias, 13 HTTP ordinarias, build, tipos, lint y formato. No se accedió a RDS ni SMTP externos.
