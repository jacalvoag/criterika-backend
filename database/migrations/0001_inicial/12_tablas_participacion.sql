-- Criterika · migración 0001 · 12_tablas_participacion.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Participación completa y snapshot de derechos/recompensa.
CREATE TABLE criterika."intentos_nivel" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid NOT NULL,
  "nivel_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "estado" text DEFAULT 'EN_CURSO' NOT NULL,
  "motivo_finalizacion" text,
  "iniciado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "ultima_comunicacion_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "finalizado_en" timestamptz,
  "zona_horaria" text NOT NULL,
  "gemas_previstas" integer NOT NULL,
  "xp_prevista" integer NOT NULL,
  "carta_prevista_id" uuid,
  "siguiente_orden_pendiente" bigint DEFAULT 7 NOT NULL,
  CONSTRAINT "pk_intentos_nivel" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."intentos_nivel" IS 'Participación completa y snapshot de derechos/recompensa.';

COMMENT ON COLUMN criterika."intentos_nivel"."id" IS 'Identidad de intento del API.';

COMMENT ON COLUMN criterika."intentos_nivel"."jugador_id" IS 'Estado de jugador propietario.';

COMMENT ON COLUMN criterika."intentos_nivel"."nivel_id" IS 'Nivel estable.';

COMMENT ON COLUMN criterika."intentos_nivel"."revision_id" IS 'Revisión inmutable del mismo nivel.';

COMMENT ON COLUMN criterika."intentos_nivel"."estado" IS 'EN_CURSO, APROBADO, FALLIDO, ABANDONADO o CANCELADO.';

COMMENT ON COLUMN criterika."intentos_nivel"."motivo_finalizacion" IS 'Motivo tipificado según resultado.';

COMMENT ON COLUMN criterika."intentos_nivel"."iniciado_en" IS 'Fecha del servidor.';

COMMENT ON COLUMN criterika."intentos_nivel"."ultima_comunicacion_en" IS 'Última señal aceptada; no un historial de todos los heartbeats.';

COMMENT ON COLUMN criterika."intentos_nivel"."finalizado_en" IS 'Solo en resultado terminal.';

COMMENT ON COLUMN criterika."intentos_nivel"."zona_horaria" IS 'IANA comunicada al iniciar.';

COMMENT ON COLUMN criterika."intentos_nivel"."gemas_previstas" IS '150 o 300 según tipo al inicio; concesión real depende de primera aprobación única.';

COMMENT ON COLUMN criterika."intentos_nivel"."xp_prevista" IS '100 o 250 según tipo al inicio.';

COMMENT ON COLUMN criterika."intentos_nivel"."carta_prevista_id" IS 'Derecho de carta fijado al comenzar.';

COMMENT ON COLUMN criterika."intentos_nivel"."siguiente_orden_pendiente" IS 'Contador de colocación al final de pendientes; no cantidad de actividades.';

-- Subconjunto de términos que el intento tenía derecho a desbloquear al comenzar.
CREATE TABLE criterika."terminos_intento" (
  "intento_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "termino_id" uuid NOT NULL,
  CONSTRAINT "pk_terminos_intento" PRIMARY KEY ("intento_id", "termino_id")
);

COMMENT ON TABLE criterika."terminos_intento" IS 'Subconjunto de términos que el intento tenía derecho a desbloquear al comenzar.';

COMMENT ON COLUMN criterika."terminos_intento"."intento_id" IS 'Intento propietario.';

COMMENT ON COLUMN criterika."terminos_intento"."revision_id" IS 'Redundancia para verificar pertenencia al snapshot del intento.';

COMMENT ON COLUMN criterika."terminos_intento"."termino_id" IS 'Término permitido al inicio, aunque luego se deshabilite.';

-- Estado de cada actividad dentro de un intento.
CREATE TABLE criterika."actividades_intento" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "intento_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "actividad_id" uuid NOT NULL,
  "posicion_inicial" smallint NOT NULL,
  "estado" text NOT NULL,
  "orden_pendiente" bigint,
  CONSTRAINT "pk_actividades_intento" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."actividades_intento" IS 'Estado de cada actividad dentro de un intento.';

COMMENT ON COLUMN criterika."actividades_intento"."id" IS 'Identidad de participación de actividad.';

COMMENT ON COLUMN criterika."actividades_intento"."intento_id" IS 'Intento propietario.';

COMMENT ON COLUMN criterika."actividades_intento"."revision_id" IS 'Revisión del mismo intento.';

COMMENT ON COLUMN criterika."actividades_intento"."actividad_id" IS 'Actividad incluida en esa revisión.';

COMMENT ON COLUMN criterika."actividades_intento"."posicion_inicial" IS 'Posición fijada al iniciar.';

