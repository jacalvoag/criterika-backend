# 0002 — Conexión PostgreSQL del backend

Estado: implementada para la conexión inicial.

## Decisión

Usar `pg` como cliente PostgreSQL y `@nestjs/config` para cargar y validar el entorno. Un módulo Nest administra un pool por aplicación, comprueba la conexión antes de aceptar HTTP y libera las conexiones al cerrar.

Se revisaron las integraciones de Nest para TypeORM y Drizzle. En esta etapa ya existe una estructura SQL versionada con restricciones, funciones y triggers. El driver directo permite ejecutar ese SQL y coordinar transacciones en una misma conexión con una dependencia menor. No se agrega sincronización automática de tablas ni otro generador de migraciones.

## Controles

- El login del backend hereda `criterika_app` y carece de permisos de owner, mantenimiento y administración.
- La migración se ejecuta por separado con la credencial del operador.
- TLS verifica el certificado por defecto. La excepción explícita de texto plano queda limitada a loopback en desarrollo o pruebas.
- La configuración y los errores de conexión evitan imprimir secretos.
- Los futuros servicios mantienen contexto de auditoría, modificaciones y confirmación en la misma conexión transaccional.

## Consecuencias

Los repositorios de cada módulo escribirán consultas parametrizadas. La base conserva sus controles de integridad, pero los permisos del login compartido no reemplazan la autorización por usuario en los servicios. La preparación del servidor, su CA y sus credenciales reales se realiza en el entorno correspondiente.

## Referencias

- [Configuración de NestJS](https://docs.nestjs.com/application/configuration).
- [TypeORM en NestJS](https://docs.nestjs.com/data/typeorm).
- [Drizzle en NestJS](https://docs.nestjs.com/data/drizzle).
- [Pool de node-postgres](https://node-postgres.com/features/pooling).
- [TLS de node-postgres](https://node-postgres.com/features/ssl).
