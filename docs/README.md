# Documentación de Criterika

Esta carpeta reúne las especificaciones vigentes que guían la implementación. El objetivo es una solución consistente y funcional, con complejidad proporcionada al proyecto.

## Orden de lectura

1. [Guía del contrato](openapi/criterika_guia_contrato_v1.md): reglas funcionales, operaciones y escenarios de aceptación.
2. [Contrato OpenAPI](openapi/criterika_openapi_v1.yaml): mensajes y comportamiento HTTP; OpenAPI 3.1.0, versión funcional 1.0.2.
3. [Modelo conceptual](database/criterika_modelo_conceptual_v1.md): conceptos y relaciones del negocio.
4. [Modelo lógico PostgreSQL](database/criterika_modelo_logico_postgresql_v1.md): tablas, atributos, claves y responsabilidades transaccionales.
5. [Base física modular](../database/README.md): instalación, migraciones y pruebas SQL.
6. [Responsabilidades del backend](../database/docs/responsabilidades_backend.md): reglas que el DDL no implementa por sí solo.
7. [Decisiones de trabajo](decisions/0001_fuentes_y_alcance.md): fuentes de referencia y mantenimiento de los documentos.
8. [Conexión a PostgreSQL](development/postgresql.md): preparación del login, variables de entorno y comprobación desde NestJS.
9. [Decisión de conexión](decisions/0002_conexion_postgresql.md): cliente SQL, permisos y TLS.
10. [Comprobación de conexión](development/verificacion_postgresql.md): pruebas y alcance de la integración inicial.
11. [Reparto del equipo](team/responsabilidades.md): responsabilidades, límites y dependencias de José, Uzzi y Rafael.
12. [Asignación de operaciones](team/operaciones.md): responsable funcional de cada operación del contrato.

El YAML se puede importar completo en [Swagger Editor](https://editor.swagger.io/). Su incorporación al repositorio no instala Swagger UI en la aplicación.

Los archivos terminados en `v1` conservan su nombre; la revisión puntual del contrato se consulta en `info.version`. Los modelos documentan su nivel de diseño y los SQL implementan la estructura física. Los modelos antiguos descartados no forman parte de esta base.

## Arquitectura e integración

- [Arquitectura del backend](architecture/backend.md): módulos, dependencias y coordinación transaccional.
- [Primer flujo de registro](architecture/registro.md): secuencia, firmas, persistencia y criterios de aceptación.
- [Firmas TypeScript de registro](architecture/registration-contracts.ts): acuerdos compilables, sin implementación de endpoints.

## Guía compartible del equipo

[criterika_coordinacion_equipo.json](team/criterika_coordinacion_equipo.json) reúne el contexto vigente al preparar la guía, las responsabilidades, los límites de archivos, la matriz de operaciones y los acuerdos de commits pequeños dentro de una rama por bloque coherente.
