# Persistencia del primer flujo jugable

Entrega de José para la solicitud de Rafael, basada en `develop` `7f63abb`.
Contrato 1.0.2 y migración `0001_inicial`; no se modifica el esquema instalado.

## Estado y responsabilidades

Esta entrega implementa SQL parametrizado, conversiones, bloqueos, transacciones,
idempotencia y fixtures. Sus pruebas usan un PostgreSQL local desechable con un
login que hereda únicamente `criterika_app`.

Rafael coordina reglas, validación de contenido/estado, proyecciones sin soluciones,
servicios y HTTP. Uzzi proporciona identidad, titularidad y acceso mediante las
capacidades públicas de `security`, `accounts` y `legal`. José implementa también
el SQL que esas capacidades necesiten. `GameAccountRepository.lockPlayerAccount`
bloquea y lee la cuenta; no sustituye ninguna autorización ni verifica una sesión.

Los repositorios son proveedores internos de sus respectivos módulos. Los módulos
funcionales registran estos proveedores y exportan sus servicios públicos; otro
módulo no importa directamente un repositorio para saltarse una capacidad.
No se agregan controladores, rutas, autenticación ficticia o un monitor programado
en esta entrega. Las dependencias funcionales pendientes conservan ese estado.

## Infraestructura disponible

- `TransactionRunner` se exporta desde `PostgresModule`.
- `run(context, work)` utiliza READ COMMITTED, establece el contexto transaccional
  y entrega un único `PoolClient`. Retornar un resultado tipado confirma; lanzar
  una excepción revierte. La traducción de un rechazo a HTTP ocurre después.
- `read(work)` utiliza REPEATABLE READ READ ONLY para vistas compuestas coherentes.
- Ambos métodos liberan el cliente y descartan conexiones dañadas. Un COMMIT sin
  confirmación fiable produce `TransactionCommitUncertainError`; no se ejecuta
  otra vez el callback ni se repite un beneficio a ciegas.
- Los repositorios reciben ese cliente. No abren transacciones ni hacen COMMIT.
  Las llamadas a correo/objetos/terceros quedan fuera de la transacción SQL.
- Los reintentos de conflictos transitorios quedan en el coordinador, acotados y
  conservando la intención; el runner no reejecuta callbacks automáticamente.

## Mapa de las ocho operaciones

