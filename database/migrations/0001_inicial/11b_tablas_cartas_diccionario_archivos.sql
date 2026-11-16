-- Criterika · migración 0001 · 11b_tablas_cartas_diccionario_archivos.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Metadatos de archivos; el binario se conserva en almacenamiento de objetos privado.
CREATE TABLE criterika."archivos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "clave_objeto" text NOT NULL,
  "uso" text NOT NULL,
  "propietario_cuenta_id" uuid,
  "tipo_contenido" text NOT NULL,
  "bytes" bigint NOT NULL,
  "ancho" integer,
  "alto" integer,
  "sha256" bytea NOT NULL,
  "estado" text NOT NULL,
  "creado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "eliminar_despues_de" timestamptz,
  CONSTRAINT "pk_archivos" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."archivos" IS 'Metadatos de archivos; el binario se conserva en almacenamiento de objetos privado.';

COMMENT ON COLUMN criterika."archivos"."id" IS 'Identidad de medio del API.';

COMMENT ON COLUMN criterika."archivos"."clave_objeto" IS 'Clave opaca privada, sin correo/nombre/documento personal en la ruta.';

COMMENT ON COLUMN criterika."archivos"."uso" IS 'AVATAR, CARTA_BASE, EVOLUCION, ILUSTRACION_UNIDAD o EVIDENCIA_PRIVACIDAD.';

COMMENT ON COLUMN criterika."archivos"."propietario_cuenta_id" IS 'Jugador propietario cuando existe; contenido común no se atribuye como posesión al administrador que lo cargó.';

COMMENT ON COLUMN criterika."archivos"."tipo_contenido" IS 'Tipo real validado.';

COMMENT ON COLUMN criterika."archivos"."bytes" IS 'Tamaño validado; imágenes hasta 5 MiB y evidencia hasta 10 MiB.';

COMMENT ON COLUMN criterika."archivos"."ancho" IS 'Dimensión de imagen, máximo 4096.';

COMMENT ON COLUMN criterika."archivos"."alto" IS 'Dimensión de imagen, máximo 4096.';

COMMENT ON COLUMN criterika."archivos"."sha256" IS 'Detección de corrupción/duplicados exactos; no es identificador público de acceso.';

COMMENT ON COLUMN criterika."archivos"."estado" IS 'REGISTRADO, ACTIVO, PENDIENTE_BORRADO o BORRADO.';

COMMENT ON COLUMN criterika."archivos"."creado_en" IS 'Hora del servidor.';

COMMENT ON COLUMN criterika."archivos"."eliminar_despues_de" IS 'Limpieza de huérfanos o supresión aprobada.';

-- Identidad del término y versiones actual/borrador de su presentación.
CREATE TABLE criterika."terminos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nombre_borrador" text NOT NULL,
  "categoria_borrador" text NOT NULL,
  "definicion_borrador" text NOT NULL,
  "ejemplo_borrador" text NOT NULL,
  "fuente_borrador" text,
  "nombre_publicado" text,
  "categoria_publicada" text,
  "definicion_publicada" text,
  "ejemplo_publicado" text,
  "fuente_publicada" text,
  "estado" text DEFAULT 'BORRADOR' NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_terminos" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."terminos" IS 'Identidad del término y versiones actual/borrador de su presentación.';

COMMENT ON COLUMN criterika."terminos"."id" IS 'Identidad estable del término.';

COMMENT ON COLUMN criterika."terminos"."nombre_borrador" IS 'Nombre editable.';

COMMENT ON COLUMN criterika."terminos"."categoria_borrador" IS 'Categoría editable.';

COMMENT ON COLUMN criterika."terminos"."definicion_borrador" IS 'Definición editable.';

COMMENT ON COLUMN criterika."terminos"."ejemplo_borrador" IS 'Ejemplo editable.';

COMMENT ON COLUMN criterika."terminos"."fuente_borrador" IS 'Referencia educativa.';

COMMENT ON COLUMN criterika."terminos"."nombre_publicado" IS 'Último nombre publicado.';

COMMENT ON COLUMN criterika."terminos"."categoria_publicada" IS 'Última categoría publicada.';

COMMENT ON COLUMN criterika."terminos"."definicion_publicada" IS 'Última definición publicada.';

COMMENT ON COLUMN criterika."terminos"."ejemplo_publicado" IS 'Último ejemplo publicado.';

COMMENT ON COLUMN criterika."terminos"."fuente_publicada" IS 'Última referencia publicada.';

