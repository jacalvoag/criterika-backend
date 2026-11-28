# Persistencia de sanciones y restricciones del jugador

Entrega de José para el estado mínimo de accounts, a partir de `develop` después de la PR #28. Implementación: `src/modules/accounts/repositories/player-account-state.repository.ts`. Respeta la dependencia prevista en `backend.md`: accounts lee hechos mínimos mediante su repositorio, sin importar moderation ni privacy. Reutiliza las tablas, permisos e índices de la migración 0001.

## Firma para Uzzi

`PostgresPlayerAccountStateRepository.getOwned(tx, authenticatedPlayerId, at)` recibe un `PoolClient`, la identidad del jugador resuelta por código confiable y un `Date` del servidor. Devuelve `null` para cuenta inexistente o administrativa; un jugador sin efectos devuelve arrays vacíos.

| Campo interno | Contenido |
| --- | --- |
| `cuentaId` | Jugador consultado. |
| `evaluadaEn` | Copia del instante suministrado, compartido por ambas consultas. |
| `sanciones` | Todas las sanciones vigentes, cada una con `tipo` (`TEMPORAL` o `BLOQUEO`), `inicio` y `venceEn` nullable. |
| `finalidadesRestringidas` | Códigos de finalidad vigentes, únicos y ordenados con colación `C`. |

No devuelve motivos, administrador, expediente, resolución, datos personales ni credenciales. No construye el DTO público, concede permisos ni decide prioridad entre bloqueo, suspensión, privacidad, edad y cancelación. Estos criterios siguen bajo responsabilidad funcional de Uzzi.

La identidad no se recibe desde parámetros públicos ni desde el cuerpo. La consulta no verifica JWT ni prueba que quien proporcionó el UUID sea su titular: debe recibir el ID validado por security/accounts. No se añade una ruta para consultar efectos de terceros.

## Vigencia y coherencia

Una sanción se incluye cuando `inicio <= at`, su vencimiento es nulo o estrictamente posterior a `at`, y su levantamiento es nulo o posterior a `at`. Una restricción se incluye cuando `aplicada_en <= at` y su levantamiento es nulo o posterior. En el instante exacto del vencimiento o levantamiento deja de aplicar. Un levantamiento posterior al instante evaluado todavía no la excluye.

Se leen efectos vigentes sobre las filas presentes en el snapshot. No se devuelve el historial completo ni se reconstruyen estados pasados de filas corregidas o eliminadas. Las sanciones vencidas, levantadas o futuras permanecen almacenadas; esta consulta no las borra ni las modifica. Los bloqueos indefinidos conservan `venceEn: null`, y varias sanciones simultáneas se entregan sin escoger una ganadora.

Usar **`TransactionRunner.read`**, con `REPEATABLE READ READ ONLY`, tanto para el perfil como para sus efectos:

```ts
const snapshot = await runner.read(async (tx) => {
  const at = new Date(); // servidor; nunca un instante elegido por el cliente
  const profile = await profiles.getOwned(tx, authenticatedPlayerId);
  const state = await states.getOwned(tx, authenticatedPlayerId, at);
  return { profile, state };
});
```

El coordinador comprueba ambos resultados y proyecta `UserProfile` según el contrato. No asumir que `situacionOperativa: HABILITADA` significa `ACTIVA`, ni equiparar automáticamente cualquier finalidad restringida a la denegación de todas las operaciones. Una cuenta en cancelación conserva sus efectos en esta lectura.

El repositorio no toma bloqueos ni abre conexiones. Este snapshot de lectura no garantiza por sí solo autorización atómica de una mutación posterior: los comandos deben usar la coordinación transaccional y los bloqueos de su capacidad funcional, con su identidad verificada. No reutilizar una decisión de acceso almacenada en caché como sustituto de esa comprobación.

## Integración pendiente y pruebas

Uzzi debe registrar el proveedor en accounts, consumir estos hechos desde su capacidad pública de estado/acceso y completar sus reglas y pruebas HTTP. Rafael consume esa capacidad pública; no consulta este repositorio directamente ni incorpora SQL en servicios de juego.

`database/tests/estado-cuenta.integration.ts` comprueba límites exactos, bloqueos indefinidos, efectos simultáneos, separación de jugadores, finalidad única, proyección mínima, cuenta en cancelación, instantes inválidos, consultas parametrizadas, ausencia de escrituras y un snapshot estable mientras otra transacción confirma cambios de perfil/sanciones/restricciones.

La suite usa las mismas URL locales desechables `PERSISTENCE_TEST_URL` y `PERSISTENCE_TEST_ADMIN_URL` de las otras pruebas, con usuarios distintos y base `criterika_prueba_*`. El login de aplicación pertenece únicamente a `criterika_app`; el operador prepara fixtures ficticios. Ejecutar `npm run test:persistence` exclusivamente sobre esa base desechable. No se requiere una migración ni un cambio en RDS.

Verificación de esta entrega: build, TypeScript, lint y formato correctos; 624 pruebas unitarias, 13 HTTP ordinarias, 156 de persistencia (27 nuevas de estado de cuenta) y una HTTP de registro con PostgreSQL 18.6 efímero. No se accedió a RDS ni a correo externo.
