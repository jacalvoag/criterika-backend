# Prueba HTTP del registro con PostgreSQL

La prueba `registration-postgres.e2e-spec.ts` comprueba las cuatro rutas
contra los repositorios reales. Para capturar el código, sustituye solamente el
transporte de correo por un proveedor de prueba. Utiliza el limitador de la
aplicación y comprueba un despliegue de una sola instancia. La prueba no
verifica un proveedor SMTP remoto.

Preparar una base PostgreSQL **nueva y desechable** llamada
`criterika_prueba_*`, aplicar la migración y crear un login de aplicación
con membresía `criterika_app` según
[la guía de persistencia](../docs/architecture/registro-persistencia.md).
Después cargar una vez `database/fixtures/02_registro.sql` con el operador.
No usar RDS ni datos que se deban conservar.

Configurar los datos de conexión y las claves y proveedores ficticios indicados
en la guía. `DB_HOST` debe ser local, `DB_NAME` debe empezar por
`criterika_prueba_` y `NODE_ENV` debe ser `test`. Activar la prueba con
`REGISTRATION_HTTP_TEST=1` y ejecutar:

```bash
npx vitest run --config vitest.config.e2e.ts test/registration-postgres.e2e-spec.ts
```

La prueba crea un registro y una sesión ficticios, por lo que cada ejecución
requiere una base recién preparada o reiniciada mediante el procedimiento de
pruebas del equipo. Sin `REGISTRATION_HTTP_TEST=1` se omite en la suite HTTP
ordinaria. La suite de persistencia existente tiene sus propios requisitos y
vacía las tablas de su base desechable antes de cada caso.
