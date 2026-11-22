# Verificación de persistencia del flujo jugable

## Entorno y resultados

Validación ejecutada sobre una instancia local temporal de PostgreSQL **18.6**,
Node.js **24.22.3** y la migración `0001_inicial` sin modificaciones. Se creó un
login de aplicación sin privilegios administrativos, con pertenencia únicamente
a `criterika_app`. La instancia se detuvo al finalizar.

| Comprobación                               | Resultado                                   |
| ------------------------------------------ | ------------------------------------------- |
| `npm run build`                            | Correcto                                    |
| `npx tsc --noEmit`                         | Correcto                                    |
| `npm run lint`                             | Correcto                                    |
| Lint adicional de la suite de persistencia | Correcto                                    |
| `npm run test`                             | 483 pruebas correctas, 37 archivos          |
| `npm run test:e2e`                         | 1 prueba HTTP inicial correcta              |
| `npm run test:persistence`                 | 33 pruebas correctas contra PostgreSQL real |
| SQL de migración y manifiesto              | Sin modificaciones                          |

## Escenarios comprobados

- Lectura de camino, nombres publicados, borradores excluidos y progreso existente.
- Vista previa sin contenido/soluciones y datos para bloquear un final sin carta.
- Tableros de la revisión inmutable, independientes de cambios del borrador.
- Conversión segura de bigint, fechas locales como texto y lecturas sin escrituras.
- Instantánea coherente entre consultas y rechazo de escritura en READ ONLY.
- Login de aplicación sin pertenencia a owner/maintenance ni permiso de borrar auditoría.
- Inicio con actividades completas, primera ejecución, reserva implícita y cinco vidas totales.
- Dos inicios concurrentes dejan un solo intento activo.
- Fallo posterior revierte intento, ejecución y modificación de vidas.
- Contexto del actor limitado a su transacción; consultas de titularidad y pertenencia.
- Fallo recuperable al final de cola e historiales separados por actividad.
- Dos fallos seguidos de aprobación conservan vidas; tercero termina sin otra ejecución.
- Primera aprobación, saldo, XP y movimiento confirmados juntos sin duplicar el crédito.
- Repetición sin otra primera recompensa y actualización independiente del hito de racha.
- Concesión de carta y términos fijados, incluso tras deshabilitación posterior.
- Un fallo de concesión de carta revierte aprobación, crédito y estado del intento.
- Interacción confirmada recuperable después de terminar la ejecución/intento.
- Heartbeat de 59 segundos; timeout a 60 segundos con dos procesadores concurrentes.
- Timeout confirmado mediante rechazo tipado y regeneración desde el vencimiento real.
- Rechazo SQL de vidas por debajo del máximo sin reloj de regeneración.
- Idempotencia cifrada, cuerpo normalizado, otra huella, carrera, rollback, vigencia,
  alcance por recurso, corrupción y estado EN_PROCESO.
- Pruebas unitarias del runner: rollback fallido, fallo de contexto/adquisición,
  rechazo diferido en COMMIT y confirmación incierta sin repetir el callback.

## Límites

La suite prueba los repositorios y la coordinación SQL con arneses exclusivos de
prueba, utilizando las reglas existentes cuando corresponde. No implementa ni
certifica las ocho rutas HTTP del juego, autorización/sesiones productivas,
publicación productiva del contenido, validadores completos de JSON por tipo,
programación del monitor, pruebas de carga o despliegue de este código.

Los fixtures incluyen hashes no autenticables, identidades ficticias y claves de
prueba. No se cargaron en RDS ni se utilizaron credenciales de la instancia del
equipo. La conexión TLS con RDS tiene su comprobación independiente en
`docs/development/verificacion_postgresql.md`.

## Reproducción

Seguir la preparación de base local desechable, logins y variables de la
[guía de integración](../../docs/architecture/flujo-jugable-persistencia.md#pruebas-reproducibles).
La suite vacía las tablas de esa base antes de cada caso; no utiliza `.env` ni
permite host remoto. Ejecutar `npm run test:persistence` después de aplicar la
migración. Las pruebas SQL anteriores siguen disponibles mediante
`python database/tests/ejecutar.py`; no se sustituyen ni se atribuye su ejecución
a esta nueva suite.
