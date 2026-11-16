-- Criterika · migración 0001 · 11a_tablas_aprendizaje.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Estructura ordenada de una unidad.
CREATE TABLE criterika."unidades" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL,
  "descripcion" text NOT NULL,
  "orden" integer NOT NULL,
  "estado" text DEFAULT 'BORRADOR' NOT NULL,
  "estructura_fijada" boolean DEFAULT false NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_unidades" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."unidades" IS 'Estructura ordenada de una unidad.';

COMMENT ON COLUMN criterika."unidades"."id" IS 'Identidad estable.';

COMMENT ON COLUMN criterika."unidades"."nombre" IS 'Nombre editable y auditado.';

COMMENT ON COLUMN criterika."unidades"."descripcion" IS 'Descripción educativa.';

COMMENT ON COLUMN criterika."unidades"."orden" IS 'Posición positiva en el camino único.';

COMMENT ON COLUMN criterika."unidades"."estado" IS 'BORRADOR, PUBLICADO o DESHABILITADO.';

COMMENT ON COLUMN criterika."unidades"."estructura_fijada" IS 'Se vuelve true con el primer intento; no se calcula contando intentos que después pueden borrarse.';

COMMENT ON COLUMN criterika."unidades"."version" IS 'Versión de concurrencia.';

-- Identidad y borrador de metadatos del nivel.
CREATE TABLE criterika."niveles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "unidad_id" uuid NOT NULL,
  "orden" integer NOT NULL,
  "tipo" text NOT NULL,
  "nombre_borrador" text NOT NULL,
  "revision_publicada_id" uuid,
  "estado" text DEFAULT 'BORRADOR' NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_niveles" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."niveles" IS 'Identidad y borrador de metadatos del nivel.';

COMMENT ON COLUMN criterika."niveles"."id" IS 'Identidad estable para aprobación y recompensa única.';

COMMENT ON COLUMN criterika."niveles"."unidad_id" IS 'Unidad de pertenencia.';

COMMENT ON COLUMN criterika."niveles"."orden" IS 'Posición positiva dentro de unidad.';

COMMENT ON COLUMN criterika."niveles"."tipo" IS 'NORMAL o FINAL_UNIDAD; estructura fija desde primer uso.';

COMMENT ON COLUMN criterika."niveles"."nombre_borrador" IS 'Edición todavía no promovida.';

COMMENT ON COLUMN criterika."niveles"."revision_publicada_id" IS 'Revisión que usarán nuevos intentos.';

COMMENT ON COLUMN criterika."niveles"."estado" IS 'BORRADOR, PUBLICADO o DESHABILITADO.';

COMMENT ON COLUMN criterika."niveles"."version" IS 'Concurrencia optimista de borrador y composición.';

-- Identidad de actividad y contenido editable del borrador.
CREATE TABLE criterika."actividades" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nivel_id" uuid NOT NULL,
  "en_borrador" boolean DEFAULT true NOT NULL,
  "posicion_borrador" integer,
  "tipo_borrador" text NOT NULL,
  "instrucciones_borrador" text NOT NULL,
  "contenido_borrador" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criterio_borrador" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generacion_aprobada_id" uuid,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_actividades" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."actividades" IS 'Identidad de actividad y contenido editable del borrador.';

COMMENT ON COLUMN criterika."actividades"."id" IS 'Identidad propia, distinta del tipo de minijuego.';

COMMENT ON COLUMN criterika."actividades"."nivel_id" IS 'Único nivel al que pertenece.';

COMMENT ON COLUMN criterika."actividades"."en_borrador" IS 'false retira del borrador sin destruir referencias históricas.';

COMMENT ON COLUMN criterika."actividades"."posicion_borrador" IS 'Posición positiva si participa; NULL si fue retirada.';

COMMENT ON COLUMN criterika."actividades"."tipo_borrador" IS 'Uno de los cinco minijuegos.';

COMMENT ON COLUMN criterika."actividades"."instrucciones_borrador" IS 'Instrucciones de edición.';

COMMENT ON COLUMN criterika."actividades"."contenido_borrador" IS 'Componente acotado por tipo con preguntas, opciones, parejas o palabras locales.';

COMMENT ON COLUMN criterika."actividades"."criterio_borrador" IS 'Componente acotado y validado para el mismo tipo.';

COMMENT ON COLUMN criterika."actividades"."generacion_aprobada_id" IS 'Distribución actual revisada, solo sopa/crucigrama.';

COMMENT ON COLUMN criterika."actividades"."version" IS 'Versión de edición propia; editar también incrementa versión del nivel.';

