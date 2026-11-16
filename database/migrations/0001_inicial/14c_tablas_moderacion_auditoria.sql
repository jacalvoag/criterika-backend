-- Criterika · migración 0001 · 14c_tablas_moderacion_auditoria.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Historial y vigencia de moderación de jugadores.
CREATE TABLE criterika."sanciones" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "motivo" text NOT NULL,
  "administrador_id" uuid NOT NULL,
  "inicio" timestamptz NOT NULL,
  "vence_en" timestamptz,
  "levantada_en" timestamptz,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_sanciones" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."sanciones" IS 'Historial y vigencia de moderación de jugadores.';

COMMENT ON COLUMN criterika."sanciones"."id" IS 'Identidad de sanción.';

COMMENT ON COLUMN criterika."sanciones"."jugador_id" IS 'Jugador afectado.';

COMMENT ON COLUMN criterika."sanciones"."tipo" IS 'TEMPORAL o BLOQUEO.';

COMMENT ON COLUMN criterika."sanciones"."motivo" IS 'Razón necesaria, sin datos personales ajenos.';

COMMENT ON COLUMN criterika."sanciones"."administrador_id" IS 'Cuenta ADMINISTRADOR aplicante, confirmada desde sesión.';

COMMENT ON COLUMN criterika."sanciones"."inicio" IS 'Hora UTC del servidor.';

COMMENT ON COLUMN criterika."sanciones"."vence_en" IS 'Temporal 1/3/7 días; NULL para bloqueo.';

COMMENT ON COLUMN criterika."sanciones"."levantada_en" IS 'Fecha de revisión/levantamiento.';

COMMENT ON COLUMN criterika."sanciones"."version" IS 'Concurrencia al revisar.';

-- Inconsistencias detectadas que requieren revisión humana.
CREATE TABLE criterika."casos_revision" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid,
  "tipo" text NOT NULL,
  "estado" text NOT NULL,
  "descripcion" text NOT NULL,
  "detectado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "resultado" text,
  "motivo_resolucion" text,
  "resuelto_en" timestamptz,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_casos_revision" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."casos_revision" IS 'Inconsistencias detectadas que requieren revisión humana.';

COMMENT ON COLUMN criterika."casos_revision"."id" IS 'Identidad de caso.';

COMMENT ON COLUMN criterika."casos_revision"."jugador_id" IS 'Titular relacionado cuando exista.';

COMMENT ON COLUMN criterika."casos_revision"."tipo" IS 'RECOMPENSA_DUPLICADA, SALDO_INCONSISTENTE, PROGRESO_INCONSISTENTE u OTRO.';

COMMENT ON COLUMN criterika."casos_revision"."estado" IS 'PENDIENTE o RESUELTO.';

COMMENT ON COLUMN criterika."casos_revision"."descripcion" IS 'Evidencia mínima necesaria; no copia de perfiles.';

COMMENT ON COLUMN criterika."casos_revision"."detectado_en" IS 'Fecha de detección.';

COMMENT ON COLUMN criterika."casos_revision"."resultado" IS 'DESCARTADO o CORREGIDO según contrato.';

COMMENT ON COLUMN criterika."casos_revision"."motivo_resolucion" IS 'Justificación de cierre.';

COMMENT ON COLUMN criterika."casos_revision"."resuelto_en" IS 'Fecha de resolución.';

COMMENT ON COLUMN criterika."casos_revision"."version" IS 'Concurrencia del caso.';

-- Evidencia de autor, acción y cambios permitidos.
CREATE TABLE criterika."eventos_auditoria" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_tipo" text NOT NULL,
  "administrador_id" uuid,
  "accion" text NOT NULL,
  "recurso_tipo" text NOT NULL,
  "recurso_id" uuid,
  "ocurrido_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "motivo" text,
  "cambios_permitidos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "request_id" uuid NOT NULL,
  "resultado" text NOT NULL,
  "expira_en" timestamptz NOT NULL,
  CONSTRAINT "pk_eventos_auditoria" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."eventos_auditoria" IS 'Evidencia de autor, acción y cambios permitidos.';

COMMENT ON COLUMN criterika."eventos_auditoria"."id" IS 'Identidad del evento.';