COMMENT ON COLUMN criterika."terminos"."estado" IS 'BORRADOR, PUBLICADO o DESHABILITADO.';

COMMENT ON COLUMN criterika."terminos"."version" IS 'Concurrencia optimista.';

-- Asociaciones de términos editadas antes de publicar nivel.
CREATE TABLE criterika."nivel_terminos_borrador" (
  "nivel_id" uuid NOT NULL,
  "termino_id" uuid NOT NULL,
  CONSTRAINT "pk_nivel_terminos_borrador" PRIMARY KEY ("nivel_id", "termino_id")
);

COMMENT ON TABLE criterika."nivel_terminos_borrador" IS 'Asociaciones de términos editadas antes de publicar nivel.';

COMMENT ON COLUMN criterika."nivel_terminos_borrador"."nivel_id" IS 'Nivel editado.';

COMMENT ON COLUMN criterika."nivel_terminos_borrador"."termino_id" IS 'Término asociado.';

-- Asociaciones de términos fijadas al publicar nivel.
CREATE TABLE criterika."revision_terminos" (
  "revision_id" uuid NOT NULL,
  "termino_id" uuid NOT NULL,
  CONSTRAINT "pk_revision_terminos" PRIMARY KEY ("revision_id", "termino_id")
);

COMMENT ON TABLE criterika."revision_terminos" IS 'Asociaciones de términos fijadas al publicar nivel.';

COMMENT ON COLUMN criterika."revision_terminos"."revision_id" IS 'Revisión publicada.';

COMMENT ON COLUMN criterika."revision_terminos"."termino_id" IS 'Término asociado en esa revisión.';

-- Carta única de unidad con base editable y publicada.
CREATE TABLE criterika."cartas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "unidad_id" uuid NOT NULL,
  "nombre_borrador" text NOT NULL,
  "descripcion_borrador" text NOT NULL,
  "imagen_base_borrador_id" uuid,
  "nombre_publicado" text,
  "descripcion_publicada" text,
  "imagen_base_publicada_id" uuid,
  "estado" text DEFAULT 'BORRADOR' NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_cartas" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."cartas" IS 'Carta única de unidad con base editable y publicada.';

COMMENT ON COLUMN criterika."cartas"."id" IS 'Identidad estable de carta.';

COMMENT ON COLUMN criterika."cartas"."unidad_id" IS 'Una carta por unidad; no cambiarla una vez fijada estructura.';

COMMENT ON COLUMN criterika."cartas"."nombre_borrador" IS 'Nombre editable.';

COMMENT ON COLUMN criterika."cartas"."descripcion_borrador" IS 'Descripción editable.';

COMMENT ON COLUMN criterika."cartas"."imagen_base_borrador_id" IS 'Imagen pendiente de publicación.';

COMMENT ON COLUMN criterika."cartas"."nombre_publicado" IS 'Último nombre publicado.';

COMMENT ON COLUMN criterika."cartas"."descripcion_publicada" IS 'Última descripción publicada.';

COMMENT ON COLUMN criterika."cartas"."imagen_base_publicada_id" IS 'Última imagen publicada.';

COMMENT ON COLUMN criterika."cartas"."estado" IS 'BORRADOR, PUBLICADO o DESHABILITADO.';

COMMENT ON COLUMN criterika."cartas"."version" IS 'Concurrencia del conjunto carta/etapas.';

-- Tres posiciones de evolución de la carta.
CREATE TABLE criterika."etapas_carta" (
  "carta_id" uuid NOT NULL,
  "numero" smallint NOT NULL,
  "imagen_borrador_id" uuid,
  "imagen_publicada_id" uuid,
  "habilitada" boolean DEFAULT true NOT NULL,
  CONSTRAINT "pk_etapas_carta" PRIMARY KEY ("carta_id", "numero")
);

COMMENT ON TABLE criterika."etapas_carta" IS 'Tres posiciones de evolución de la carta.';

COMMENT ON COLUMN criterika."etapas_carta"."carta_id" IS 'Carta a la que pertenece la etapa.';

COMMENT ON COLUMN criterika."etapas_carta"."numero" IS '1, 2 o 3.';

COMMENT ON COLUMN criterika."etapas_carta"."imagen_borrador_id" IS 'Imagen editable.';

COMMENT ON COLUMN criterika."etapas_carta"."imagen_publicada_id" IS 'Imagen actual publicada.';

COMMENT ON COLUMN criterika."etapas_carta"."habilitada" IS 'Afecta nuevas compras, no adquisiciones previas.';
