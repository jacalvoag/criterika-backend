# Criterika — Informe de pruebas PostgreSQL

Fecha: 15 de noviembre de 2026.

**Resultado: 34 pruebas ejecutadas, 0 fallos y 0 errores.**

Motor: PostgreSQL 18.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 14.2.1 20250110 (Red Hat 14.2.1-11), 64-bit.

Se creó una instancia efímera local de PostgreSQL y una base vacía exclusiva para esta comprobación. Se aplicó el paquete completo con `aplicar.py`, se cargaron los fixtures de prueba y se ejecutó la suite con psycopg 3.3.9. La instancia se detuvo al terminar. No se modificó una base real del proyecto.

## Cobertura comprobada

- Instalación de 53 tablas de negocio y 88 relaciones; cinco estados técnicos iniciales.
- Reaplicación sin duplicar versión y rechazo de SQL cuyo contenido no coincide con el manifiesto.
- Reversión de la migración completa ante un error deliberado en su último archivo.
- Rangos de vidas y gemas, roles, titularidad de relaciones, exclusividad de intento activo y límites de ejecuciones.
- Correspondencia de movimientos económicos con su origen y su importe.
- Auditoría administrativa automática, omisión de valores privados, enlace con titulares indirectos y rechazo de edición de bitácora por el grupo de aplicación.
- Reversión de un cambio cuando falla la escritura de su auditoría.
- Protección de revisiones e intentos cerrados y fijación de estructura utilizada.
- Dos transacciones simultáneas de compra: una confirma y la otra rechaza superar cinco vidas; saldo final coherente.
- Dos transacciones simultáneas de primera recompensa: solo una acredita gemas y XP.

## Límites de esta comprobación

Las transacciones de concurrencia son código SQL de prueba; aún deben implementarse en los servicios NestJS. Las pruebas no acreditan evaluación real de minijuegos, endpoints HTTP, tareas de depuración, eliminación de objetos o datos de terceros, restauración de respaldos, TLS ni cifrado en reposo. Los fixtures usan personas y contenido ficticios; no permiten autenticar usuarios. La prueba de titularidad directa no equivale a aislamiento de lectura por RLS.

## Casos ejecutados

| Caso | Resultado |
| --- | --- |
| `test_01_tablas` | Correcto |
| `test_02_relaciones` | Correcto |
| `test_03_datos_tecnicos` | Correcto |
| `test_04_reaplicar` | Correcto |
| `test_05_integridad_archivos` | Correcto |
| `test_06_saldo_negativo` | Correcto |
| `test_07_vidas_seis` | Correcto |
| `test_08_vidas_sin_reloj` | Correcto |
| `test_09_cuarto_admin` | Correcto |
| `test_10_rol_inmutable` | Correcto |
| `test_11_admin_sin_juego` | Correcto |
| `test_12_escritura_otro_titular` | Correcto |
| `test_13_un_intento_activo` | Correcto |
| `test_14_cuarta_ejecucion` | Correcto |
| `test_15_aprobacion_otro_jugador` | Correcto |
| `test_16_posicion_de_revision` | Correcto |
| `test_17_movimiento_faltante` | Correcto |
| `test_18_movimiento_importe_erroneo` | Correcto |
| `test_19_movimiento_otro_propietario` | Correcto |
| `test_20_auditoria_automatica` | Correcto |
| `test_21_bitacora_no_editable` | Correcto |
| `test_22_contexto_mantenimiento_falso` | Correcto |
| `test_23_estructura_fijada` | Correcto |
| `test_24_terminal_inmutable` | Correcto |
| `test_25_revision_inmutable` | Correcto |
| `test_26_revision_incompleta` | Correcto |
| `test_27_avatar_ajeno` | Correcto |
| `test_28_auditoria_fallida_revierte_cambio` | Correcto |
| `test_29_concurrencia_compras` | Correcto |
| `test_30_concurrencia_primera_aprobacion` | Correcto |
| `test_31_instalacion_fallida_es_atomica` | Correcto |
| `test_32_contexto_inventado` | Correcto |
| `test_33_primera_aprobacion_requiere_resultado` | Correcto |
| `test_34_auditoria_titular_indirecto` | Correcto |

El resultado estructurado original está en `tests/resultados.json`. La suite reproducible está en `tests/ejecutar.py`.
