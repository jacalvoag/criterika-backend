# Persistencia de compras de evoluciones

Entrega de persistencia de José sobre develop después de PR #32. Rama `feat/jose-compras-evoluciones`. Este bloque no habilita rutas ni registra módulos funcionales incompletos.

## Capacidades

- `PostgresEvolutionPurchaseRepository(projectEconomy)`: misma proyección interna real de economía, sin copiar reglas de precios.
- `purchaseOwned(tx, playerId, receiptId, cardId, stage, clock?)`: solo carta obtenida, siguiente etapa, carta publicada y etapa habilitada con imagen activa; cargo y adquisición atómicos.
- `getOwned(tx, playerId, receiptId)`: recibo propio con carta y economía históricas confirmadas.

## Integración y límites

Se reutilizan validateEvolutionPurchase y la proyección compartida de colección. El coordinador comprueba elegibilidad/idempotencia, usa una única transacción y un ID de recibo del servidor. Se serializa cuenta → estado → carta/etapas → posesión. No se concede una base ni se saltan etapas. El JSONB existente de recibo guarda una envoltura interna versionada `{ formato:1, economia, carta }`; el adaptador devuelve sus campos del contrato, no la envoltura. Esto conserva la carta exacta confirmada aunque luego cambien sus textos/imágenes. Un recibo antiguo sin snapshot no se reconstruye silenciosamente con estado actual: se rechaza como invariante. No se modifica una migración aplicada. El libro contable y la restricción única de adquisición se confirman con el recibo; repetirlo no duplica el cargo.

Los repositorios reciben un PoolClient; nunca abren conexiones ni confirman por su cuenta. Un resultado tipado del callback confirma efectos aceptados; lanzar revierte. Los relojes son del servidor. No registrar cuerpos, hashes, tokens, cifrados ni snapshots privados.

## Organización y pruebas

- `src/modules/collection/repositories/collection-card.reader.ts`.
- `src/modules/economy/repositories/evolution-purchase.repository.ts`.
- `src/modules/economy/repositories/purchase-state.ts`.

La suite `database/tests/lote-compras-evoluciones.integration.ts` reutiliza el arnés local desechable existente mediante `player-persistence.fixture.ts`. Requiere las URL PERSISTENCE_TEST_URL y PERSISTENCE_TEST_ADMIN_URL, loopback, base criterika_prueba_* y usuarios separados; reinicia sus datos. El login de aplicación pertenece solo a criterika_app. Los clasificadores/proyectores ficticios viven exclusivamente en pruebas, sin proveedor predeterminado de producción.

Los pequeños auxiliares comunes son idénticos entre las ramas independientes del lote; al integrarlas existe una sola copia de cada archivo compartido. No se modifican precios, migraciones, el esquema real de RDS ni archivos funcionales de otros integrantes.

Verificación independiente: 13 casos SQL de este bloque correctos con PostgreSQL 18.6 efímero y login limitado. La unión del lote pasó 364 casos de persistencia, 624 unitarias, 13 HTTP ordinarias y una HTTP de registro con PostgreSQL, además de compilación, tipos y lint. No se accedió a RDS ni a correo externo.

El proyector recibe una copia del estado y de sus fechas: una mutación accidental de sus argumentos no puede cambiar la compra. La proyección se compara con los hechos originales; la regresión comprueba rollback completo ante una respuesta falseada por esa mutación.
