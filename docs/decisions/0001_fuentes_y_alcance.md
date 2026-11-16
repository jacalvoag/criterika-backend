# 0001 — Fuentes vigentes y alcance

Estado: adoptada para organizar la implementación.

## Criterio de aceptación

Una solución se considera aceptable cuando cumple el comportamiento acordado, sus reglas pueden sostenerse juntas y no deja inconsistencias conocidas sin resolver. No se busca añadir complejidad que no ayude a cumplir el alcance.

## Fuentes

- El contrato OpenAPI expresa las operaciones HTTP y sus mensajes.
- La guía del contrato recoge las reglas y los escenarios de aceptación.
- Los modelos conceptual y lógico explican el negocio y su traducción relacional.
- Las migraciones SQL son la fuente ejecutable de la estructura PostgreSQL.
- El código y las pruebas del backend acreditarán lo efectivamente implementado.

Si se detecta una contradicción entre estos materiales, se resuelve explícitamente y se actualizan los documentos afectados; no se asume que una decisión nueva queda aprobada por aparecer en el código. Los diseños de base de datos descartados no se reutilizan como especificación.

## Organización del repositorio

Se conservan los documentos en Markdown, el contrato en YAML y la base como SQL por módulos y responsabilidades. No se agrega el ZIP de distribución ni un segundo `schema.sql` completo. La migración inicial se aplica como una unidad atómica mediante su ejecutor.

Los cambios en una base ya instalada se entregan mediante otra migración. La incorporación inicial de archivos no ejecuta migraciones en la base del equipo ni configura un despliegue.

## Flujo de trabajo

Las ramas de trabajo parten de `develop` y corresponden a una funcionalidad o bloque coherente. Se permanece en la misma rama durante sus varios commits pequeños, pruebas, documentación y revisiones; no se crea otra rama por cada cambio mínimo. La PR del bloque apunta a `develop` y se integra mediante Create a merge commit para conservar su secuencia lógica. `main` se reserva para versiones estables; las protecciones automáticas se configuran y verifican por separado.

## Límite de esta entrega

Se documenta y versiona la base acordada. La conexión a PostgreSQL, los endpoints, los procesos ARCO, los trabajos de retención y la configuración de cifrado siguen sujetos a implementación y comprobación. Los datos de prueba deben permanecer separados de los entornos reales.
