# Persistencia de desafíos administrativos

Entrega de persistencia de José sobre develop después de PR #32. Rama `feat/jose-desafios-admin`. Este bloque no habilita rutas ni registra módulos funcionales incompletos.

## Capacidades

- `PostgresAdminChallengeRepository.create(tx, accountId, observedPasswordHash, challengeId, secret, clock?)`: solo una de las tres cuentas administrativas confirmadas y habilitadas, después de que auth verifique la contraseña. Invalida los desafíos administrativos anteriores de la cuenta.
- `resend(tx, challengeId, secret, clock?)`: respeta sesenta segundos, reemplaza el verificador/cifrado y vence el nuevo código en diez minutos. Un desafío quemado o vencido no se reenvía.
- `consume(tx, challengeId, verifier, clock?)`: cinco fallos persistidos, consumo único, borrado del mensaje cifrado y resultado genérico `invalid`, o `verified` con identidad interna.

## Integración y límites

Todas las operaciones usan contexto `SISTEMA`. El verificador tiene 32 bytes; el mensaje se recibe cifrado y nunca se registra. Auth genera/verifica códigos y entrega siempre errores públicos genéricos. Un rechazo por código incorrecto debe retornar como resultado tipado del callback para confirmar su contador; lanzar revierte también ese contador. Verificación y creación de sesión administrativa deben compartir transacción: solo después de consumir se crea la sesión con límite absoluto de ocho horas, y JWT/cookies pertenecen a Uzzi. Esta entrega no envía correo ni supone que el trabajador de registro atienda LOGIN_ADMIN. La recuperación de contraseña administrativa invalida también sus desafíos de acceso pendientes; se conserva el aislamiento respecto de otras finalidades de jugadores.

Los repositorios reciben un PoolClient; nunca abren conexiones ni confirman por su cuenta. Un resultado tipado del callback confirma efectos aceptados; lanzar revierte. Los relojes son del servidor. No registrar cuerpos, hashes, tokens, cifrados ni snapshots privados.

## Organización y pruebas

- `src/modules/auth/repositories/admin-challenge.repository.ts`.

La suite `database/tests/lote-desafios-admin.integration.ts` reutiliza el arnés local desechable existente mediante `player-persistence.fixture.ts`. Requiere las URL PERSISTENCE_TEST_URL y PERSISTENCE_TEST_ADMIN_URL, loopback, base criterika_prueba_* y usuarios separados; reinicia sus datos. El login de aplicación pertenece solo a criterika_app. Los clasificadores/proyectores ficticios viven exclusivamente en pruebas, sin proveedor predeterminado de producción.

Los pequeños auxiliares comunes son idénticos entre las ramas independientes del lote; al integrarlas existe una sola copia de cada archivo compartido. No se modifican precios, migraciones, el esquema real de RDS ni archivos funcionales de otros integrantes.

Verificación independiente: 11 casos SQL de este bloque correctos con PostgreSQL 18.6 efímero y login limitado. La unión del lote pasó 362 casos de persistencia, 624 unitarias, 13 HTTP ordinarias y una HTTP de registro con PostgreSQL, además de compilación, tipos y lint. No se accedió a RDS ni a correo externo.
