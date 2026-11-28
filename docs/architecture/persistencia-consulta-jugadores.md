# Consultas administrativas de jugadores

Entrega de persistencia de José sobre develop después de PR #32. Rama `feat/jose-consulta-jugadores`. Este bloque no habilita rutas ni registra módulos funcionales incompletos.

## Capacidades

- `PostgresAdminPlayerRepository(classify)`: requiere el clasificador puro real de accounts; no existe un clasificador predeterminado de producción.
- `list(tx, at, filters?, limit?, after?)`: búsqueda literal por nombre, filtro de estado compuesto y cursor `{ playerId }`, en UUID ascendente. El filtro de estado se aplica antes de contar la página: se recorren candidatos por bloques sin omitir coincidencias.
- `get(tx, id, at)`: resumen mínimo y hechos persistidos de economía/aprobaciones, para componer `AdminPlayer` mediante las capacidades funcionales.

## Integración y límites

Se exige contexto administrativo habilitado mediante la comprobación existente; permisos ADMIN_MANAGE y sesión real siguen en security. Las filas de candidatos incluyen hechos mínimos de cancelación, elegibilidad de edad UTC, sanciones y restricciones activas; accounts define su precedencia. No se devuelve correo, fecha de nacimiento ni hash. La consulta justificada a datos personales es otro caso de uso y no se habilita por esta entrega. Los filtros/cursor y el clasificador forman parte de la intención de paginación. Las páginas se consultan sobre los datos disponibles en cada petición; no representan un snapshot histórico conservado entre peticiones.

Los repositorios reciben un PoolClient; nunca abren conexiones ni confirman por su cuenta. Un resultado tipado del callback confirma efectos aceptados; lanzar revierte. Los relojes son del servidor. No registrar cuerpos, hashes, tokens, cifrados ni snapshots privados.

## Organización y pruebas

- `src/modules/accounts/repositories/admin-player.repository.ts`.

La suite `database/tests/lote-consulta-jugadores.integration.ts` reutiliza el arnés local desechable existente mediante `player-persistence.fixture.ts`. Requiere las URL PERSISTENCE_TEST_URL y PERSISTENCE_TEST_ADMIN_URL, loopback, base criterika_prueba_* y usuarios separados; reinicia sus datos. El login de aplicación pertenece solo a criterika_app. Los clasificadores/proyectores ficticios viven exclusivamente en pruebas, sin proveedor predeterminado de producción.

Los pequeños auxiliares comunes son idénticos entre las ramas independientes del lote; al integrarlas existe una sola copia de cada archivo compartido. No se modifican precios, migraciones, el esquema real de RDS ni archivos funcionales de otros integrantes.

Verificación independiente: 10 casos SQL de este bloque correctos con PostgreSQL 18.6 efímero y login limitado. La unión del lote pasó 362 casos de persistencia, 624 unitarias, 13 HTTP ordinarias y una HTTP de registro con PostgreSQL, además de compilación, tipos y lint. No se accedió a RDS ni a correo externo.