COMMENT ON COLUMN criterika."actividades_intento"."estado" IS 'PENDIENTE, EN_EJECUCION, PENDIENTE_RECUPERACION, SUPERADA o AGOTADA.';

COMMENT ON COLUMN criterika."actividades_intento"."orden_pendiente" IS 'Posición única mientras pendiente/actual; NULL cuando ya no está en cola.';

-- Una oportunidad concreta de resolver la actividad.
CREATE TABLE criterika."ejecuciones_actividad" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actividad_intento_id" uuid NOT NULL,
  "intento_id" uuid NOT NULL,
  "numero" smallint NOT NULL,
  "estado" text NOT NULL,
  "errores" integer DEFAULT 0 NOT NULL,
  "estado_juego" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "iniciada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "finalizada_en" timestamptz,
  CONSTRAINT "pk_ejecuciones_actividad" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."ejecuciones_actividad" IS 'Una oportunidad concreta de resolver la actividad.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."id" IS 'Identidad de ejecución del API.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."actividad_intento_id" IS 'Actividad del intento.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."intento_id" IS 'Redundancia para verificar pertenencia y asegurar una ejecución activa por intento.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."numero" IS '1, 2 o 3.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."estado" IS 'EN_CURSO, SUPERADA o FALLIDA.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."errores" IS 'Contador de errores/comprobaciones del tipo, no cantidad de ejecuciones.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."estado_juego" IS 'Componente local: pares encontrados, pregunta actual, respuestas comprobadas o asociaciones; validado por tipo.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."iniciada_en" IS 'Hora del servidor.';

COMMENT ON COLUMN criterika."ejecuciones_actividad"."finalizada_en" IS 'Hora del resultado.';

-- Acciones confirmadas y evaluación propia del servidor.
CREATE TABLE criterika."interacciones_evaluadas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ejecucion_id" uuid NOT NULL,
  "clave_intencion" uuid NOT NULL,
  "huella_solicitud" bytea NOT NULL,
  "respuesta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evaluacion" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "registrada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_interacciones_evaluadas" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."interacciones_evaluadas" IS 'Acciones confirmadas y evaluación propia del servidor.';

COMMENT ON COLUMN criterika."interacciones_evaluadas"."id" IS 'Identidad interna de interacción.';

COMMENT ON COLUMN criterika."interacciones_evaluadas"."ejecucion_id" IS 'Ejecución propietaria.';

COMMENT ON COLUMN criterika."interacciones_evaluadas"."clave_intencion" IS 'Clave de reintento de la acción, no una puntuación del cliente.';

COMMENT ON COLUMN criterika."interacciones_evaluadas"."huella_solicitud" IS 'Huella protegida para rechazar reutilización con otro cuerpo.';

COMMENT ON COLUMN criterika."interacciones_evaluadas"."respuesta" IS 'Unión GameAnswer validada contra tipo y IDs locales de esa ejecución.';

COMMENT ON COLUMN criterika."interacciones_evaluadas"."evaluacion" IS 'Feedback ya revelado legítimamente; no soluciones de preguntas futuras.';

COMMENT ON COLUMN criterika."interacciones_evaluadas"."registrada_en" IS 'Hora del servidor.';

-- Primera aprobación y concesión inicial única por jugador/nivel.
CREATE TABLE criterika."aprobaciones_nivel" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid NOT NULL,
  "nivel_id" uuid NOT NULL,
  "intento_origen_id" uuid NOT NULL,
  "aprobada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "gemas_otorgadas" integer NOT NULL,
  "xp_otorgada" integer NOT NULL,
  CONSTRAINT "pk_aprobaciones_nivel" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."aprobaciones_nivel" IS 'Primera aprobación y concesión inicial única por jugador/nivel.';

COMMENT ON COLUMN criterika."aprobaciones_nivel"."id" IS 'Identidad de concesión estable.';

COMMENT ON COLUMN criterika."aprobaciones_nivel"."jugador_id" IS 'Jugador propietario.';

COMMENT ON COLUMN criterika."aprobaciones_nivel"."nivel_id" IS 'Nivel estable, no revisión.';

COMMENT ON COLUMN criterika."aprobaciones_nivel"."intento_origen_id" IS 'Intento propio del mismo nivel que acredita APROBADO.';

COMMENT ON COLUMN criterika."aprobaciones_nivel"."aprobada_en" IS 'Instante de primera aprobación.';

COMMENT ON COLUMN criterika."aprobaciones_nivel"."gemas_otorgadas" IS 'Importe inicial 150/300.';

COMMENT ON COLUMN criterika."aprobaciones_nivel"."xp_otorgada" IS 'Importe inicial 100/250.';
