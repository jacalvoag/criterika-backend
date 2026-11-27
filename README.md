# Criterika — Backend

API de Criterika, una aplicación educativa gamificada con niveles, minijuegos, vidas, gemas y cartas con evoluciones. El backend se desarrolla con NestJS 12 y TypeScript.

## Estado del proyecto

- Proyecto base de NestJS creado con ESM, Vitest, Oxlint y Prettier.
- Contrato OpenAPI 3.1, versión funcional **1.0.2**.
- Modelos conceptual y lógico, y migración PostgreSQL modular disponibles.
- Conexión PostgreSQL con configuración validada, pool, comprobación al arrancar y cierre ordenado.
- Transacciones, idempotencia y repositorios SQL del primer flujo jugable, con pruebas de persistencia reales. Ver [la entrega para integración](docs/architecture/flujo-jugable-persistencia.md).
- Registro HTTP integrado: documentos vigentes, inicio, reenvío y confirmación, con repositorios, seguridad y límites de solicitudes (PR #20–#22).
- Herramientas para preparar claves, comprobar el entorno y ejecutar el trabajador de correo y depuración. Ver [operación del registro](docs/development/operacion-registro.md).
- Inicio de sesión, renovación, autorización privada, juego HTTP y procesos de privacidad todavía requieren implementación.

La existencia del contrato y de las tablas no significa que sus endpoints, procesos de privacidad o controles de infraestructura estén implementados.

## Ejecutar en desarrollo

Requisitos: Node.js compatible con NestJS 12 y su CLI, npm y Git. La compatibilidad se detalla en la [documentación de NestJS](https://docs.nestjs.com/first-steps).

```bash
npm ci
npm run registration:setup
npm run db:check
npm run registration:check
npm run start:dev
```

Completar `.env` con el login de aplicación y preparar PostgreSQL según la [guía de conexión](docs/development/postgresql.md) antes de ejecutar `db:check`. Completar también SMTP y los datos reales de privacidad conforme a la guía de operación; ejecutar el trabajador en otra terminal. La API usa `http://localhost:3000` en el entorno local. Los servidores definidos en el contrato son referencias para la implementación; no representan un despliegue real.

## Comprobaciones

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
```

Las pruebas del backend se ejecutan con Vitest. Las pruebas PostgreSQL tienen su propio entorno y dependencias, descritos en [database/README.md](database/README.md).

## Documentación y base de datos

| Ubicación                                                                                    | Contenido                                                                                       |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [docs/README.md](docs/README.md)                                                             | Índice de documentos y orden de lectura.                                                        |
| [docs/openapi/](docs/openapi/)                                                               | Contrato OpenAPI y guía de revisión.                                                            |
| [docs/database/](docs/database/)                                                             | Modelos conceptual y lógico vigentes.                                                           |
| [docs/decisions/](docs/decisions/)                                                           | Decisiones de trabajo y fuentes vigentes.                                                       |
| [docs/architecture/backend.md](docs/architecture/backend.md)                                 | Arquitectura, dependencias, transacciones y acuerdo del primer flujo de registro.               |
| [docs/team/responsabilidades.md](docs/team/responsabilidades.md)                             | Áreas de José, Uzzi y Rafael, propiedad de archivos y protocolo de integración.                 |
| [docs/team/criterika_coordinacion_equipo.json](docs/team/criterika_coordinacion_equipo.json) | Guía compartible del desarrollo, responsabilidades, commits, ramas y coordinación.              |
| [database/README.md](database/README.md)                                                     | Organización y aplicación de los SQL.                                                           |
| [database/migrations/](database/migrations/)                                                 | Cambios versionados de PostgreSQL.                                                              |
| [database/docs/responsabilidades_backend.md](database/docs/responsabilidades_backend.md)     | Responsabilidades de los servicios y del entorno.                                               |
| [database/tests/informe_pruebas.md](database/tests/informe_pruebas.md)                       | Informe previo de 34 pruebas SQL correctas en PostgreSQL 18.6; no son pruebas HTTP del backend. |
| [docs/development/postgresql.md](docs/development/postgresql.md)                             | Configuración local o remota, login técnico y diagnóstico de conexión.                          |
| [docs/development/verificacion_postgresql.md](docs/development/verificacion_postgresql.md)   | Resultados y límites de la comprobación del backend con PostgreSQL.                             |

El esquema SQL se conserva como archivos independientes. Para instalarlo, seguir las instrucciones de `database/README.md`; no ejecutar los archivos por separado ni cargar los fixtures en una base real.

## Forma de trabajo

`develop` es la rama de integración y la predeterminada del repositorio. Los cambios parten de ella en ramas con un propósito concreto y se proponen mediante pull request. `main` se reserva para versiones estables. No se presupone que existan reglas automáticas de protección configuradas.

Usar una rama por funcionalidad o bloque coherente y varios commits pequeños y entendibles dentro de ella. Continuar en esa rama durante sus pruebas y revisiones; crear otra al cambiar de bloque, no por cada commit. Integrar mediante Create a merge commit para conservar la secuencia. Actualizar el contrato cuando cambie HTTP y agregar una migración para una base ya instalada; no modificar migraciones aplicadas.

No versionar credenciales, archivos `.env`, tokens ni datos personales reales. Los ejemplos de configuración deberán usar valores ficticios y los secretos se suministrarán desde el entorno.

## Siguiente entrega funcional

Comprobar registro y entrega de correo en el entorno del equipo; continuar con acceso/sesiones, integración de juego y privacidad según los contratos. Cada bloque debe incluir sus comprobaciones y dejar explícito qué está implementado.
