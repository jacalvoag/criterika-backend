# Historial y detalle de intentos

Entrega de persistencia de José sobre develop después de PR #32. Rama `feat/jose-historial-intentos`. Este bloque no habilita rutas ni registra módulos funcionales incompletos.

## Capacidades

- `PostgresAttemptHistoryRepository.listOwned(tx, playerId, limit?, after?)`: metadatos propios con orden de inicio/UUID descendente y cursor `{ attemptId }` resuelto con precisión de PostgreSQL.
- `getOwned(tx, playerId, attemptId)`: reutiliza `GameplayRepository.findOwnAttempt`.
- `executionHistory(tx, playerId, attemptId)`: historial mínimo de ejecuciones, solo tras comprobar pertenencia, sin tableros, soluciones ni estado interno de juego.

## Integración y límites

Usar `TransactionRunner.read` y la identidad autenticada de security. Los resultados son internos: Rafael aplica la proyección del contrato. No se duplican inicio/cierre/heartbeat ni se recalculan recompensas. Un intento ajeno es indistinguible de uno inexistente al obtener detalle; un cursor ajeno o inexistente se rechaza. La capa HTTP protege el cursor y traduce los errores.

Los repositorios reciben un PoolClient; nunca abren conexiones ni confirman por su cuenta. Un resultado tipado del callback confirma efectos aceptados; lanzar revierte. Los relojes son del servidor. No registrar cuerpos, hashes, tokens, cifrados ni snapshots privados.

## Organización y pruebas

- `src/modules/gameplay/repositories/attempt-history.repository.ts`.

La suite `database/tests/lote-historial-intentos.integration.ts` reutiliza el arnés local desechable existente mediante `player-persistence.fixture.ts`. Requiere las URL PERSISTENCE_TEST_URL y PERSISTENCE_TEST_ADMIN_URL, loopback, base criterika_prueba_* y usuarios separados; reinicia sus datos. El login de aplicación pertenece solo a criterika_app. Los clasificadores/proyectores ficticios viven exclusivamente en pruebas, sin proveedor predeterminado de producción.

Los pequeños auxiliares comunes son idénticos entre las ramas independientes del lote; al integrarlas existe una sola copia de cada archivo compartido. No se modifican precios, migraciones, el esquema real de RDS ni archivos funcionales de otros integrantes.

Verificación independiente: 8 casos SQL de este bloque correctos con PostgreSQL 18.6 efímero y login limitado. La unión del lote pasó 362 casos de persistencia, 624 unitarias, 13 HTTP ordinarias y una HTTP de registro con PostgreSQL, además de compilación, tipos y lint. No se accedió a RDS ni a correo externo.
