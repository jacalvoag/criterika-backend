# Persistencia del perfil propio

Entrega de José para `getMyProfile` y `updateMyProfile`, a partir de `develop` después de la PR #27. Contrato 1.0.2. Implementación: `src/modules/accounts/repositories/player-profile.repository.ts`. Reutiliza la migración 0001 y `TransactionRunner`; no requiere instalar tablas, índices o dependencias adicionales.

## Uso desde accounts (Uzzi)

| Método | Entrada | Resultado |
| --- | --- | --- |
| `getOwned(tx, authenticatedPlayerId)` | Cliente transaccional e identidad de jugador autenticada. | `PlayerProfileSnapshot` o `null` si ya no existe/no es jugador. |
| `updateOwned(tx, authenticatedPlayerId, expectedVersion, changes)` | Mismo cliente, identidad autenticada, versión `bigint`, `{ nombre?, apellidos? }`. | `updated` con snapshot, `not_found` o `version_conflict`. |

La identidad debe proceder de la sesión verificada. No se admite una segunda identidad de destino ni se toma el titular del cuerpo de la petición. La lectura no autentica por sí misma: el guard/coordinador debe verificar la sesión antes de pasar su identidad. La escritura además exige contexto SQL `JUGADOR` del mismo titular; rechaza contexto ausente, de otro jugador, administrativo o de sistema mediante `ProfileOwnershipError`. Este control no sustituye la autenticación HTTP: el rol técnico confía en que el backend establezca correctamente el contexto.

Usar `TransactionRunner.read` para consultar y `TransactionRunner.run` para editar, con `requestId` y actor verificados. El repositorio no abre ni confirma transacciones. La edición bloquea primero la cuenta con `FOR UPDATE`, compara la versión y actualiza exclusivamente nombre, apellidos y versión. Dos peticiones con la misma versión producen una edición y un conflicto. Cada edición aceptada incrementa la versión una vez, incluso si repite los mismos valores.

El repositorio rechaza cuerpos vacíos, arrays, valores nulos, propiedades desconocidas, `undefined`, texto con NUL y campos fuera de 1–120 puntos de código Unicode. Los valores se parametrizan. Cualquier normalización de espacios debe acordarse en la validación funcional; aquí no se transforman silenciosamente los datos.

## Proyección y respuesta HTTP pendientes de integración

`PlayerProfileSnapshot` contiene `id`, `nombre`, `apellidos`, `fechaNacimiento` como fecha ISO sin hora, `correo` de presentación, `avatarMediaId` nullable, `situacionOperativa`, `creadaEn` como `Date` y `version` como `bigint`. No contiene credenciales, sesiones ni economía.

**El snapshot es interno y no es todavía el DTO `UserProfile`.** Uzzi debe obtener sanciones/restricciones y aplicar las reglas de estado y edad de accounts para completar `estado`, `suspensionHasta` y, cuando corresponda, `restricciones`. `HABILITADA` no implica automáticamente `ACTIVA`: una cuenta habilitada puede tener sanciones o restricciones. La situación de cancelación se conserva para que el coordinador aplique la política correspondiente.

La consulta de esos hechos ya está disponible mediante `PostgresPlayerAccountStateRepository`: ver [estado mínimo del jugador](estado-cuenta-persistencia.md). Leer ambos repositorios con el mismo cliente y snapshot; la proyección funcional sigue perteneciendo a accounts.

Para completar las rutas `/me`:

1. Registrar/inyectar el repositorio en el módulo de accounts y autenticar como `JUGADOR` según `AUTHENTICATED_OWNER`.
2. Validar el DTO y los encabezados `If-Match` e `Idempotency-Key`. Resolver la repetición idempotente antes de volver a ejecutar la edición.
3. Interpretar `"v<version>"` como entero exacto y pasar `bigint`; `version_conflict` corresponde a HTTP 412. La ausencia del encabezado obligatorio corresponde a 428, según contrato. La ausencia de cuenta debe invalidar/rechazar la identidad, sin inventar un 404 que `/me` no declara.
4. Compartir transacción entre idempotencia, edición y construcción/almacenamiento de la respuesta protegida. Lanzar errores si debe revertirse el trabajo; devolver un resultado tipado confirma los efectos aceptados por `TransactionRunner`.
5. Proyectar `UserProfile`, serializar `creadaEn` con `toISOString()` y convertir la versión mediante `safeInteger(version.toString())`, sin redondear si excede el rango seguro. No serializar un `bigint` directamente como JSON. Emitir ETag fuerte, `Cache-Control: no-store` y cabeceras de correlación/repetición del contrato.
6. Probar las rutas con sesión, reintentos y concurrencia. Estas rutas y su proyección funcional no se habilitan en esta entrega SQL.

## Auditoría y atomicidad

La migración vigente comprueba titularidad de escrituras de jugadores, pero `auditar_cambio` solo registra cambios de administradores o mantenimiento. Una edición propia **no genera un evento administrativo**. No se suplanta al actor como sistema ni se modifica una migración ya aplicada. Si se acuerda auditar ediciones propias, requiere una decisión de política y una migración posterior que contemple el tipo de actor y su retención.

Los cambios administrativos existentes sí se auditan mediante el trigger, dentro de la misma transacción. La prueba comprueba vínculo con el titular y ausencia de valores de nombre/apellidos en el evento. Otra prueba fuerza un fallo del trigger en una base desechable y verifica que no se persista ni el cambio ni el evento. Esto verifica el mecanismo SQL existente, sin incorporar una nueva operación administrativa.

## Validación reproducible

`database/tests/perfil.integration.ts` se ejecuta con `npm run test:persistence` y las dos URL locales descritas en las otras suites: `PERSISTENCE_TEST_URL` para un login de `criterika_app` sin privilegios de propietario y `PERSISTENCE_TEST_ADMIN_URL` para el operador de la misma base `criterika_prueba_*`. Solo acepta loopback y una base desechable. Reinicia sus datos antes de cada caso; nunca debe apuntarse a RDS.

Incluye proyección mínima, edición parcial, Unicode, rechazo de campos, titularidad, concurrencia, rollback, versión `bigint`, agotamiento de versión y política de auditoría. La excepción de tamaño de versión falla de forma controlada; no se envuelve ni se redondea el contador.

Verificado en PostgreSQL 18.6 efímero con la migración sin cambios y login limitado: 36 casos de perfil y 129 casos de persistencia en total, más una prueba HTTP de registro sobre PostgreSQL. También pasaron las 624 pruebas unitarias, 13 HTTP ordinarias, build, tipos y lint. No se ejecutaron cambios ni pruebas contra RDS o Brevo.
