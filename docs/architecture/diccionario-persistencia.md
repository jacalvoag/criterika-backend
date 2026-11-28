# Consultas del diccionario adquirido

Entrega de José para `listUnlockedTerms` y `getUnlockedTerm` de Rafael, sobre `develop` `a2fd1ad8`. Contrato 1.0.2, sin cambios en migraciones, dependencias o rutas. La implementación es `PostgresDictionaryReadRepository` dentro de `src/modules/dictionary/repositories/`.

## Firmas y resultados

| Método | Entrada | Salida |
| --- | --- | --- |
| `list(tx, playerId, filters?, limit?, after?)` | Conexión transaccional, ID verificado del jugador, `{ q?, categoria? }`, límite 1–100 (20 predeterminado), posición interna opcional `{ termId }`. | `{ items: UnlockedTerm[], nextPosition: { termId } \| null }`. |
| `get(tx, playerId, termId)` | Conexión, ID verificado del jugador e ID del término. | `UnlockedTerm` o `null` para no adquirido/inexistente. |

`UnlockedTerm` contiene exclusivamente `id`, `nombre`, `categoria`, `definicion`, `ejemplo` y `fuenteUrl` (nullable), como el schema `Term`. No devuelve campos de borrador, IDs de aprobaciones, datos de cuenta o metadatos privados.

Ambas consultas unen `terminos_desbloqueados` por el jugador indicado, el término y una cuenta con rol `JUGADOR`. La adquisición es el criterio de acceso a contenido; deshabilitar un término no retira lo adquirido. Se leen los campos publicados actuales, por lo que una corrección publicada se refleja en consultas posteriores. Un desbloqueo con publicación incompleta genera `PersistenceInvariantError`; no se rellena con datos de borrador.

El repositorio de concesión `GameDictionaryRepository.grantAttemptTerms` sigue siendo la capacidad de escritura existente. Este bloque no concede términos ni modifica la economía.

## Búsqueda y paginación

- `q` busca una subcadena literal del nombre publicado mediante `lower` de PostgreSQL. `%` y `_` se tratan como texto, no comodines. El comportamiento de mayúsculas Unicode depende de la configuración de PostgreSQL; no se agrega normalización de acentos ni extensión SQL.
- `categoria` compara exactamente la categoría publicada. Ambos filtros admiten 1–120 puntos de código Unicode y se pasan como parámetros; no se concatenan al SQL ni se registran. La capa funcional puede normalizar entradas antes de construir los filtros, de forma consistente con su cursor.
- Se ordena por `lower(nombre_publicado) COLLATE "C"` y UUID ascendente para desempatar nombres iguales. La colación explícita proporciona un orden reproducible; no define ordenación lingüística española.
- Se consulta `limit + 1` para decidir si existe una página siguiente. La posición interna solo guarda el UUID del último término; no necesita serializar un nombre Unicode largo en el cursor público, limitado a 512 caracteres.
- Cuando hay posición, se obtiene la clave de orden del término ancla dentro de los mismos filtros y del mismo jugador. Un ancla no adquirida, inexistente o fuera de esos filtros produce `DictionaryPositionError`.

Usar **`TransactionRunner.read`**: la resolución del ancla y el listado deben compartir su snapshot `REPEATABLE READ READ ONLY`. El repositorio no abre conexiones ni confirma transacciones. La siguiente página, en otra transacción, vuelve a leer el estado publicado: una edición de nombre o un nuevo desbloqueo entre páginas puede cambiar el recorrido; no se conserva una fotografía de todo el catálogo entre peticiones.

## Integración funcional y de seguridad

Rafael registra el proveedor y compone sus servicios/controladores. Uzzi proporciona la sesión y la política `AUTHENTICATED_OWNER`. `playerId` procede de esa identidad verificada; nunca de un parámetro arbitrario del cliente. El login SQL compartido no es RLS ni verifica JWT. El filtro de jugador limita el conjunto consultado, pero no autentica al llamador.

La consulta no bloquea por sanción ni exige una nueva aceptación para leer lo ya adquirido; el contrato conserva la consulta propia de diccionario. Aplicar las políticas correspondientes a través de las capacidades de seguridad/cuenta, sin importar repositorios de otros módulos para saltárselas.

El servicio valida UUID, filtros y permisos y proyecta `null` a la ausencia prevista por el contrato. Convierte `nextPosition` a **`nextCursor` opaco**, protegido y ligado a jugador, consulta y filtros, usando la capacidad técnica acordada. No publicar el UUID sin esa vinculación ni confiar en que comprobar el ancla la sustituye. Tras verificar/decodificar el cursor, un `DictionaryPositionError` corresponde a `400 / INVALID_CURSOR`. Los errores de invariantes o de base no deben exponerse como mensajes SQL.

Las rutas deben mantener `Cache-Control: no-store`, correlación, límites de solicitudes y pruebas 401/403/404 según OpenAPI. Esta entrega prepara la persistencia; no activa rutas protegidas ni implementa la pantalla móvil.

## Validación de esta entrega

Fecha: 28 de noviembre de 2026, hora de México.

- Build, TypeScript estricto y lint: correctos.
- 624 pruebas unitarias y 13 HTTP ordinarias correctas; la prueba HTTP de PostgreSQL se omite en la suite ordinaria por activación explícita.
- 93 pruebas de persistencia correctas, incluidas 10 nuevas, en PostgreSQL 18.6 local desechable con login miembro únicamente de `criterika_app`.
- La prueba de registro HTTP activada con PostgreSQL también pasó, con transporte de correo sustituido.

Las pruebas nuevas cubren proyección publicada, empates y límites de página, ausencia indistinguible de contenido ajeno/bloqueado/inexistente, adquisición deshabilitada, correcciones, texto literal/comodines/SQL, combinación de filtros, anclas inválidas, límites de entrada y publicación incompleta. No se accedió a RDS ni SMTP externos.

Para reproducir, preparar la migración en una base **local desechable** `criterika_prueba_*`, con URLs de operador y aplicación separadas (`PERSISTENCE_TEST_ADMIN_URL` y `PERSISTENCE_TEST_URL`) como en las guías de persistencia existentes, y ejecutar `npm run test:persistence`. La suite vacía tablas y carga fixtures ficticios antes de cada caso; nunca se ejecuta contra datos a conservar. Las pruebas HTTP de las rutas de diccionario siguen pendientes de la integración funcional.
