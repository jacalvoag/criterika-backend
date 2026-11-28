# Administración del diccionario

Entrega de persistencia de José sobre develop después de PR #32. Rama `feat/jose-admin-diccionario`. Este bloque no habilita rutas ni registra módulos funcionales incompletos.

## Capacidades

- `PostgresAdminTermReadRepository.get/list`: borradores y estados administrativos, con búsqueda literal/categoría/estado y cursor `{ termId }` ligado a filtros.
- `PostgresAdminTermWriteRepository.create/patch`: campos permitidos, parche parcial, URL nula explícita y control exacto de versión.
- `publish/setEnabled/remove`: promover los textos del borrador, habilitar/deshabilitar y eliminar solo un término nunca publicado y sin referencias.

## Integración y límites

Se exige contexto administrativo habilitado; ADMIN_MANAGE, confirmación reciente cuando el contrato la exige, motivos e idempotencia siguen en Rafael/security. Publicar una corrección de un término deshabilitado conserva esa deshabilitación; habilitar es una acción separada. Editar el borrador no cambia la definición pública hasta publicar, y deshabilitar no elimina adquisiciones ni derechos fijados en intentos. Todas las acciones y su auditoría usan la misma transacción; un fallo revierte ambas. El servicio valida la semántica de las referencias URI y su uso seguro en clientes.

Los repositorios reciben un PoolClient; nunca abren conexiones ni confirman por su cuenta. Un resultado tipado del callback confirma efectos aceptados; lanzar revierte. Los relojes son del servidor. No registrar cuerpos, hashes, tokens, cifrados ni snapshots privados.

## Organización y pruebas

- `src/modules/dictionary/repositories/admin-term-read.repository.ts`.
- `src/modules/dictionary/repositories/admin-term-write.repository.ts`.
- `src/modules/dictionary/repositories/admin-term.input.ts`.

La suite `database/tests/lote-admin-diccionario.integration.ts` reutiliza el arnés local desechable existente mediante `player-persistence.fixture.ts`. Requiere las URL PERSISTENCE_TEST_URL y PERSISTENCE_TEST_ADMIN_URL, loopback, base criterika_prueba_* y usuarios separados; reinicia sus datos. El login de aplicación pertenece solo a criterika_app. Los clasificadores/proyectores ficticios viven exclusivamente en pruebas, sin proveedor predeterminado de producción.

Los pequeños auxiliares comunes son idénticos entre las ramas independientes del lote; al integrarlas existe una sola copia de cada archivo compartido. No se modifican precios, migraciones, el esquema real de RDS ni archivos funcionales de otros integrantes.

Verificación independiente: 13 casos SQL de este bloque correctos con PostgreSQL 18.6 efímero y login limitado. La unión del lote pasó 362 casos de persistencia, 624 unitarias, 13 HTTP ordinarias y una HTTP de registro con PostgreSQL, además de compilación, tipos y lint. No se accedió a RDS ni a correo externo.
