# Consultas de economía y progreso

Entrega de persistencia de José sobre develop después de PR #32. Rama `feat/jose-consultas-economia`. Este bloque no habilita rutas ni registra módulos funcionales incompletos.

## Capacidades

- `PostgresEconomyReadRepository.getOwned(tx, playerId)`: estado persistido existente, reserva por intento activo, aprobaciones y conteos de cartas, evoluciones y términos.
- `movementsOwned(tx, playerId, limit?, after?)`: libro contable propio por ordinal descendente, cursor `{ movementId }` y enteros seguros. No usa la fecha redondeada como posición.

## Integración y límites

Usar el mismo snapshot `TransactionRunner.read` para todas las consultas. Se reutiliza `GameEconomyRepository`; no se escriben vidas al consultar ni se confunde el resumen con un saldo histórico. Rafael proyecta las vidas efectivas, vigencia de racha, unidades completadas y siguiente nivel elegible con sus reglas y capacidades de contenido. Los movimientos no copian motivos privados de correcciones administrativas. El servicio aporta la descripción pública cuando corresponda; el repositorio conserva tipo/referencia sin inventar mensajes.

Los repositorios reciben un PoolClient; nunca abren conexiones ni confirman por su cuenta. Un resultado tipado del callback confirma efectos aceptados; lanzar revierte. Los relojes son del servidor. No registrar cuerpos, hashes, tokens, cifrados ni snapshots privados.

## Organización y pruebas

- `src/modules/economy/repositories/economy-read.repository.ts`.

La suite `database/tests/lote-consultas-economia.integration.ts` reutiliza el arnés local desechable existente mediante `player-persistence.fixture.ts`. Requiere las URL PERSISTENCE_TEST_URL y PERSISTENCE_TEST_ADMIN_URL, loopback, base criterika_prueba_* y usuarios separados; reinicia sus datos. El login de aplicación pertenece solo a criterika_app. Los clasificadores/proyectores ficticios viven exclusivamente en pruebas, sin proveedor predeterminado de producción.

Los pequeños auxiliares comunes son idénticos entre las ramas independientes del lote; al integrarlas existe una sola copia de cada archivo compartido. No se modifican precios, migraciones, el esquema real de RDS ni archivos funcionales de otros integrantes.

Verificación independiente: 8 casos SQL de este bloque correctos con PostgreSQL 18.6 efímero y login limitado. La unión del lote pasó 362 casos de persistencia, 624 unitarias, 13 HTTP ordinarias y una HTTP de registro con PostgreSQL, además de compilación, tipos y lint. No se accedió a RDS ni a correo externo.
