# Persistencia de acceso y sesiones

Entrega de José sobre `develop` `3a97c4da`, para los servicios de acceso y seguridad de Uzzi. Contrato 1.0.2. La migración instalada se conserva; esta entrega no modifica RDS ni expone nuevas rutas.

## Capacidades preparadas

| Método | Resultado y condiciones |
| --- | --- |
| `PostgresLoginAccountRepository.findByNormalizedEmail(tx, email, role)` | Credencial interna y estado mínimo de cuenta, o `null`; coincidencia exacta de correo normalizado y rol solicitado. |
| `PostgresSessionAccessRepository.findActive(tx, accountId, sessionId, role, at)` | Identidad mínima sin hashes para sesión del titular y rol esperados, cuenta habilitada, no revocada, creada y no vencida en el instante indicado. |
| `findRefreshCandidate(tx, refreshHash)` | Referencia interna y coincidencia actual/anterior, o ausencia. Una coincidencia ambigua se rechaza. Incluye candidatos vencidos/revocados para clasificación; no los autoriza. |
| `rotateRefresh(tx, accountId, sessionId, expected, next, clock?)` | Rotación condicional del hash vigente; conserva el anterior y el vencimiento absoluto. Devuelve `false` si la condición dejó de cumplirse. |
| `revokeOwned(tx, accountId, sessionId, clock?)` | Revoca una sesión del titular, limpia confirmación sensible y conserva la primera fecha de revocación. |
| `revokeAll(tx, accountId, clock?)` | Revoca las sesiones no revocadas de la cuenta, sin afectar a otras cuentas; devuelve cantidad modificada. |

La creación de la sesión del nuevo jugador sigue usando `PostgresPlayerSessionRepository.create` y `RegistrationPlayerSessionsService`; no se duplica. Los servicios funcionales registran los nuevos repositorios como proveedores cuando integren sus capacidades. Este bloque no crea un módulo de autenticación paralelo.

## Integración con Uzzi

1. `auth` valida la entrada y normaliza el correo de acuerdo con las reglas existentes. Usa un rol determinado por la operación, nunca elegido libremente por el cliente. La consulta de credencial no decide si debe permitirse el acceso.
2. La proyección de credencial contiene hash Argon2id: mantenerla dentro del proceso de autenticación, no devolverla como DTO ni registrarla en logs. El servicio comprueba contraseña, confirmación de correo, elegibilidad y políticas; aplica límites y respuestas sin enumeración.
3. `security` verifica criptográficamente el JWT y sus claims antes de consultar la sesión por titular, ID y rol esperados. La lectura SQL no valida la firma ni concede permisos; tampoco resuelve sanciones, finalidades o derechos de acceso a recursos particulares.
4. El verificador de refresh es SHA-256 de la representación del token usada por el emisor de registro y tiene 32 bytes. No enviar tokens en claro a estos métodos SQL. La generación, validación del token y política de reutilización corresponden a Uzzi.
5. La búsqueda de refresh es preliminar: después de bloquear o perder una rotación condicional se debe releer el estado antes de clasificar el resultado. `false` por sí solo no prueba reutilización maliciosa; también puede corresponder a revocación, expiración o una solicitud concurrente.
6. La recuperación de una respuesta perdida debe seguir el contrato: misma intención/token dentro de la ventana de cinco minutos y respuesta protegida/autorizada. Resolver la idempotencia antes de decidir revocar por reutilización. `refresh_anterior_hash` solo conserva un predecesor: un hash de generaciones más antiguas puede no encontrarse. Este repositorio no constituye historial completo de tokens ni implementa detección arbitraria de generaciones antiguas; acordar la persistencia adicional necesaria antes de cerrar la política de refresh completa.
7. Si el coordinador determina que hay que revocar, retornar su rechazo tipado después de escribir la revocación para confirmar el efecto con `TransactionRunner.run`. Lanzar una excepción revierte la transacción, incluida la revocación. Un fallo de confirmación no debe reejecutar ciegamente la intención.

El esquema actual no tiene índices específicos para buscar ambos hashes de refresh. La búsqueda está parametrizada y limita las coincidencias devueltas, pero ese `LIMIT` no limita las filas examinadas. Evaluar el plan y volumen antes de desplegar este flujo a escala; un índice requerido se añade mediante una migración nueva.

## Transacciones y tiempo

Lecturas independientes pueden usar `TransactionRunner.read`. Las mutaciones requieren `TransactionRunner.run` y su contexto confiable: `SISTEMA` para acceso público; actor verificado para operaciones autenticadas. Todos los participantes reciben el mismo `PoolClient` y el repositorio no hace `BEGIN`, `COMMIT` ni conexiones adicionales.

Las escrituras bloquean cuenta y después sesión. Revocación global toma primero la misma cuenta para serializar con rotaciones y revocaciones individuales. Capturan `clock()` después de adquirir los bloqueos y rechazan fechas inválidas. El reloj predeterminado es el del servidor; las pruebas suministran un reloj determinista. La creación de una nueva sesión debe respetar este orden de bloqueo cuando compita con una revocación global.

La creación/renovación de JWT, límites de 30 días u ocho horas según rol, confirmación reciente, cookies administrativas, permisos, gestión/listado de sesiones y controladores siguen en sus servicios funcionales o entregas posteriores. No interpretar estos métodos como el cierre de todo acceso y seguridad.

## Comprobación de esta entrega

- `npm run build`, `npx tsc --noEmit` y `npm run lint`: correctos.
- `npm test`: 624 pruebas correctas.
- `npm run test:e2e`: 13 correctas; una PostgreSQL omitida por activación explícita en la suite ordinaria.
- `npm run test:persistence`: 83 correctas, 11 nuevas, con PostgreSQL 18.6 local desechable y login miembro únicamente de `criterika_app`.
- Prueba HTTP de registro con `REGISTRATION_HTTP_TEST=1`: correcta contra esa instancia temporal, con transporte de correo sustituido.

Los casos nuevos cubren correo/rol, SQL parametrizado, titularidad, proyección sin hashes, expiración exacta, cuenta en cancelación, rotación y concurrencia, conservación del vencimiento, revocación propia/global repetible, rollback y verificadores inválidos/ambiguos. Los hashes y usuarios de prueba son ficticios; no se accedió a RDS ni SMTP externos.

Para reproducir, preparar PostgreSQL local desechable con el instalador de `database/README.md` y configurar `PERSISTENCE_TEST_URL` y `PERSISTENCE_TEST_ADMIN_URL` como en la guía de registro. La suite exige la misma base `criterika_prueba_*` y usuarios diferentes; vacía sus tablas y carga fixtures antes de cada caso. No usar una base que contenga datos a conservar.