-- Candidatos de tablero con revisión administrativa.
CREATE TABLE criterika."generaciones_tablero" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actividad_id" uuid NOT NULL,
  "version_contenido" bigint NOT NULL,
  "tipo" text NOT NULL,
  "distribucion" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "aprobada_en" timestamptz,
  "huella_contenido" bytea NOT NULL,
  CONSTRAINT "pk_generaciones_tablero" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."generaciones_tablero" IS 'Candidatos de tablero con revisión administrativa.';

COMMENT ON COLUMN criterika."generaciones_tablero"."id" IS 'Identidad de candidato, no una nueva actividad.';

COMMENT ON COLUMN criterika."generaciones_tablero"."actividad_id" IS 'Actividad de origen.';

COMMENT ON COLUMN criterika."generaciones_tablero"."version_contenido" IS 'Versión de actividad cuyo contenido se utilizó.';

COMMENT ON COLUMN criterika."generaciones_tablero"."tipo" IS 'SOPA_LETRAS o CRUCIGRAMA.';

COMMENT ON COLUMN criterika."generaciones_tablero"."distribucion" IS 'Dimensiones, letras, pistas y ubicaciones aprobables; sin referencias a otras entidades fuera de la actividad.';

COMMENT ON COLUMN criterika."generaciones_tablero"."generada_en" IS 'Fecha de generación.';

COMMENT ON COLUMN criterika."generaciones_tablero"."aprobada_en" IS 'Fecha de revisión; aprobación debe seguir correspondiendo al contenido actual.';

COMMENT ON COLUMN criterika."generaciones_tablero"."huella_contenido" IS 'Vincula palabras/dimensiones al candidato. version_contenido es evidencia; no invalida por sí sola un candidato al incrementar ETag por aprobarlo.';

-- Publicación inmutable de nombre y condiciones educativas de nivel.
CREATE TABLE criterika."revisiones_nivel" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nivel_id" uuid NOT NULL,
  "numero" integer NOT NULL,
  "nombre_publicado" text NOT NULL,
  "publicada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "transaccion_creacion" xid8 NOT NULL DEFAULT pg_current_xact_id(),
  CONSTRAINT "pk_revisiones_nivel" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."revisiones_nivel" IS 'Publicación inmutable de nombre y condiciones educativas de nivel.';

COMMENT ON COLUMN criterika."revisiones_nivel"."id" IS 'Identidad de revisión.';

COMMENT ON COLUMN criterika."revisiones_nivel"."nivel_id" IS 'Identidad de nivel que no cambia entre revisiones.';

COMMENT ON COLUMN criterika."revisiones_nivel"."numero" IS 'Número de publicación positivo dentro del nivel.';

COMMENT ON COLUMN criterika."revisiones_nivel"."nombre_publicado" IS 'Nombre fijado en esta publicación.';

COMMENT ON COLUMN criterika."revisiones_nivel"."publicada_en" IS 'Instante de publicación.';

-- Componentes de cada revisión con relaciones verificables a actividad y nivel.
CREATE TABLE criterika."actividades_revision" (
  "revision_id" uuid NOT NULL,
  "actividad_id" uuid NOT NULL,
  "nivel_id" uuid NOT NULL,
  "posicion" smallint NOT NULL,
  "tipo" text NOT NULL,
  "instrucciones" text NOT NULL,
  "contenido" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criterio" jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT "pk_actividades_revision" PRIMARY KEY ("revision_id", "actividad_id")
);

COMMENT ON TABLE criterika."actividades_revision" IS 'Componentes de cada revisión con relaciones verificables a actividad y nivel.';

COMMENT ON COLUMN criterika."actividades_revision"."revision_id" IS 'Revisión publicada.';

COMMENT ON COLUMN criterika."actividades_revision"."actividad_id" IS 'Identidad de actividad incluida.';

COMMENT ON COLUMN criterika."actividades_revision"."nivel_id" IS 'Redundancia controlada para exigir por FK que revisión y actividad sean del mismo nivel.';

COMMENT ON COLUMN criterika."actividades_revision"."posicion" IS 'Posición 1–6 en la revisión.';

COMMENT ON COLUMN criterika."actividades_revision"."tipo" IS 'Tipo publicado.';

COMMENT ON COLUMN criterika."actividades_revision"."instrucciones" IS 'Instrucciones publicadas.';

COMMENT ON COLUMN criterika."actividades_revision"."contenido" IS 'Contenido local y distribución aprobada inmutables.';

COMMENT ON COLUMN criterika."actividades_revision"."criterio" IS 'Criterio publicado del mismo tipo.';
