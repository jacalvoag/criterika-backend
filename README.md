# Criterika — Backend

API de Criterika, una aplicación educativa gamificada con niveles, minijuegos, vidas, gemas y cartas con evoluciones. El backend se desarrolla con NestJS 12 y TypeScript.

## Estado del proyecto

- Proyecto base de NestJS creado con ESM, Vitest, Oxlint y Prettier.
- Contrato OpenAPI 3.1, versión funcional **1.0.2**.
- Modelos conceptual y lógico, y migración PostgreSQL modular disponibles.
- La conexión PostgreSQL y los módulos funcionales todavía no están implementados en el backend.

La existencia del contrato y de las tablas no significa que sus endpoints, procesos de privacidad o controles de infraestructura estén implementados.

## Ejecutar en desarrollo

Requisitos: Node.js compatible con NestJS 12 y su CLI, npm y Git. La compatibilidad se detalla en la [documentación de NestJS](https://docs.nestjs.com/first-steps).

```bash
npm ci
npm run start:dev
```

La aplicación inicial responde en `http://localhost:3000`. Los servidores definidos en el contrato son referencias para la implementación; no representan un despliegue real.

## Comprobaciones

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
```

Las pruebas del backend se ejecutan con Vitest. Las pruebas PostgreSQL tienen su propio entorno y dependencias, descritos en [database/README.md](database/README.md).

## Documentación y base de datos

| Ubicación | Contenido |
| --- | --- |
| [docs/README.md](docs/README.md) | Índice de documentos y orden de lectura. |
| [docs/openapi/](docs/openapi/) | Contrato OpenAPI y guía de revisión. |
| [docs/database/](docs/database/) | Modelos conceptual y lógico vigentes. |
| [docs/decisions/](docs/decisions/) | Decisiones de trabajo y fuentes vigentes. |
| [database/README.md](database/README.md) | Organización y aplicación de los SQL. |
| [database/migrations/](database/migrations/) | Cambios versionados de PostgreSQL. |
| [database/docs/responsabilidades_backend.md](database/docs/responsabilidades_backend.md) | Responsabilidades de los servicios y del entorno. |
| [database/tests/informe_pruebas.md](database/tests/informe_pruebas.md) | Informe previo de 34 pruebas SQL correctas en PostgreSQL 18.6; no son pruebas HTTP del backend. |

El esquema SQL se conserva como archivos independientes. Para instalarlo, seguir las instrucciones de `database/README.md`; no ejecutar los archivos por separado ni cargar los fixtures en una base real.

## Forma de trabajo

`develop` es la rama de integración y la predeterminada del repositorio. Los cambios parten de ella en ramas con un propósito concreto y se proponen mediante pull request. `main` se reserva para versiones estables. No se presupone que existan reglas automáticas de protección configuradas.

Usar commits pequeños y coherentes. Actualizar el contrato cuando cambie el comportamiento HTTP y agregar una migración para los cambios de una base ya instalada. No modificar migraciones aplicadas.

No versionar credenciales, archivos `.env`, tokens ni datos personales reales. Los ejemplos de configuración deberán usar valores ficticios y los secretos se suministrarán desde el entorno.

## Siguiente entrega funcional

Configurar la conexión a PostgreSQL y completar registro, verificación de correo, aceptaciones legales y autenticación de acuerdo con el contrato. Cada bloque debe incluir sus comprobaciones y dejar explícito qué está implementado.
