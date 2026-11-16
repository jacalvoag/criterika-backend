-- Criterika · migración 0001 · 14a_tablas_aceptaciones.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Texto legal versionado e inmutable al publicar.
CREATE TABLE criterika."versiones_documentos_legales" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "etiqueta_version" text NOT NULL,
  "contenido_markdown" text NOT NULL,
  "sha256" bytea,
  "tipo_cambio" text NOT NULL,
  "requiere_aceptacion" boolean NOT NULL,
  "es_vigente" boolean DEFAULT false NOT NULL,
  "publicada_en" timestamptz,
  "version_recurso" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_versiones_documentos_legales" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."versiones_documentos_legales" IS 'Texto legal versionado e inmutable al publicar.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."id" IS 'Identidad de versión del API.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."tipo" IS 'TERMINOS o AVISO_PRIVACIDAD.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."etiqueta_version" IS 'Etiqueta humana única por tipo.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."contenido_markdown" IS 'Texto exacto presentado; no usar JSONB para conservar sus bytes de representación.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."sha256" IS 'Huella del texto UTF-8 publicada; no se presenta como firma electrónica.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."tipo_cambio" IS 'EDITORIAL, CONTRACTUAL o NUEVA_FINALIDAD.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."requiere_aceptacion" IS 'Política de aceptación aplicable al publicar.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."es_vigente" IS 'Una vigente por tipo.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."publicada_en" IS 'NULL mientras borrador.';

COMMENT ON COLUMN criterika."versiones_documentos_legales"."version_recurso" IS 'ETag del borrador, independiente de etiqueta legal.';

-- Identidad estable de una finalidad, usada también para oposición/revocación.
CREATE TABLE criterika."finalidades" (
  "codigo" text NOT NULL,
  "descripcion_base" text NOT NULL,
  "necesaria" boolean DEFAULT true NOT NULL,
  CONSTRAINT "pk_finalidades" PRIMARY KEY ("codigo")
);

COMMENT ON TABLE criterika."finalidades" IS 'Identidad estable de una finalidad, usada también para oposición/revocación.';

COMMENT ON COLUMN criterika."finalidades"."codigo" IS 'Código estable, por ejemplo cuenta o aprendizaje; no se recicla para otra finalidad.';

COMMENT ON COLUMN criterika."finalidades"."descripcion_base" IS 'Significado de la finalidad; un cambio sustancial requiere otra finalidad y consentimiento.';

COMMENT ON COLUMN criterika."finalidades"."necesaria" IS 'true en la primera versión, sin publicidad ni finalidades secundarias.';

-- Finalidades y descripción concreta de una versión del aviso.
CREATE TABLE criterika."documento_finalidades" (
  "documento_version_id" uuid NOT NULL,
  "finalidad_codigo" text NOT NULL,
  "descripcion_presentada" text NOT NULL,
  CONSTRAINT "pk_documento_finalidades" PRIMARY KEY ("documento_version_id", "finalidad_codigo")
);

COMMENT ON TABLE criterika."documento_finalidades" IS 'Finalidades y descripción concreta de una versión del aviso.';

COMMENT ON COLUMN criterika."documento_finalidades"."documento_version_id" IS 'Versión de aviso, no términos educativos.';

COMMENT ON COLUMN criterika."documento_finalidades"."finalidad_codigo" IS 'Finalidad estable.';

COMMENT ON COLUMN criterika."documento_finalidades"."descripcion_presentada" IS 'Texto de esa versión, preservado con la publicación.';

-- Evidencia específica de documentos y manifestación del titular.
CREATE TABLE criterika."aceptaciones_legales" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cuenta_id" uuid NOT NULL,
  "terminos_version_id" uuid NOT NULL,
  "aviso_version_id" uuid NOT NULL,
  "acepta_terminos" boolean NOT NULL,
  "reconoce_aviso_presentado" boolean NOT NULL,
  "aceptada_en" timestamptz NOT NULL,
  "ip" inet NOT NULL,
  CONSTRAINT "pk_aceptaciones_legales" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."aceptaciones_legales" IS 'Evidencia específica de documentos y manifestación del titular.';

COMMENT ON COLUMN criterika."aceptaciones_legales"."id" IS 'Identidad de aceptación.';

COMMENT ON COLUMN criterika."aceptaciones_legales"."cuenta_id" IS 'Cuenta que realizó la acción; al completar registro se vincula la evidencia original.';

COMMENT ON COLUMN criterika."aceptaciones_legales"."terminos_version_id" IS 'Versión real de términos presentada.';

COMMENT ON COLUMN criterika."aceptaciones_legales"."aviso_version_id" IS 'Versión real de aviso presentada.';

COMMENT ON COLUMN criterika."aceptaciones_legales"."acepta_terminos" IS 'true, acción explícita.';

COMMENT ON COLUMN criterika."aceptaciones_legales"."reconoce_aviso_presentado" IS 'true, no equivale a afirmar lectura íntegra o autorización genérica.';

COMMENT ON COLUMN criterika."aceptaciones_legales"."aceptada_en" IS 'Fecha/hora original generada por servidor.';

COMMENT ON COLUMN criterika."aceptaciones_legales"."ip" IS 'IPv4/IPv6 obtenida de conexión o proxy confiable, dato personal restringido.';

-- Finalidades expresamente consentidas dentro de una aceptación.
CREATE TABLE criterika."aceptacion_finalidades" (
  "aceptacion_id" uuid NOT NULL,
  "aviso_version_id" uuid NOT NULL,
  "finalidad_codigo" text NOT NULL,
  CONSTRAINT "pk_aceptacion_finalidades" PRIMARY KEY ("aceptacion_id", "finalidad_codigo")
);

COMMENT ON TABLE criterika."aceptacion_finalidades" IS 'Finalidades expresamente consentidas dentro de una aceptación.';

COMMENT ON COLUMN criterika."aceptacion_finalidades"."aceptacion_id" IS 'Evidencia de aceptación.';

COMMENT ON COLUMN criterika."aceptacion_finalidades"."aviso_version_id" IS 'Misma versión de aviso de la aceptación.';

COMMENT ON COLUMN criterika."aceptacion_finalidades"."finalidad_codigo" IS 'Finalidad declarada en esa versión.';
