# Persistencia de recuperación y cambio de contraseña

Entrega de José sobre `develop` después de la PR #29. `PostgresPasswordRepository` vive en `src/modules/auth/repositories/password.repository.ts` y proporciona la persistencia de `requestPasswordReset`, `resetPassword` y `changeMyPassword`. No habilita rutas ni modifica la migración 0001.

## Firmas para Uzzi

| Método | Resultado y responsabilidad |
| --- | --- |
| `findOwnedCredential(tx, authenticatedPlayerId)` | Hash interno de un jugador, o `null`. Recibe la identidad ya autenticada. Nunca es DTO, log ni caché pública. |
| `createRecovery(tx, input, clock?)` | Guarda enlace con verificador protegido y mensaje cifrado. `input` contiene `challengeId`, `accountId`, `verifierHash` y `encryptedMail`. Devuelve booleano interno. |
| `reset(tx, challengeId, verifierHash, newPasswordHash, clock?)` | Consume enlace y cambia credencial; devuelve `true`, o `false` genérico para enlace/cuenta no utilizable. |
| `changeOwned(tx, accountId, expectedPasswordHash, newPasswordHash, clock?)` | Devuelve `changed`, `credential_conflict` o `unavailable`. Compara bajo bloqueo el hash almacenado observado antes de verificar la contraseña actual. |

`createRecovery` y `reset` requieren contexto SQL `SISTEMA`; `changeOwned` exige `JUGADOR` del mismo titular. El contexto técnico es una defensa adicional, no una verificación de sesión o token. La lectura de credencial también necesita identidad confiable; no recibe un ID de destino elegido por el cliente.

## Secretos, enlaces y tiempo

El proveedor de auth genera un secreto aleatorio, calcula su verificador seguro de 32 bytes y cifra el mensaje necesario para reintentar correo. Aquí solo se aceptan esos bytes y el hash Argon2id, nunca contraseñas o tokens en texto plano. La comprobación sintáctica del hash no reemplaza al proveedor Argon2id ni valida sus costes: reutilizar `RegistrationPasswords`, cuya política ya está implementada y probada.

El token público de `ResetPasswordInput` sigue siendo un único valor opaco. Auth debe codificarlo/interpretarlo como handle de desafío más secreto y suministrar al repositorio el UUID y su verificador; no se añaden campos públicos al contrato. El formato del token y la protección criptográfica los implementa auth. Buscar por el handle utiliza la clave primaria; no se escanea una tabla buscando el secreto.

El destino se toma de la cuenta bloqueada, no de un correo arbitrario del cuerpo. Solo se emite/consume recuperación para cuentas habilitadas con correo confirmado. No se filtra por sanción de juego ni se cambia el rol: el contrato público no excluye a los administradores predefinidos. Si se necesita una política administrativa diferente, acordarla antes de habilitar las rutas.

La duración del enlace es exactamente diez minutos conforme al contrato. Los relojes predeterminados son del servidor, se capturan después de esperar los bloqueos y pueden inyectarse en pruebas. No aceptar fechas del cliente. Se exige `creado_en <= ahora < expira_en`, clase `ENLACE_RECUPERACION`, finalidad `RECUPERACION`, verificador coincidente y ausencia de uso previo. `estado_envio` no prueba posesión y no reemplaza la verificación del secreto.

## Transacción y concurrencia

Ejecutar las mutaciones con `TransactionRunner.run` y el mismo cliente que la idempotencia. Primero se bloquea la cuenta; después, el desafío. La consulta inicial de handle solo descubre la cuenta y no bloquea el desafío antes de ella. Dos enlaces de una misma cuenta compiten por ese bloqueo.

Una operación aceptada actualiza el hash y aumenta `cuentas.version` una vez, revoca todas las sesiones todavía no revocadas —incluida la actual—, borra su confirmación reciente e inutiliza todos los desafíos de finalidad `RECUPERACION` de la cuenta, eliminando su mensaje cifrado. Se conserva la fecha de uso original de los que ya estaban usados. No afecta a desafíos de registro, acceso administrativo u otras finalidades, ni a sesiones/enlaces de otra cuenta.

