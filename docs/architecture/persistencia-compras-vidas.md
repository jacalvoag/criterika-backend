# Persistencia de compras de vidas

Entrega de persistencia de José sobre develop después de PR #32. Rama `feat/jose-compras-vidas`. Este bloque no habilita rutas ni registra módulos funcionales incompletos.

## Capacidades

- `PostgresLifePurchaseRepository(projectEconomy)`: recibe la proyección real, pura e interna de economía de Rafael.
- `purchaseOwned(tx, playerId, receiptId, packageId, clock?)`: cuenta → estado, reglas existentes de paquetes/regeneración, recibo, débito y movimiento contable en la misma conexión.
- `getOwned(tx, playerId, receiptId)`: recibo propio histórico, sin releer el saldo actual para sustituir su economía confirmada.

## Integración y límites

El coordinador debe comprobar identidad, elegibilidad de accounts/legal y su intención idempotente bajo la misma transacción/bloqueo de cuenta. El UUID del recibo lo asigna el servidor por intención; no procede del cuerpo público. Repetir el mismo recibo/paquete devuelve `existing` sin cobrar; reutilizarlo para otra cuenta/paquete produce `receipt_conflict`. Las intenciones nuevas conservan sus propias comprobaciones de capacidad y saldo. No se reinicia la regeneración al comprar. `purchase-state.ts` valida que la proyección interna coincida con gemas, XP, vidas, reloj y referencia de racha realmente confirmados; no se acepta un JSON del cliente. La política de racha visible pertenece a Rafael. Un fallo revierte recibo, saldo y libro contable; la emisión HTTP y el replay público siguen en su coordinador.

Los repositorios reciben un PoolClient; nunca abren conexiones ni confirman por su cuenta. Un resultado tipado del callback confirma efectos aceptados; lanzar revierte. Los relojes son del servidor. No registrar cuerpos, hashes, tokens, cifrados ni snapshots privados.

## Organización y pruebas

- `src/modules/economy/repositories/life-purchase.repository.ts`.
- `src/modules/economy/repositories/purchase-state.ts`.

La suite `database/tests/lote-compras-vidas.integration.ts` reutiliza el arnés local desechable existente mediante `player-persistence.fixture.ts`. Requiere las URL PERSISTENCE_TEST_URL y PERSISTENCE_TEST_ADMIN_URL, loopback, base criterika_prueba_* y usuarios separados; reinicia sus datos. El login de aplicación pertenece solo a criterika_app. Los clasificadores/proyectores ficticios viven exclusivamente en pruebas, sin proveedor predeterminado de producción.

Los pequeños auxiliares comunes son idénticos entre las ramas independientes del lote; al integrarlas existe una sola copia de cada archivo compartido. No se modifican precios, migraciones, el esquema real de RDS ni archivos funcionales de otros integrantes.

Verificación independiente: 11 casos SQL de este bloque correctos con PostgreSQL 18.6 efímero y login limitado. La unión del lote pasó 362 casos de persistencia, 624 unitarias, 13 HTTP ordinarias y una HTTP de registro con PostgreSQL, además de compilación, tipos y lint. No se accedió a RDS ni a correo externo.
