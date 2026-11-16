# Asignación funcional de operaciones de la API

Referencia: [contrato y guía](../openapi/criterika_guia_contrato_v1.md), versión funcional 1.0.2. Todas las rutas llevan el prefijo `/api/v1`.

Esta matriz asigna el caso de uso, los DTO, los controladores y las pruebas HTTP. **La persistencia de todas las operaciones corresponde a José** conforme al [acuerdo del equipo](responsabilidades.md). No implica endpoints implementados.

| Responsable funcional | Operaciones |
| --- | --- |
| José | 4, además de toda la base de datos y persistencia |
| Uzzi | 69 |
| Rafael | 69 |

La asignación se hace por función. Por ejemplo, Uzzi mantiene el perfil y las sesiones, mientras Rafael mantiene `/me/economy` y `/me/progress`; también las correcciones administrativas de economía/progreso. Los medios compartidos pertenecen a Uzzi y los controles de almacenamiento se coordinan con José. La edición administrativa de contenido pertenece a Rafael.

| Método | Ruta | Responsable funcional |
| --- | --- | --- |
| GET | `/health` | José |
| GET | `/legal/documents/current` | Uzzi |
| GET | `/legal/documents/{documentVersionId}` | Uzzi |
| GET | `/me/acceptances` | Uzzi |
| POST | `/me/acceptances` | Uzzi |
| POST | `/auth/registrations` | Uzzi |
| POST | `/auth/registrations/{registrationId}/resend` | Uzzi |
| POST | `/auth/registrations/{registrationId}/verify` | Uzzi |
| POST | `/auth/sessions` | Uzzi |
| POST | `/auth/refresh` | Uzzi |
| POST | `/auth/password-reset-requests` | Uzzi |
| POST | `/auth/password-resets` | Uzzi |
| POST | `/auth/logout` | Uzzi |
| POST | `/auth/reauthentications` | Uzzi |
| POST | `/admin/auth/challenges` | Uzzi |
| POST | `/admin/auth/challenges/{challengeId}/resend` | Uzzi |
| POST | `/admin/auth/challenges/{challengeId}/verify` | Uzzi |
| POST | `/admin/auth/refresh` | Uzzi |
| POST | `/admin/auth/logout` | Uzzi |
| GET | `/admin/me` | Uzzi |
| GET | `/me` | Uzzi |
| PATCH | `/me` | Uzzi |
| PUT | `/me/avatar` | Uzzi |
| DELETE | `/me/avatar` | Uzzi |
| GET | `/me/sessions` | Uzzi |
| DELETE | `/me/sessions/{sessionId}` | Uzzi |
| GET | `/me/economy` | Rafael |
| GET | `/me/progress` | Rafael |
| GET | `/me/gem-movements` | Rafael |
| PUT | `/me/password` | Uzzi |
| GET | `/learning/path` | Rafael |
| GET | `/levels/{levelId}` | Rafael |
| GET | `/me/attempts` | Rafael |
| GET | `/me/attempts/current` | Rafael |
| POST | `/levels/{levelId}/attempts` | Rafael |
| GET | `/attempts/{attemptId}` | Rafael |
| POST | `/attempts/{attemptId}/heartbeats` | Rafael |
| POST | `/attempts/{attemptId}/abandonments` | Rafael |
| GET | `/attempts/{attemptId}/execution` | Rafael |
| POST | `/attempts/{attemptId}/executions/{executionId}/answers` | Rafael |
| GET | `/shop/life-packages` | Rafael |
| POST | `/me/life-purchases` | Rafael |
| GET | `/me/life-purchases/{purchaseId}` | Rafael |
| GET | `/collection/cards` | Rafael |
| GET | `/collection/cards/{cardId}` | Rafael |
| POST | `/collection/cards/{cardId}/evolutions` | Rafael |
| GET | `/me/evolution-purchases/{purchaseId}` | Rafael |
| GET | `/dictionary/terms` | Rafael |
| GET | `/dictionary/terms/{termId}` | Rafael |
| GET | `/privacy/help` | Uzzi |
| GET | `/me/privacy/export` | Uzzi |
| GET | `/me/privacy/requests` | Uzzi |
| POST | `/me/privacy/requests` | Uzzi |
| GET | `/me/privacy/requests/{requestId}` | Uzzi |
| POST | `/me/privacy/requests/{requestId}/messages` | Uzzi |
| POST | `/me/deletion-requests` | Uzzi |
| POST | `/privacy/intake-challenges` | Uzzi |
| POST | `/privacy/intake-challenges/{challengeId}/resend` | Uzzi |
| POST | `/privacy/intake-challenges/{challengeId}/verify` | Uzzi |
| POST | `/privacy/requests` | Uzzi |
| GET | `/privacy/requests/{requestId}` | Uzzi |
| POST | `/privacy/requests/{requestId}/attachments` | Uzzi |
| POST | `/privacy/email-confirmations` | Uzzi |
| GET | `/privacy/requests` | Uzzi |
| GET | `/media/{mediaId}` | Uzzi |
| GET | `/admin/dashboard` | Uzzi |
| GET | `/admin/players/{playerId}/sanctions` | Uzzi |
| POST | `/admin/players/{playerId}/sanctions` | Uzzi |
| GET | `/admin/sanctions/{sanctionId}` | Uzzi |
| POST | `/admin/sanctions/{sanctionId}/revocations` | Uzzi |
| GET | `/admin/review-cases` | Uzzi |
| GET | `/admin/review-cases/{caseId}` | Uzzi |
| POST | `/admin/review-cases/{caseId}/resolutions` | Uzzi |
| GET | `/admin/units` | Rafael |
| POST | `/admin/units` | Rafael |
| POST | `/admin/units/order` | Rafael |
| GET | `/admin/units/{unitId}` | Rafael |
| PATCH | `/admin/units/{unitId}` | Rafael |
| DELETE | `/admin/units/{unitId}` | Rafael |
| POST | `/admin/units/{unitId}/publish` | Rafael |
| POST | `/admin/units/{unitId}/disable` | Rafael |
| POST | `/admin/units/{unitId}/enable` | Rafael |
| GET | `/admin/units/{unitId}/levels` | Rafael |
| POST | `/admin/units/{unitId}/levels` | Rafael |
| POST | `/admin/units/{unitId}/levels/order` | Rafael |
| GET | `/admin/levels/{levelId}` | Rafael |
| PATCH | `/admin/levels/{levelId}` | Rafael |
| DELETE | `/admin/levels/{levelId}` | Rafael |
| POST | `/admin/levels/{levelId}/publish` | Rafael |
| POST | `/admin/levels/{levelId}/disable` | Rafael |
| POST | `/admin/levels/{levelId}/enable` | Rafael |
| GET | `/admin/levels/{levelId}/activities` | Rafael |
| POST | `/admin/levels/{levelId}/activities` | Rafael |
| POST | `/admin/levels/{levelId}/activities/order` | Rafael |
| GET | `/admin/activities/{activityId}` | Rafael |
| PATCH | `/admin/activities/{activityId}` | Rafael |
| DELETE | `/admin/activities/{activityId}` | Rafael |
| POST | `/admin/activities/{activityId}/board-generations` | Rafael |
| POST | `/admin/activities/{activityId}/board-approval` | Rafael |
| GET | `/admin/units/{unitId}/card` | Rafael |
| PUT | `/admin/units/{unitId}/card` | Rafael |
| GET | `/admin/cards/{cardId}` | Rafael |
| POST | `/admin/cards/{cardId}/publish` | Rafael |
| POST | `/admin/cards/{cardId}/disable` | Rafael |
| POST | `/admin/cards/{cardId}/enable` | Rafael |
| POST | `/admin/cards/{cardId}/evolutions/{stage}/disable` | Rafael |
| POST | `/admin/cards/{cardId}/evolutions/{stage}/enable` | Rafael |
| GET | `/admin/terms` | Rafael |
| POST | `/admin/terms` | Rafael |
| GET | `/admin/terms/{termId}` | Rafael |
| PATCH | `/admin/terms/{termId}` | Rafael |
| DELETE | `/admin/terms/{termId}` | Rafael |
| POST | `/admin/terms/{termId}/publish` | Rafael |
| POST | `/admin/terms/{termId}/disable` | Rafael |
| POST | `/admin/terms/{termId}/enable` | Rafael |
| POST | `/admin/media` | Uzzi |
| DELETE | `/admin/media/{mediaId}` | Uzzi |
| GET | `/admin/legal/documents` | Uzzi |
| POST | `/admin/legal/documents` | Uzzi |
| GET | `/admin/legal/documents/{documentVersionId}` | Uzzi |
| PUT | `/admin/legal/documents/{documentVersionId}` | Uzzi |
| POST | `/admin/legal/documents/{documentVersionId}/publish` | Uzzi |
| GET | `/admin/players` | Uzzi |
| GET | `/admin/players/{playerId}` | Uzzi |
| POST | `/admin/players/{playerId}/personal-data-accesses` | Uzzi |
| GET | `/admin/players/{playerId}/gem-movements` | Rafael |
| POST | `/admin/players/{playerId}/gem-adjustments` | Rafael |
| POST | `/admin/players/{playerId}/xp-adjustments` | Rafael |
| POST | `/admin/players/{playerId}/life-adjustments` | Rafael |
| POST | `/admin/players/{playerId}/progress-corrections` | Rafael |
| GET | `/admin/privacy/requests` | Uzzi |
| GET | `/admin/privacy/requests/{requestId}` | Uzzi |
| POST | `/admin/privacy/requests/{requestId}/identity-checks` | Uzzi |
| POST | `/admin/privacy/requests/{requestId}/messages` | Uzzi |
| POST | `/admin/privacy/requests/{requestId}/extensions` | Uzzi |
| POST | `/admin/privacy/requests/{requestId}/resolutions` | Uzzi |
| POST | `/admin/privacy/requests/{requestId}/executions` | Uzzi |
| GET | `/admin/privacy/executions/{privacyExecutionId}` | Uzzi |
| GET | `/admin/privacy/requests/{requestId}/export` | Uzzi |
| GET | `/admin/audit-events` | José |
| GET | `/admin/audit-events/{auditEventId}` | José |
| GET | `/admin/maintenance/status` | José |

Comprobación al preparar esta matriz: 142 pares método/ruta únicos, cada uno con un responsable; sin cambios en rutas o reglas del contrato. Toda operación nueva necesita un responsable antes de implementarse.
