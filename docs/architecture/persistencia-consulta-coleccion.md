# Consulta de colección y evoluciones

Entrega de persistencia de José sobre develop después de PR #32. Rama `feat/jose-consulta-coleccion`. Este bloque no habilita rutas ni registra módulos funcionales incompletos.

## Capacidades

- `PostgresCollectionReadRepository.listOwned(tx, playerId, limit?, after?)`: catálogo publicado y cartas propias conservadas aun si se deshabilitaron, orden UUID ascendente y cursor `{ cardId }`.
- `getOwned(tx, playerId, cardId)`: base publicada y tres etapas.
- `collection-card.reader.ts`: proyección compartida con los recibos de evoluciones, sin duplicar el SQL de cartas.

## Integración y límites

Las cartas no obtenidas solo entregan metadatos publicados y silueta: la imagen base es nula. Cada imagen de etapa solo se entrega si esa etapa ya pertenece al jugador. Una carta deshabilitada adquirida conserva su lectura, pero no habilita compras nuevas. La disponibilidad estructural no sustituye la elegibilidad por saldo, sanción, aceptación, privacidad o edad; Rafael compone esas políticas antes de operar. No se exponen claves de objetos ni URL firmadas. Usar snapshot de lectura e identidad verificada; media mantiene la autorización del binario.

Los repositorios reciben un PoolClient; nunca abren conexiones ni confirman por su cuenta. Un resultado tipado del callback confirma efectos aceptados; lanzar revierte. Los relojes son del servidor. No registrar cuerpos, hashes, tokens, cifrados ni snapshots privados.

## Organización y pruebas

- `src/modules/collection/repositories/collection-card.reader.ts`.
- `src/modules/collection/repositories/collection-read.repository.ts`.

La suite `database/tests/lote-consulta-coleccion.integration.ts` reutiliza el arnés local desechable existente mediante `player-persistence.fixture.ts`. Requiere las URL PERSISTENCE_TEST_URL y PERSISTENCE_TEST_ADMIN_URL, loopback, base criterika_prueba_* y usuarios separados; reinicia sus datos. El login de aplicación pertenece solo a criterika_app. Los clasificadores/proyectores ficticios viven exclusivamente en pruebas, sin proveedor predeterminado de producción.

Los pequeños auxiliares comunes son idénticos entre las ramas independientes del lote; al integrarlas existe una sola copia de cada archivo compartido. No se modifican precios, migraciones, el esquema real de RDS ni archivos funcionales de otros integrantes.

Verificación independiente: 8 casos SQL de este bloque correctos con PostgreSQL 18.6 efímero y login limitado. La unión del lote pasó 362 casos de persistencia, 624 unitarias, 13 HTTP ordinarias y una HTTP de registro con PostgreSQL, además de compilación, tipos y lint. No se accedió a RDS ni a correo externo.