Estos efectos comparten transacción: un fallo al revocar sesiones o invalidar otros enlaces revierte también hash, versión y consumo del token. El repositorio no hace `BEGIN`, `COMMIT`, conexiones adicionales ni envíos de correo. Un resultado tipado/booleano se confirma al retornar del callback; lanzar un error revierte la transacción. Si se pierde la confirmación de COMMIT, aplicar la recuperación de idempotencia, sin repetir ciegamente una operación de resultado incierto.

Para cambiar la contraseña propia, auth/accounts lee el hash interno, verifica la contraseña actual e impide reutilizarla, usando el proveedor Argon2id. Deriva el nuevo hash fuera de los bloqueos SQL. Después vuelve a comprobar la sesión/política y llama a `changeOwned` pasando el hash que realmente verificó; si cambió mientras tanto, obtiene `credential_conflict`. Comparar solo dos hashes con sales distintas no demuestra que las contraseñas sean diferentes.

La creación de sesiones concurrentes debe bloquear la cuenta y volver a comprobar la credencial observada antes de insertar la sesión; el repositorio existente de inserción no realiza por sí solo esa autenticación. La rotación/revocación de sesiones existente ya toma primero el bloqueo de cuenta. Ninguna sesión nueva puede basarse en una contraseña verificada antes del cambio sin esa nueva comprobación.

Se respeta la política actual de auditoría: los triggers no generan eventos administrativos para actores `SISTEMA`/`JUGADOR`. No se copia el hash ni se suplanta al actor para crear un evento. La incorporación de nuevas clases de auditoría exige una decisión y una migración posterior.

## Integración pendiente

Uzzi integra validación, no enumeración (solicitud pública siempre con respuesta genérica), rate limit, formato/protección del token, comprobación Argon2id, permisos, idempotencia y rutas. `false`, `credential_conflict` y `unavailable` son resultados internos, no respuestas que revelen cuentas o credenciales.

El mensaje cifrado se guarda como `PENDIENTE`; todavía se necesita conectar el envío/reintento y su depuración de recuperación. El trabajador de registro existente procesa desafíos de registro, y no se da por hecho que envíe estos enlaces. Brevo y la prueba real de correo siguen pendientes de configuración. No enviar dentro de una transacción que aún pueda revertirse.

La ruta `/me/password` invalida su propia sesión: ante respuesta perdida, el contrato exige volver a iniciar sesión o recuperar por correo. No entregar una sesión nueva ni permitir replay autenticado con una sesión revocada solo porque haya una respuesta idempotente guardada. Mantener errores y logs sin tokens, contraseñas, hashes o mensajes cifrados.

## Pruebas

`database/tests/contrasenas.integration.ts` usa PostgreSQL local desechable, fixtures ficticios y login de aplicación limitado a `criterika_app`. Usa las mismas URL protegidas por loopback y nombre `criterika_prueba_*` de las otras suites; nunca apuntar a RDS. Se ejecuta con `npm run test:persistence`.

Comprueba uso único, límites temporales, clases/finalidades, pertenencia, cuentas no utilizables, recuperación administrativa sin cambio de rol, concurrencia de enlaces/cambio propio, hash observado obsoleto, revocación de sesiones y rollback con fallos reales de restricciones SQL en las tablas de la base desechable. Los cambios de restricciones se limitan a esa base desechable y se retiran al finalizar cada caso.

Verificación: build, TypeScript, lint y formato correctos; 624 pruebas unitarias, 13 HTTP ordinarias, 189 de persistencia (33 nuevas de contraseñas) y una HTTP de registro con PostgreSQL 18.6 efímero. También se comprobó la rotación concurrente de refresh y el vencimiento después de esperar un bloqueo real. No se accedió a RDS ni a SMTP externo.