| Operación             | Lecturas/escrituras disponibles                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getLearningPath`     | `GameContentRepository.findLearningPath`. Rafael llama `buildLearningPath` sobre el camino completo y pagina el resultado.                                        |
| `getLevelPreview`     | `findPublishedLevelPreview`, `hasFirstApproval`, `findLearningPath`, `GameEconomyRepository.findPlayerState` y `GameplayRepository.findActiveAttempt`.            |
| `startLevelAttempt`   | Bloqueo de cuenta, `lockPlayerState`, `lockActiveAttempt`, `lockLevelForStart`, `findPublishedActivities`, `insertAttempt`, `updateLives` e idempotencia común.   |
| `getCurrentExecution` | `findOwnAttempt` y `findCurrentExecution`; la definición interna contiene soluciones y requiere una proyección autorizada.                                        |
| `submitGameAnswer`    | `lockOwnAttempt`, `lockExecution`, `findInteraction`, `insertInteraction`, actualizaciones de ejecución/actividad/cola, cierre, primera aprobación y concesiones. |
| `heartbeatAttempt`    | `lockOwnAttempt`, `touchAttempt`, `finishAttempt` y `updateLives`, según `resolveAttemptHeartbeat`.                                                               |
| `abandonAttempt`      | `lockOwnAttempt`, `finishAttempt`, `updateLives` e idempotencia común.                                                                                            |
| `getMyEconomy`        | `findPlayerState` y `findActiveAttempt`; Rafael calcula vidas efectivas y vigencia de la racha sin escribir.                                                      |

Las firmas concretas se encuentran en los archivos `repositories/` de cada módulo.
Los tipos compartidos de participación están en
`src/modules/gameplay/repositories/gameplay.rows.ts`. Los tipos de estado económico
y vista previa se exportan desde sus respectivos archivos de repositorio.

## Decisiones para las diez dudas de Rafael

1. **Bloqueos:** cuenta → estado → intento previo → unidad → nivel → inserciones.
   Para respuestas/cierre: cuenta → estado → intento → actividad/ejecución.
   Filas de igual clase se toman en orden estable. La autorización pertenece a las
   capacidades de Uzzi; su consulta SQL pertenece a José. Publicar conserva unidad
   → nivel. El trigger instalado fija `estructura_fijada` al insertar el intento;
   no hace falta otra operación manual `markUnitStructureFixed`.
2. **Idempotencia:** inicio y abandono usan `IdempotencyStore` sobre
   `controles_idempotencia`. Respuestas usan solo `interacciones_evaluadas` y la
   huella común. La autorización/titularidad precede a recuperar datos. La ruta
   incluye los UUID reales de nivel/intento/ejecución, sin filtros personales ni
   tokens. Misma clave/ámbito/cuerpo reproduce; otro cuerpo da conflicto.
3. **Números:** los `bigint` salen como `number` solo tras `safeInteger`. Se
   rechazan valores que perderían precisión, incluido el contador de cola. No se
   altera globalmente el parser de `pg`. La actualización de saldo/XP también
   impide superar el rango seguro.
4. **Tiempo:** capturar `horaServidor` tras los bloqueos necesarios y pasarla a
   reglas y escrituras. Los métodos de esta entrega reciben fechas explícitas.
   En timeout, `finalizadoEn` es el vencimiento devuelto por la regla; liquidar a
   ese instante y después regenerar hasta la hora de procesamiento.
5. **JSON y tablero:** Rafael valida la forma por tipo. `contenido`, `criterio` y
   `estadoJuego` salen como `unknown`. El repositorio valida que lo escrito sea
   un objeto JSON representable, sin reemplazar los schemas funcionales. El tablero
   del intento se lee de la revisión, nunca del candidato editable actual.
6. **GET:** solo lectura. Un intento vencido deja de ofrecer ejecución y reserva
   efectiva; economía proyecta el consumo al vencimiento y la regeneración posterior.
   Consultar no persiste el cierre, crea ejecuciones ni renueva la comunicación.
   Comandos y monitor usan la misma resolución temporal y bloqueos para persistirlo.
7. **Términos:** `findPublishedTermIds` selecciona publicados de la revisión;
   `insertAttempt` fija esos IDs en `terminos_intento`. La concesión posterior usa
   esa tabla sin filtrar de nuevo por disponibilidad actual. Un cambio concurrente
   entre selección y fijación que invalide los IDs provoca rollback y debe
   reevaluarse; nunca se otorga silenciosamente un conjunto diferente.
8. **Abandono:** salida explícita usa `SALIDA_CONFIRMADA`; falta de comunicación,
   `TIMEOUT`. `INTERRUPCION` queda reservado a una señal confirmada por servidor,
   sin endpoint nuevo ni motivo elegido por el cliente. `finishAttempt` retorna
   `false` si ya terminó. Al cerrar por fallo/abandono/cancelación, cierra la
   ejecución abierta como FALLIDA y refleja su historial en la actividad
   (recuperable o agotada), sin abrir otra ejecución ni aplicar otro consumo.
   La cola restante es un snapshot sin posibilidad de reanudación.
9. **Lecturas:** vistas compuestas en `TransactionRunner.read`; los comandos
   continúan con READ COMMITTED y bloqueos. La fecha `date` de racha se selecciona
   como texto `YYYY-MM-DD`; los instantes `timestamptz` salen como `Date`.
10. **Fixtures:** `database/fixtures/01_flujo_jugable.sql` es independiente del
    fixture de integridad anterior. Cada prueba prepara sus propios intentos
    activos y recuperaciones para que J1 pueda empezar realmente sin intento.
    Se usa exclusivamente una base local desechable `criterika_prueba_*`.

## Forma interna del tablero publicado

Para sopa/crucigrama, el borrador conserva el `Admin*Content` del contrato:
`tipo`, `palabras` y `tablero: { filas, columnas }`. Al publicar, copiar el
`GeneratedBoard` aprobado en una propiedad interna adicional `distribucion`:

```ts
// Forma privada de actividades_revision.contenido, no un DTO de entrada/salida.
{
  tipo: 'SOPA_LETRAS', // o CRUCIGRAMA
  palabras: [/* WordClueInput validados */],
  tablero: { filas: 5, columnas: 5 },
  distribucion: {
    tipo: 'SOPA_LETRAS',
    filas: 5,
    columnas: 5,
    cuadricula: [/* filas del tablero aprobado */],
    ubicaciones: [/* BoardPlacement: palabraId, textoNormalizado, inicio, orientacion */],
  },
}
```

El fixture reproduce esa copia desde `generaciones_tablero.distribucion`. La
publicación productiva y el validador funcional de esa forma siguen siendo
responsabilidad del servicio de contenido de Rafael. El servicio de gameplay
combina esa distribución con las palabras de la misma revisión y construye el
DTO jugable sin ubicaciones/soluciones privadas. Los otros tres tipos conservan
el contenido de administración ya publicado.

## Orden de integración y correcciones de flujo

En cada comando, resolver identidad y titularidad, tomar los bloqueos y recuperar
primero la intención ya confirmada. Esto incluye una respuesta que ya cerró la
ejecución o aprobó el nivel: recuperar antes de `ATTEMPT_FINISHED`,
`EXECUTION_NOT_CURRENT` o `ANSWER_ALREADY_CONFIRMED`. Para una intención nueva sí
se validan timeout, ejecución actual y selección, según el contrato.

`interacciones_evaluadas.evaluacion` debe conservar un objeto público reproducible
con versión de formato, feedback revelado y resultado original completo de la
acción (`GameActionResult`), no solo el feedback. El resultado se serializa a JSON
antes de guardarlo. Nunca incluye soluciones futuras. `findInteraction` devuelve
también `registradaEn` para aplicar la ventana de recuperación del contrato;
después de expirar la caché, su unicidad histórica sigue evitando otro efecto.

Evaluar el resultado del nivel antes de crear la siguiente ejecución. Un tercer
fallo termina y liquida una vez. Si continúa, mover la actividad recuperable al
final mediante `takeNextPendingOrder`, liberar la anterior y abrir la menor
posición pendiente dentro de la misma transacción.

Para aprobar, cerrar el intento, insertar la primera aprobación y solo si se
creó llamar `creditLevelReward`, `grantCard` cuando corresponda y
`grantAttemptTerms`. `creditLevelReward` comprueba el importe contra la aprobación
y protege el crédito ante otra llamada de la misma aprobación, bajo el bloqueo
de estado. Una repetición no crea otra primera aprobación y no concede premio;
sí puede actualizar la racha con la regla de Rafael.

Si se cierra un intento anterior vencido y después se rechaza otro inicio, o si
una respuesta detecta un timeout, retornar un rechazo tipado desde el callback
para confirmar el cierre/consumo. El adaptador HTTP lanza/mapea el error después
de `run`. Las excepciones técnicas revierten todo el conjunto.

Economía debe calcular la vigencia de la racha: hoy/ayer en la zona del hito
conservan el contador; un día completo omitido muestra cero sin borrar el hito.
`calculateStreak` existente calcula aprobaciones, no esta proyección de consulta.
Una cuenta JUGADOR sin estado económico es una inconsistencia interna, no un 404
de recurso ausente ni una oportunidad para recrear saldos automáticamente.

## Activar idempotencia en los módulos funcionales

Importar `IdempotencyModule` y `PostgresModule` e inyectar `IdempotencyStore` y
`TransactionRunner`. `IdempotencyModule` exige estas dos claves independientes
de 32 bytes en base64, tomadas del entorno del despliegue:

```dotenv
IDEMPOTENCY_HMAC_KEY_BASE64=
IDEMPOTENCY_ENCRYPTION_KEY_BASE64=
```

Generar cada una por separado con `node:crypto.randomBytes(32).toString('base64')`.
Mantenerlas estables y compartidas entre los procesos que atienden las mismas
intenciones. No versionar valores ni reemplazarlas durante la vigencia de las
respuestas que deben recuperarse. Los errores de configuración no incluyen claves.
El módulo valida las claves cuando se importa; la comprobación de base de datos
por sí sola no lo importa ni necesita estas claves.

`claim(client, identity, body, horaServidor)` devuelve NEW, REPLAY, MISMATCH o
IN_PROGRESS. `confirm(client, id, codigoHttp, respuestaJson)` guarda el resultado
cifrado con AES-256-GCM y el ID del control como datos autenticados. Reserva,
efectos y confirmación usan la misma transacción. No confirmar controles de una
operación que se va a revertir. Esta capacidad conserva respuestas 24 horas y se
entrega para inicio/abandono; los flujos que devuelvan tokens necesitan su ventana
específica antes de reutilizarla. Las huellas usan HMAC-SHA-256 con dominio separado.

## Pruebas reproducibles

Preparar una base **local, nueva y desechable** con nombre `criterika_prueba_*`,
aplicar `database/aplicar.py` y crear un login de prueba separado del operador:

```sql
CREATE ROLE criterika_prueba_api LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT criterika_app TO criterika_prueba_api;
```

Asignar su contraseña mediante `\password criterika_prueba_api`. Proporcionar
mediante el entorno `PERSISTENCE_TEST_ADMIN_URL` y `PERSISTENCE_TEST_URL`, apuntando
a esa misma base local con operador y login de aplicación respectivamente. Usar
credenciales ficticias; las contraseñas de una URL deben codificarse correctamente.
La suite no lee `.env`, no utiliza `DB_HOST` y rechaza servidores remotos, nombres
fuera del prefijo y dos conexiones con el mismo login.

```bash
npm run test:persistence
```

La suite **vacía las tablas de `criterika` antes de cada caso** y carga su fixture.
Conserva el registro de migración. Nunca apuntarla a datos que deban conservarse.
Los escenarios cubren commit/rollback, consistencia de lectura, permisos, snapshot,
reintentos, carreras de inicio/timeout, recuperación de actividades, concesiones
y fallo de una carta que revierte la recompensa completa. Sus coordinadores son
exclusivamente arneses de prueba; no representan autenticación o endpoints listos.

La validación de esta rama y sus límites se registran en
`database/tests/informe_persistencia_juego.md`.