COMMENT ON COLUMN criterika."eventos_auditoria"."actor_tipo" IS 'ADMINISTRADOR, SISTEMA o MANTENIMIENTO.';

COMMENT ON COLUMN criterika."eventos_auditoria"."administrador_id" IS 'Autor autenticado si corresponde, no recibido del cliente.';

COMMENT ON COLUMN criterika."eventos_auditoria"."accion" IS 'Acción tipificada.';

COMMENT ON COLUMN criterika."eventos_auditoria"."recurso_tipo" IS 'Clase del objeto intervenido.';

COMMENT ON COLUMN criterika."eventos_auditoria"."recurso_id" IS 'Identificador de trazabilidad, no una FK polimórfica que afirme integridad sobre todas las tablas.';

COMMENT ON COLUMN criterika."eventos_auditoria"."ocurrido_en" IS 'Fecha/hora UTC del servidor.';

COMMENT ON COLUMN criterika."eventos_auditoria"."motivo" IS 'Motivo acotado y depurable.';

COMMENT ON COLUMN criterika."eventos_auditoria"."cambios_permitidos" IS 'Lista de campos y valores permitidos; sin secretos ni snapshots indiscriminados.';

COMMENT ON COLUMN criterika."eventos_auditoria"."request_id" IS 'Correlación técnica.';

COMMENT ON COLUMN criterika."eventos_auditoria"."resultado" IS 'CONFIRMADO o RECHAZADO.';

COMMENT ON COLUMN criterika."eventos_auditoria"."expira_en" IS 'Máximo técnico 180 días desde evento, salvo supresión más temprana aplicable.';

-- Identificación restringida de personas cuyos datos aparecen en un evento para depuración efectiva.
CREATE TABLE criterika."auditoria_sujetos" (
  "evento_id" uuid NOT NULL,
  "cuenta_id" uuid NOT NULL,
  CONSTRAINT "pk_auditoria_sujetos" PRIMARY KEY ("evento_id", "cuenta_id")
);

COMMENT ON TABLE criterika."auditoria_sujetos" IS 'Identificación restringida de personas cuyos datos aparecen en un evento para depuración efectiva.';

COMMENT ON COLUMN criterika."auditoria_sujetos"."evento_id" IS 'Evento que contiene o referencia datos del sujeto.';

COMMENT ON COLUMN criterika."auditoria_sujetos"."cuenta_id" IS 'Titular vinculado, incluidos identificadores indirectos relevantes.';

-- Control mínimo que sobrevive a la cuenta para restauraciones seguras.
CREATE TABLE criterika."controles_eliminacion" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sujeto_tecnico_id" uuid NOT NULL,
  "expira_en" timestamptz,
  "clave_control_externo" text NOT NULL,
  "confirmado_fuera_respaldo_en" timestamptz,
  "registrado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "purga_confirmada_en" timestamptz,
  CONSTRAINT "pk_controles_eliminacion" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."controles_eliminacion" IS 'Control mínimo que sobrevive a la cuenta para restauraciones seguras.';

COMMENT ON COLUMN criterika."controles_eliminacion"."id" IS 'Identidad de control.';

COMMENT ON COLUMN criterika."controles_eliminacion"."sujeto_tecnico_id" IS 'ID eliminado: deliberadamente SIN FK a una cuenta que debe desaparecer.';

COMMENT ON COLUMN criterika."controles_eliminacion"."expira_en" IS 'Sesenta días según política técnica, sin reiniciar al restaurar.';

COMMENT ON COLUMN criterika."controles_eliminacion"."clave_control_externo" IS 'Referencia opaca en registro protegido fuera del conjunto restaurado.';

COMMENT ON COLUMN criterika."controles_eliminacion"."confirmado_fuera_respaldo_en" IS 'Confirmación que permite hard delete operativo.';

COMMENT ON COLUMN criterika."controles_eliminacion"."registrado_en" IS 'Orden de exclusión confirmada fuera del respaldo antes de purga.';

COMMENT ON COLUMN criterika."controles_eliminacion"."purga_confirmada_en" IS 'Fecha original de supresión operativa; se conserva para no reiniciar retención al restaurar.';
