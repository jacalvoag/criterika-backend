# Verificación de persistencia del registro

Entrega basada en `develop` `fc209ff`, que ya incluye la PR #19 de Uzzi.

## Resultado ejecutado

| Comprobación                                    | Resultado                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Node.js / PostgreSQL                            | 24.22.3 / 18.6                                                             |
| `npm run build`                                 | Correcto                                                                   |
| `npx tsc --noEmit`                              | Correcto                                                                   |
| `npm run lint` y lint adicional de la suite SQL | Correctos, sin advertencias de código                                      |
| `npm test`                                      | 592 pruebas, 55 archivos, correctas                                        |
| `npm run test:e2e`                              | 1 prueba HTTP inicial correcta                                             |
| `npm run test:persistence`                      | 63 correctas: 33 del juego y 30 del registro                               |
| SMTP                                            | Entrega real a un servidor local con TLS y certificado verificado          |
| `npm run registration:mail -- 1`                | Ejecución sobre la base local desechable; composición y cierre del proceso |
| Migración `0001_inicial` y manifiesto           | Sin modificaciones                                                         |

La base se creó exclusivamente para pruebas, con nombre `criterika_prueba_*`.
El login de aplicación hereda `criterika_app`, sin privilegios administrativos.
El proceso PostgreSQL temporal se detuvo al finalizar cada ejecución. No se usaron
credenciales de RDS ni destinos de correo externos.

## Casos del registro comprobados

- Documentos publicados coherentes, sin datos de sustitución ante configuración ausente.
- Inicio con aceptación original, fecha local como texto, código HMAC y mensaje cifrado.
- Una intención concurrente de inicio produce un solo pendiente/código; cuerpo diferente se rechaza.
- Confirmación atómica de cuenta, estado inicial, aceptación, consumo y sesión.
- Estado inicial: cinco vidas, saldos y racha cero, sin próxima regeneración ni premios.
- Tokens JWT firmados con RSA y refresh guardado solo como SHA-256.
- Dos verificaciones concurrentes, con claves distintas, producen una sola cuenta y sesión.
- Replay del éxito devuelve los tokens originales antes de reevaluar el código consumido.
- Código incorrecto repetido con la misma intención incrementa una sola vez; cinco intentos saturan sin sexto.
- Reenvío anticipado, invalidación del anterior y conservación del vencimiento absoluto.
- Código vencido, correo ocupado y cambio de documentos legales.
- Un fallo de sesión revierte cuenta, estado, aceptación y marcas de consumo.
- Revocación, cancelación o rectificación a edad no admitida impiden recuperar tokens.
- Ventana sensible de cinco minutos, revalidación después de esperar y depuración del ciphertext.
- Rechazo de respuesta sensible sin vinculación a cuenta y sesión.
- Rollback de intención que nunca confirmó y marca histórica que impide reemitir tokens tras caducar.
- Publicación exclusiva incompatible con la lectura legal transaccional.
- GET de documentos sin modificación de los pendientes.
- Error de envío recuperable, mismo código al reintentar y eliminación del material al enviar/caducar.
- Dos emisores concurrentes solo procesan una entrega; un código consumido no se envía.
- Composición Nest con los servicios existentes y sus proveedores reales.
- Argon2id real con salts distintos, contraseña literal, parámetros PHC y verificación.
- Configuración y claves independientes; errores sin valores de secretos.

## Límites y reproducción

Las pruebas de registro coordinan las clases funcionales existentes y los
repositorios reales, mediante adaptadores de prueba. No certifican controladores
ni rutas HTTP del registro: la prueba HTTP citada es únicamente la inicial que
ya existía. La autenticación general y sus políticas continúan bajo Uzzi.

Los textos son ficticios y el par TLS se genera temporalmente durante la prueba. La prueba SMTP local no valida
la cuenta de un proveedor remoto, su remitente, entregabilidad ni configuración
del despliegue. Tampoco instala un programador de trabajos.

Seguir [la guía de integración](../../docs/architecture/registro-persistencia.md).
Las suites requieren dos URLs de una misma base local desechable y vacían sus
tablas antes de cada caso. La prueba de composición utiliza además configuración
ficticia del registro. Los tests SQL anteriores de Python siguen disponibles;
no se atribuye su ejecución a esta entrega.
