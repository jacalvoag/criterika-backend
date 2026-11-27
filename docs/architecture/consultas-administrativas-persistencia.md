# Persistencia de consultas administrativas

Entrega de José para las operaciones `listAuditEvents`, `getAuditEvent` y `getMaintenanceStatus` del contrato 1.0.2. Se apoya exclusivamente en las tablas y permisos de la migración instalada; no agrega ni reaplica SQL en RDS.

| Repositorio | Capacidad |
| --- | --- |
| `PostgresAuditReadRepository.list(tx, filters, limit, after?)` | Filtros parametrizados por administrador, acción, recurso e intervalo; orden descendente por fecha/ID, límite 1–100 y posición de página siguiente. |
| `PostgresAuditReadRepository.get(tx, id)` | Detalle de evidencia no vencida o `null` para ausencia/vencimiento. |
| `PostgresMaintenanceReadRepository.get(tx)` | Las cinco tareas técnicas, fechas UTC, estados y conteos persistidos, sin ejecutar tareas. |

## Integración con seguridad

Estos repositorios **no están expuestos por HTTP**. La sesión administrativa y el permiso `ADMIN_AUDIT_READ` deben verificarse mediante la capacidad de seguridad de Uzzi antes de invocarlos. El ID del administrador procede de esa identidad verificada; nunca de query, cuerpo o cabeceras arbitrarias del cliente.

Usar `TransactionRunner.run({ tipo: 'ADMINISTRADOR', actorId, requestId }, tx => ...)` con el login de aplicación. La comprobación adicional de cada repositorio exige contexto administrativo y una cuenta habilitada, que bloquea con `FOR SHARE` durante la transacción. Por ese bloqueo, no usar `TransactionRunner.read`, que declara una transacción SQL `READ ONLY`. Los repositorios solo consultan; no elevan el login a owner/mantenimiento ni insertan evidencia.

El contexto SQL no autentica JWT ni verifica permisos funcionales. Es una defensa adicional contra usos accidentales con contexto público, jugador o técnico, no un sustituto de la autorización. La autorización HTTP, sus pruebas 401/403, el registro de accesos que corresponda y la traducción de errores quedan pendientes de integrar; una vez disponibles, las tres operaciones siguen bajo responsabilidad funcional de José.

## Paginación y contrato

`nextPosition` es una estructura interna `{ ocurridoEn, id }`, no el `nextCursor` público. Conserva los seis decimales de PostgreSQL para no perder registros al paginar eventos dentro del mismo milisegundo. Las fechas públicas del evento se proyectan a ISO UTC.

El adaptador HTTP deberá validar parámetros/UUID/fechas UTC, convertir fechas a `Date`, proteger y vincular el cursor opaco a la consulta y sus filtros y traducir un cursor inválido a `400 / INVALID_CURSOR`. No publicar la posición interna directamente como cursor ni aceptar un actor desde sus datos. El repositorio limita el tamaño y comprueba el intervalo temporal; la validación HTTP completa sigue en el adaptador.

## Estado de tareas

Se leen las cinco filas técnicas instaladas, en orden fijo. `PENDIENTE` y fechas nulas se conservan: no se inventan éxitos cuando el trabajador todavía no existe. `pendientes` y fechas son el último estado persistido, no un recuento instantáneo del trabajo actual. Si falta una fila se rechaza el resultado, en lugar de devolver un catálogo incompleto.

`codigoError` solo admite una lista explícita de códigos técnicos conocidos; un texto inesperado se sustituye por `TASK_FAILED`. Para un código nuevo, actualizar la lista junto con el trabajador y su prueba. Los códigos reconocidos son `TASK_FAILED`, `TASK_NOT_CONFIGURED`, `DATABASE_UNAVAILABLE`, `SMTP_UNAVAILABLE`, `RETENTION_FAILED`, `ATTEMPT_MONITOR_FAILED`, `INCONSISTENCY_CHECK_FAILED`, `INACTIVITY_CHECK_FAILED`, `ELIMINATION_FAILED` y `EXTERNAL_DEPENDENCY_UNAVAILABLE`.

Esta consulta no implementa ni programa los cinco trabajadores. El trabajador de correo de la PR #23 procesa un subconjunto de las retenciones; no debe marcar la depuración integral como exitosa. No permite ejecutar cron, restauración o SQL desde una ruta pública.

## Verificación

Fecha: 2026-11-27. Build, TypeScript estricto y lint correctos; 609 unitarias y 7 HTTP ordinarias correctas sobre la base de `develop` posterior a #22. La suite PostgreSQL pasó sus 72 casos, incluidos nueve nuevos con login de aplicación: paginación con fechas iguales y microsegundos, filtros parametrizados, detalle/vencimiento, ausencia de contexto y limpieza del pool, cuenta inhabilitada, límites/fechas, catálogo pendiente, error privado sanitizado y catálogo incompleto.

La suite usa `PERSISTENCE_TEST_URL` y `PERSISTENCE_TEST_ADMIN_URL`, exige la misma base local desechable `criterika_prueba_*` y usuarios separados. Vacía las tablas de esa base y carga fixtures ficticios antes de cada caso. Seguir las instrucciones de [persistencia de registro](registro-persistencia.md); no ejecutar pruebas destructivas contra RDS. Esta entrega no verifica autenticación HTTP, trabajos reales ni el entorno remoto.
