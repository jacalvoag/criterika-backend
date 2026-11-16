# Comprobación de la conexión PostgreSQL

## Resultado

- Compilación, chequeo de tipos y lint: correctos.
- Vitest: 30 pruebas unitarias y 1 prueba HTTP e2e, correctas.
- Comprobación adicional contra una instancia temporal de PostgreSQL 18.6: 9 casos correctos.
- Runtime utilizado: Node.js v24.22.1.

## Instancia real de prueba

Se creó un clúster PostgreSQL efímero local, se aplicó la migración inicial sin modificaciones y se provisionó un login temporal con el grupo criterika_app. Después se activó autenticación SCRAM-SHA-256 en las conexiones TCP locales. Los datos de conexión y contraseñas fueron ficticios.

Se ejecutaron el comprobador compilado y el servidor HTTP compilado. La instancia y los procesos se detuvieron al finalizar. No se accedió a una base del equipo ni a un servidor remoto.

| Caso | Resultado |
| --- | --- |
| Arranque real con rol de aplicación y cierre del pool | Correcto |
| Rechaza una contraseña incorrecta con autenticación SCRAM | Correcto |
| Rechaza login superusuario | Correcto |
| Rechaza base sin migración | Correcto |
| Rechaza TLS requerido ante servidor local sin TLS | Correcto |
| Rechaza texto plano en producción | Correcto |
| Rechaza configuración incompleta | Correcto |
| Carga .env y respeta la prioridad del entorno externo | Correcto |
| HTTP real con PostgreSQL y apagado por señal | Correcto |

La salida de los procesos se comprobó para evitar la aparición de la contraseña usada en la prueba. La respuesta HTTP inicial se conservó como Hello World!.

## Alcance TLS

Las pruebas verifican la configuración que exige certificados válidos y el rechazo de una conexión que solicita TLS frente a un servidor local sin TLS. No se comprobó aún una conexión TLS positiva contra un servidor con certificado real. Esa verificación corresponde al entorno que se configure.

## Reproducción

Las pruebas unitarias y HTTP iniciales se ejecutan con npm run test y npm run test:e2e. No necesitan PostgreSQL ni leen el archivo .env. Para comprobar el servidor elegido, seguir la guía de conexión y ejecutar npm run db:check con su entorno. Los nueve escenarios de la instancia efímera fueron una comprobación de esta entrega; no se agrega su aprovisionador temporal al proyecto.
