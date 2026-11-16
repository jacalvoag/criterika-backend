# Criterika — Guía de revisión del contrato

Versión 1.0.2 · 15 de noviembre de 2026

Contrato: `criterika_openapi_v1.yaml`. Es una especificación para implementar y revisar; no representa un backend desplegado.

Contiene **142 operaciones HTTP**, **121 rutas**, **184 schemas de intercambio** y **30 escenarios de aceptación**.
Los schemas describen solicitudes y respuestas; no son tablas, colecciones ni una recuperación del modelo de base de datos descartado.

## Cómo abrirlo

Importar el YAML completo en [Swagger Editor](https://editor.swagger.io/) o utilizar Swagger UI con soporte OpenAPI 3.1. El contrato no depende de archivos externos. El servidor `api.criterika.example` es un marcador de posición; no existe un despliegue asociado.
Para pruebas locales, seleccionar `http://localhost:3000/api/v1` cuando exista la implementación. No usar HTTP con datos reales.

## Precisión de la versión 1.0.2

El motivo PRIVACIDAD se incluye en la finalización de intentos para representar la cancelación por restricciones de tratamiento ya acordada. No cambia las recompensas ni agrega rutas.

## Precisión de la versión 1.0.1

Se expresa el estado RESTRINGIDA y los motivos PRIVACIDAD/EDAD_NO_ADMITIDA para las restricciones de tratamiento o elegibilidad ya acordadas. El perfil puede incluir restricciones; las vistas de nivel y paquetes explican ese bloqueo. Se conservan consultas y mecanismos ARCO. No se agregan rutas, sanciones ni nuevas reglas de recompensa. El modelo lógico asociado selecciona PostgreSQL; los DTO siguen siendo independientes de tablas.

## Decisiones funcionales conservadas

- Un camino; unidades secuenciales y un final por unidad. La estructura de unidades utilizadas queda fija.
- Niveles con 3–6 actividades, máximo dos por tipo. Una ejecución y dos recuperaciones por actividad.
- Una vida reservada por intento; cinco totales incluyendo reserva. Fallo/abandono consume una; aprobar/cancelar libera.
- Normal: 150 gemas/100 XP. Final: 300 gemas/250 XP y carta, sin sumar recompensa normal.
- Repetición sin premios iniciales y con racha si se aprueba. Racha no genera ventajas adicionales.
- Evoluciones lineales a 150/350/500; paquetes 1/3/5 vidas a 100/150/250. Economía fija en v1.
- Preguntas con feedback inmediato; aprobación automática del nivel solo tras superar todas las actividades.
- Sin reanudación tras interrupción confirmada. Heartbeat 15 s y vencimiento 60 s, con consulta de resultado perdido.
- Tres administradores individuales; toda modificación de negocio y su auditoría se confirman juntas.
- Privacidad: aceptaciones con IP/UTC/versiones, exportación JSON, ARCO, bloqueo fundado y supresión, cifrado, RBAC y depuración.

## Precisiones añadidas para hacer implementable el contrato

| Tema | Decisión de transporte o validación |
|---|---|
| Versión y nombres | OpenAPI 3.1.0; rutas en inglés y campos de negocio en español; enums explícitos. |
| Identificadores | UUID independientes del motor de persistencia. |
| Paginación | Cursor estable; 20 elementos por defecto y máximo 100. |
| Errores | `application/problem+json`, código estable y requestId; sin datos sensibles. |
| Sesión del jugador | Access hasta 15 minutos; refresh rotatorio; máximo absoluto de 30 días. |
| Sesión administrativa | Access hasta 15 minutos; refresh HttpOnly Secure SameSite=Strict; ocho horas absolutas y código en nueva sesión. |
| Operación sensible | Contraseña confirmada en la sesión durante los últimos cinco minutos. |
| Cambios concurrentes | ETag fuerte e If-Match; conflicto de versión 412 y encabezado ausente 428. |
| Reintentos | Idempotency-Key por intención; 24 h de recuperación normal y cinco minutos para respuestas con tokens, cifradas. |
| Archivos | Imágenes hasta 5 MiB y 4096x4096; evidencia privada hasta 10 MiB y cinco adjuntos. |
| Registro pendiente | Máximo 24 h; hash de contraseña y aceptación específica, sin contraseña en claro. |
| Edición publicada | Borradores y promoción explícita; intentos mantienen snapshot. |
| Zona de racha | IANA del dispositivo al iniciar el intento; hora real de aprobación del servidor. Inicialmente Etc/UTC sin actividad. |

Estas precisiones no cambian la economía, no añaden pagos ni implican un motor de base de datos. Una cuenta suspendida/bloqueada o con aceptación pendiente conserva el acceso permitido a datos propios y privacidad. Una nueva aceptación requerida bloquea nuevos intentos/compras, no provoca una pérdida de vida en un intento iniciado bajo las finalidades previas.

## Flujos principales para implementación

### Registro y acceso

1. Obtener documentos vigentes. Mostrar términos, aviso y consentimiento con controles inicialmente desmarcados.
2. Iniciar registro con versiones vistas y finalidades aceptadas. IP y hora las aporta el servidor.
3. Verificar código; crear una sola cuenta con cinco vidas y valores iniciales en cero.
4. Jugador utiliza sesión propia; administrador valida credenciales y después código para su sesión web.

### Nivel y respuestas

1. Consultar camino y vista previa del nivel.
2. Iniciar con Idempotency-Key y zona IANA: el servidor fija contenido y reserva vida.
3. Obtener ejecución actual. Ningún GET crea o inicia otra ejecución.
4. Enviar una acción con la unión correspondiente al minijuego y mantener heartbeat mientras se juega conectado.
5. El servidor actualiza errores, recuperación o siguiente actividad; al completar todas, aprueba automáticamente.
6. Si se pierde respuesta, consultar intento. Reintentar la misma intención con la misma clave; no crear otra compra o respuesta a ciegas.

### Edición administrativa

1. Consultar recurso y ETag. Editar con If-Match y clave de idempotencia cuando se declara.
2. Actividades de tablero: generar, revisar y aprobar distribución actual.
3. Publicar revisión completa del nivel; validar composición y dependencias.
4. Si otro administrador cambió el recurso, 412 exige reconsultar; no sobrescribir silenciosamente.
5. Guardar el cambio y evidencia de auditoría conjuntamente. Para ordenar niveles/actividades, usar ETag del padre indicado.
6. En documentos legales, ETag se forma desde versionRecurso; en otros recursos desde version. Publicados legales son inmutables.

### Privacidad

1. Titular autenticado puede exportar JSON con confirmación reciente. No hay URL pública ni archivo persistente.
2. Solicitudes ARCO tienen folio, verificación, resolución, plazos y seguimiento.
3. Sin sesión, el canal alternativo solo valida correo y permite folios/estado mínimo; no acredita por sí solo identidad ni permite exportar una cuenta.
4. Cancelación total restringe uso ordinario y revoca sesiones; seguimiento mediante canal alternativo.
5. Administrador verifica identidad, resuelve y ejecuta acciones aprobadas. Bloqueo lleva fundamento y vencimiento.
6. No marcar ejecución completada con archivos, terceros, respaldos o bloqueo pendientes. Reaplicar eliminaciones antes de reabrir una restauración.
7. Rectificación aprobada de correo requiere confirmar nuevo destino mediante token antes de aplicarlo y revoca sesiones anteriores.

## Matriz de operaciones

Todas las rutas de esta matriz llevan el prefijo `/api/v1`. Los indicadores de clave, versión o confirmación reciente se detallan además en el YAML.

### Sistema

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/health` | Consultar disponibilidad mínima | PUBLICO |

### Legal

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/legal/documents/current` | Consultar documentos legales vigentes | PUBLICO |
| GET | `/legal/documents/{documentVersionId}` | Consultar una versión legal publicada | PUBLICO |
| GET | `/me/acceptances` | Consultar evidencias de aceptación propias | JUGADOR |
| POST | `/me/acceptances` | Registrar nueva aceptación explícita | JUGADOR; clave |

### Autenticación

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| POST | `/auth/registrations` | Iniciar registro y enviar código | PUBLICO; clave |
| POST | `/auth/registrations/{registrationId}/resend` | Reenviar código de registro | PUBLICO; clave |
| POST | `/auth/registrations/{registrationId}/verify` | Verificar correo y completar registro | PUBLICO; clave |
| POST | `/auth/sessions` | Iniciar sesión de jugador | PUBLICO; clave |
| POST | `/auth/refresh` | Renovar acceso de jugador | PUBLICO; clave |
| POST | `/auth/password-reset-requests` | Solicitar recuperación de contraseña | PUBLICO; clave |
| POST | `/auth/password-resets` | Restablecer contraseña e invalidar sesiones | PUBLICO; clave |
| POST | `/auth/logout` | Cerrar la sesión actual | JUGADOR/ADMINISTRADOR; clave |
| POST | `/auth/reauthentications` | Confirmar identidad para operación sensible | JUGADOR/ADMINISTRADOR; clave |

### Acceso administrativo

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| POST | `/admin/auth/challenges` | Validar credenciales y enviar código administrativo | PUBLICO; clave |
| POST | `/admin/auth/challenges/{challengeId}/resend` | Reenviar código administrativo | PUBLICO; clave |
| POST | `/admin/auth/challenges/{challengeId}/verify` | Verificar código e iniciar sesión administrativa | PUBLICO; clave |
| POST | `/admin/auth/refresh` | Renovar acceso administrativo | ADMINISTRADOR; clave |
| POST | `/admin/auth/logout` | Cerrar sesión administrativa y expirar cookie | ADMINISTRADOR; clave |
| GET | `/admin/me` | Consultar identidad administrativa actual | ADMINISTRADOR |

### Perfil

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/me` | Consultar perfil propio | JUGADOR |
| PATCH | `/me` | Actualizar nombre y apellidos propios | JUGADOR; clave, If-Match |
| PUT | `/me/avatar` | Cargar o reemplazar imagen de perfil | JUGADOR; clave |
| DELETE | `/me/avatar` | Retirar imagen de perfil | JUGADOR; clave |
| GET | `/me/sessions` | Consultar sesiones propias | JUGADOR |
| DELETE | `/me/sessions/{sessionId}` | Revocar una sesión propia | JUGADOR; identidad reciente, clave |
| GET | `/me/economy` | Consultar gemas, XP, vidas y racha | JUGADOR |
| GET | `/me/progress` | Consultar resumen de progreso | JUGADOR |
| GET | `/me/gem-movements` | Consultar movimientos de gemas propios | JUGADOR |
| PUT | `/me/password` | Cambiar contraseña y revocar sesiones anteriores | JUGADOR; clave |

### Aprendizaje

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/learning/path` | Consultar unidades, niveles y disponibilidad | JUGADOR |
| GET | `/levels/{levelId}` | Consultar actividades, criterios y recompensa de un nivel | JUGADOR |
| GET | `/me/attempts` | Consultar historial de intentos propios | JUGADOR |
| GET | `/me/attempts/current` | Consultar intento activo sin crear uno | JUGADOR |
| POST | `/levels/{levelId}/attempts` | Iniciar intento y reservar una vida | JUGADOR; clave |
| GET | `/attempts/{attemptId}` | Consultar estado y resultado propio de un intento | JUGADOR |
| POST | `/attempts/{attemptId}/heartbeats` | Confirmar comunicación de un intento activo | JUGADOR |
| POST | `/attempts/{attemptId}/abandonments` | Confirmar salida o interrupción del nivel | JUGADOR; clave |
| GET | `/attempts/{attemptId}/execution` | Obtener contenido de la ejecución actual | JUGADOR |
| POST | `/attempts/{attemptId}/executions/{executionId}/answers` | Evaluar una acción y avanzar si corresponde | JUGADOR; clave |

### Tienda

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/shop/life-packages` | Consultar paquetes de vidas y disponibilidad | JUGADOR |
| POST | `/me/life-purchases` | Comprar un paquete completo con gemas | JUGADOR; clave |
| GET | `/me/life-purchases/{purchaseId}` | Consultar recibo propio de compra de vidas | JUGADOR |

### Colección

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/collection/cards` | Consultar cartas obtenidas y disponibles en colección | JUGADOR |
| GET | `/collection/cards/{cardId}` | Consultar carta y tres evoluciones | JUGADOR |
| POST | `/collection/cards/{cardId}/evolutions` | Desbloquear siguiente evolución con gemas | JUGADOR; clave |
| GET | `/me/evolution-purchases/{purchaseId}` | Consultar recibo propio de evolución | JUGADOR |

### Diccionario

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/dictionary/terms` | Buscar términos desbloqueados propios | JUGADOR |
| GET | `/dictionary/terms/{termId}` | Consultar definición y ejemplo de un término desbloqueado | JUGADOR |

### Privacidad

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/privacy/help` | Consultar responsable y canal de privacidad | PUBLICO |
| GET | `/me/privacy/export` | Descargar datos propios como JSON | JUGADOR; identidad reciente |
| GET | `/me/privacy/requests` | Consultar solicitudes de privacidad propias | JUGADOR |
| POST | `/me/privacy/requests` | Solicitar acceso, rectificación, cancelación u oposición | JUGADOR; clave |
| GET | `/me/privacy/requests/{requestId}` | Consultar expediente y resolución propios | JUGADOR |
| POST | `/me/privacy/requests/{requestId}/messages` | Aportar aclaración a solicitud propia | JUGADOR; clave |
| POST | `/me/deletion-requests` | Confirmar cancelación total de la cuenta | JUGADOR; identidad reciente, clave |
| POST | `/privacy/intake-challenges` | Verificar correo para canal alternativo de privacidad | PUBLICO; clave |
| POST | `/privacy/intake-challenges/{challengeId}/resend` | Reenviar código del canal de privacidad | PUBLICO; clave |
| POST | `/privacy/intake-challenges/{challengeId}/verify` | Obtener acceso limitado al canal de privacidad | PUBLICO; clave |
| POST | `/privacy/requests` | Crear solicitud desde correo verificado sin sesión de jugador | SOLICITANTE_PRIVACIDAD; clave |
| GET | `/privacy/requests/{requestId}` | Consultar estado mínimo por canal alternativo | SOLICITANTE_PRIVACIDAD |
| POST | `/privacy/requests/{requestId}/attachments` | Aportar documento privado para acreditar solicitud | JUGADOR/SOLICITANTE_PRIVACIDAD; clave |
| POST | `/privacy/email-confirmations` | Confirmar nuevo correo de rectificación aprobada | PUBLICO; clave |
| GET | `/privacy/requests` | Recuperar folios del canal alternativo verificado | SOLICITANTE_PRIVACIDAD |

### Medios

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/media/{mediaId}` | Obtener archivo autorizado | JUGADOR/ADMINISTRADOR |

### Moderación

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/admin/dashboard` | Consultar panel y avisos de revisión | ADMINISTRADOR |
| GET | `/admin/players/{playerId}/sanctions` | Consultar historial de sanciones | ADMINISTRADOR |
| POST | `/admin/players/{playerId}/sanctions` | Suspender o bloquear cuenta de jugador | ADMINISTRADOR; identidad reciente, clave |
| GET | `/admin/sanctions/{sanctionId}` | Consultar sanción y vigencia | ADMINISTRADOR |
| POST | `/admin/sanctions/{sanctionId}/revocations` | Levantar sanción con justificación | ADMINISTRADOR; identidad reciente, clave, If-Match |
| GET | `/admin/review-cases` | Consultar inconsistencias para revisión | ADMINISTRADOR |
| GET | `/admin/review-cases/{caseId}` | Consultar caso de inconsistencia | ADMINISTRADOR |
| POST | `/admin/review-cases/{caseId}/resolutions` | Registrar resolución de inconsistencia | ADMINISTRADOR; clave, If-Match |

### Contenido administrativo

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/admin/units` | Consultar unidades administrativas | ADMINISTRADOR |
| POST | `/admin/units` | Crear unidad al final como borrador | ADMINISTRADOR; clave |
| POST | `/admin/units/order` | Reordenar tramo de unidades todavía no utilizado | ADMINISTRADOR; clave, If-Match |
| GET | `/admin/units/{unitId}` | Consultar unidad y bloqueo de estructura | ADMINISTRADOR |
| PATCH | `/admin/units/{unitId}` | Corregir nombre y descripción de unidad | ADMINISTRADOR; clave, If-Match |
| DELETE | `/admin/units/{unitId}` | Eliminar unidad borrador nunca utilizada | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/units/{unitId}/publish` | Publicar unidad completa | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/units/{unitId}/disable` | Deshabilitar unidad sin borrar progreso | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/units/{unitId}/enable` | Volver a habilitar unidad válida | ADMINISTRADOR; clave, If-Match |
| GET | `/admin/units/{unitId}/levels` | Consultar niveles y orden de unidad | ADMINISTRADOR |
| POST | `/admin/units/{unitId}/levels` | Añadir nivel borrador a unidad no utilizada | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/units/{unitId}/levels/order` | Reordenar niveles de unidad no utilizada | ADMINISTRADOR; clave, If-Match |
| GET | `/admin/levels/{levelId}` | Consultar borrador y revisión publicada de nivel | ADMINISTRADOR |
| PATCH | `/admin/levels/{levelId}` | Editar metadatos y términos del nivel | ADMINISTRADOR; clave, If-Match |
| DELETE | `/admin/levels/{levelId}` | Eliminar nivel borrador de unidad no utilizada | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/levels/{levelId}/publish` | Publicar revisión completa del nivel | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/levels/{levelId}/disable` | Deshabilitar nuevos intentos del nivel | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/levels/{levelId}/enable` | Volver a habilitar nivel válido | ADMINISTRADOR; clave, If-Match |
| GET | `/admin/levels/{levelId}/activities` | Consultar composición del borrador | ADMINISTRADOR |
| POST | `/admin/levels/{levelId}/activities` | Añadir actividad al borrador del nivel | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/levels/{levelId}/activities/order` | Reordenar actividades del borrador | ADMINISTRADOR; clave, If-Match |
| GET | `/admin/activities/{activityId}` | Consultar actividad con soluciones administrativas | ADMINISTRADOR |
| PATCH | `/admin/activities/{activityId}` | Editar contenido o criterio de actividad | ADMINISTRADOR; clave, If-Match |
| DELETE | `/admin/activities/{activityId}` | Retirar actividad del borrador del nivel | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/activities/{activityId}/board-generations` | Generar tablero válido para revisión | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/activities/{activityId}/board-approval` | Aprobar distribución generada | ADMINISTRADOR; clave, If-Match |
| GET | `/admin/units/{unitId}/card` | Consultar carta y etapas de la unidad | ADMINISTRADOR |
| PUT | `/admin/units/{unitId}/card` | Crear o editar borrador de carta de unidad | ADMINISTRADOR; clave, If-Match |
| GET | `/admin/cards/{cardId}` | Consultar carta administrativa | ADMINISTRADOR |
| POST | `/admin/cards/{cardId}/publish` | Publicar carta con cuatro imágenes distintas | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/cards/{cardId}/disable` | Deshabilitar adquisiciones nuevas de carta | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/cards/{cardId}/enable` | Volver a habilitar carta completa | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/cards/{cardId}/evolutions/{stage}/disable` | Deshabilitar compra de una evolución | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/cards/{cardId}/evolutions/{stage}/enable` | Volver a habilitar compra de una evolución | ADMINISTRADOR; clave, If-Match |
| GET | `/admin/terms` | Buscar términos administrativos | ADMINISTRADOR |
| POST | `/admin/terms` | Crear término borrador | ADMINISTRADOR; clave |
| GET | `/admin/terms/{termId}` | Consultar término administrativo | ADMINISTRADOR |
| PATCH | `/admin/terms/{termId}` | Corregir borrador de término | ADMINISTRADOR; clave, If-Match |
| DELETE | `/admin/terms/{termId}` | Eliminar término nunca publicado | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/terms/{termId}/publish` | Publicar término o corrección | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/terms/{termId}/disable` | Deshabilitar nuevos desbloqueos de término | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/terms/{termId}/enable` | Volver a habilitar término | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/media` | Cargar imagen privada para contenido | ADMINISTRADOR; clave |
| DELETE | `/admin/media/{mediaId}` | Eliminar medio no utilizado | ADMINISTRADOR; clave |
| GET | `/admin/legal/documents` | Consultar borradores y versiones legales | ADMINISTRADOR |
| POST | `/admin/legal/documents` | Crear nueva versión legal como borrador | ADMINISTRADOR; clave |
| GET | `/admin/legal/documents/{documentVersionId}` | Consultar versión legal administrativa | ADMINISTRADOR |
| PUT | `/admin/legal/documents/{documentVersionId}` | Editar contenido de versión legal no publicada | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/legal/documents/{documentVersionId}/publish` | Publicar versión legal y sustituir la vigente | ADMINISTRADOR; identidad reciente, clave, If-Match |

### Jugadores administrativos

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/admin/players` | Buscar jugadores con datos mínimos | ADMINISTRADOR |
| GET | `/admin/players/{playerId}` | Consultar estado, economía y progreso del jugador | ADMINISTRADOR |
| POST | `/admin/players/{playerId}/personal-data-accesses` | Consultar datos personales con motivo auditado | ADMINISTRADOR; identidad reciente, clave |
| GET | `/admin/players/{playerId}/gem-movements` | Revisar movimientos de gemas de jugador | ADMINISTRADOR |
| POST | `/admin/players/{playerId}/gem-adjustments` | Corregir saldo de gemas con justificación | ADMINISTRADOR; identidad reciente, clave |
| POST | `/admin/players/{playerId}/xp-adjustments` | Corregir XP acumulada con justificación | ADMINISTRADOR; identidad reciente, clave |
| POST | `/admin/players/{playerId}/life-adjustments` | Corregir vidas por incidencia comprobada | ADMINISTRADOR; identidad reciente, clave |
| POST | `/admin/players/{playerId}/progress-corrections` | Restaurar progreso legítimo desde intento aprobado | ADMINISTRADOR; identidad reciente, clave |

### Privacidad administrativa

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/admin/privacy/requests` | Consultar bandeja de solicitudes de privacidad | ADMINISTRADOR |
| GET | `/admin/privacy/requests/{requestId}` | Consultar expediente de privacidad | ADMINISTRADOR |
| POST | `/admin/privacy/requests/{requestId}/identity-checks` | Registrar verificación de identidad o representación | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/privacy/requests/{requestId}/messages` | Registrar requerimiento o aclaración del trámite | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/privacy/requests/{requestId}/extensions` | Registrar ampliación justificada de plazo | ADMINISTRADOR; clave, If-Match |
| POST | `/admin/privacy/requests/{requestId}/resolutions` | Resolver solicitud con fundamento | ADMINISTRADOR; identidad reciente, clave, If-Match |
| POST | `/admin/privacy/requests/{requestId}/executions` | Ejecutar resolución procedente o parcial | ADMINISTRADOR; identidad reciente, clave, If-Match |
| GET | `/admin/privacy/executions/{privacyExecutionId}` | Consultar ejecución y pasos de depuración pendientes | ADMINISTRADOR |
| GET | `/admin/privacy/requests/{requestId}/export` | Obtener reporte del titular para solicitud acreditada | ADMINISTRADOR; identidad reciente |

### Auditoría

| Método | Ruta | Operación | Acceso |
|---|---|---|---|
| GET | `/admin/audit-events` | Consultar bitácora administrativa protegida | ADMINISTRADOR |
| GET | `/admin/audit-events/{auditEventId}` | Consultar evidencia de una acción | ADMINISTRADOR |
| GET | `/admin/maintenance/status` | Consultar salud de tareas y eliminaciones | ADMINISTRADOR |

## Escenarios para revisar y convertir en pruebas

Son resultados esperados del contrato. No son pruebas ejecutadas contra un backend existente.

| Caso | Resultado esperado |
|---|---|
| Inicio repetido con misma clave | Un solo intento y una sola reserva. |
| Respuesta repetida por pérdida de red | Un error/avance como máximo; no duplica la actividad en pendientes. |
| Una actividad falla dos veces y luego aprueba | No consume vida; continúa o aprueba el nivel completo. |
| Tercer fallo de una actividad | Termina intento y consume exactamente una vida. |
| Cuarta comprobación de crucigrama correcta | Aprueba si aún no había cuatro comprobaciones incorrectas. |
| Actividad nueva del mismo tipo | Contadores separados por actividad, no por tipo. |
| Cinco vidas al iniciar | Totales 5; disponibles 4; reservadas 1; no comienza regeneración. |
| Compra que excede máximo con reserva | 409 LIFE_CAP_EXCEEDED, sin gasto ni entrega parcial. |
| Regeneración y compra simultáneas | Validación conjunta del estado al confirmar; totales nunca mayores de cinco. |
| Timeout ya vencido y heartbeat tardío | No revive intento; una sola pérdida. |
| Última respuesta aprobada antes de corte de red | Consultar devuelve APROBADO; no se descuenta vida. |
| Sanción durante intento | Cancelación sin consumo ni recompensa; no se reanuda al levantar sanción. |
| Publicación de nueva aceptación durante intento | No fuerza pérdida; bloquea nuevos inicios/compras hasta aceptación. |
| Deshabilitación ordinaria con intento abierto | Conserva contenido y derechos fijados; puede terminar. |
| Repetir nivel completado y aprobar | No da XP/gemas/carta de nuevo; sí puede mantener racha. |
| Cambio de fecha local hacia atrás por zona | No aumenta ni retrocede última fecha de racha. |
| Editar recorrido de unidad utilizada | 409 STRUCTURE_LOCKED; no recalcula aprobaciones. |
| Editar actividad durante intento | Solo cambia borrador/futuros intentos; snapshot activo estable. |
| Dos administradores editan misma versión | Primero confirma; segundo obtiene 412 VERSION_CONFLICT. |
| Falla escritura de auditoría | No se confirma modificación administrativa. |
| ID de intento de otro jugador | 404 sin datos del propietario. |
| Acceso directo a imagen de etapa bloqueada | 404; conocer mediaId no concede acceso. |
| Correo verificado por canal alternativo ARCO | Solo folios/estado propio; no exporta perfil sin identidad acreditada. |
| Eliminación con respuesta perdida y sesiones revocadas | Canal de privacidad permite recuperar estado mínimo sin revivir cuenta. |
| Restaurar respaldo con cuenta eliminada | Reaplicar eliminación antes de operar; no retroceder control ni reiniciar vencimientos. |
| Registro con documentos que cambiaron | 409 LEGAL_VERSION_OUTDATED; no atribuir aceptación de documento no visto. |
| Reutilizar refresh tras ventana de recuperación | Revoca sesión y exige nuevo acceso. |
| Bloqueo de cuenta permanente | No juega ni gasta; mantiene mecanismos para ejercer privacidad. |
| Documento publicado corregido | Nueva versión, sin sobrescribir texto ni aceptaciones históricas. |
| Depuración o tercero con pasos pendientes | Ejecución de cancelación no aparece COMPLETADA hasta resolverlos. |

## Cierre operativo antes de datos reales

El contrato puede implementarse sin elegir primero un esquema físico. Antes de operar con personas reales se requieren responsable y canal de privacidad reales, calendario y fundamento de conservación aplicables, configuración comprobada de proveedores/TLS/cifrado/permisos y una prueba de restauración que respete eliminaciones.
Los plazos de logs/respaldos/auditoría son políticas técnicas de Criterika; no se presentan como un plazo legal universal. Las tareas de mantenimiento se ejecutan en el backend, no como automatizaciones de ChatGPT.

## Referencias técnicas

- [OpenAPI 3.1.0, especificación oficial](https://spec.openapis.org/oas/v3.1.0.html)
- [Bearer Authentication, documentación de Swagger](https://swagger.io/docs/specification/v3_0/authentication/bearer-authentication/)

## Validación del documento

Validación completada: OpenAPI 3.1.0 mediante openapi-spec-validator 0.9.0; 6018 comprobaciones estáticas; 95 ejemplos válidos; 18 casos de entrada inválida rechazados por schema; referencias internas resueltas; operationId únicos, parámetros de ruta y permisos administrativos revisados. Cero errores detectados. Validar el documento no demuestra que TLS, cron, borrado, cifrado o transacciones estén implementados.
