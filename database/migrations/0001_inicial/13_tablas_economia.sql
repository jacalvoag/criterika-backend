-- Criterika · migración 0001 · 13_tablas_economia.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Recibo de compra completa de paquete.
CREATE TABLE criterika."compras_vidas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid NOT NULL,
  "paquete" text NOT NULL,
  "vidas_entregadas" smallint NOT NULL,
  "gemas_gastadas" integer NOT NULL,
  "economia_al_confirmar" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "creada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_compras_vidas" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."compras_vidas" IS 'Recibo de compra completa de paquete.';

COMMENT ON COLUMN criterika."compras_vidas"."id" IS 'Identidad de recibo del API.';

COMMENT ON COLUMN criterika."compras_vidas"."jugador_id" IS 'Comprador.';

COMMENT ON COLUMN criterika."compras_vidas"."paquete" IS 'VIDA_1, VIDAS_3 o VIDAS_5.';

COMMENT ON COLUMN criterika."compras_vidas"."vidas_entregadas" IS '1, 3 o 5.';

COMMENT ON COLUMN criterika."compras_vidas"."gemas_gastadas" IS '100, 150 o 250 según paquete.';

COMMENT ON COLUMN criterika."compras_vidas"."economia_al_confirmar" IS 'Recibo histórico acotado de economía propia, no fuente actual de saldo.';

COMMENT ON COLUMN criterika."compras_vidas"."creada_en" IS 'Hora de confirmación.';

-- Posesión legítima de carta base.
CREATE TABLE criterika."cartas_obtenidas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid NOT NULL,
  "carta_id" uuid NOT NULL,
  "aprobacion_origen_id" uuid NOT NULL,
  "obtenida_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_cartas_obtenidas" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."cartas_obtenidas" IS 'Posesión legítima de carta base.';

COMMENT ON COLUMN criterika."cartas_obtenidas"."id" IS 'Identidad de posesión.';

COMMENT ON COLUMN criterika."cartas_obtenidas"."jugador_id" IS 'Propietario.';

COMMENT ON COLUMN criterika."cartas_obtenidas"."carta_id" IS 'Carta de unidad.';

COMMENT ON COLUMN criterika."cartas_obtenidas"."aprobacion_origen_id" IS 'Primera aprobación de final de su unidad.';

COMMENT ON COLUMN criterika."cartas_obtenidas"."obtenida_en" IS 'Instante de adquisición.';

-- Compra de una etapa consecutiva de carta obtenida.
CREATE TABLE criterika."evoluciones_obtenidas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid NOT NULL,
  "carta_obtenida_id" uuid NOT NULL,
  "carta_id" uuid NOT NULL,
  "numero_etapa" smallint NOT NULL,
  "gemas_gastadas" integer NOT NULL,
  "economia_al_confirmar" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "obtenida_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_evoluciones_obtenidas" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."evoluciones_obtenidas" IS 'Compra de una etapa consecutiva de carta obtenida.';

COMMENT ON COLUMN criterika."evoluciones_obtenidas"."id" IS 'Identidad de compra/desbloqueo del API.';

COMMENT ON COLUMN criterika."evoluciones_obtenidas"."jugador_id" IS 'Propietario.';

COMMENT ON COLUMN criterika."evoluciones_obtenidas"."carta_obtenida_id" IS 'Posesión base del mismo jugador y carta.';

COMMENT ON COLUMN criterika."evoluciones_obtenidas"."carta_id" IS 'Carta para FK a etapa.';

COMMENT ON COLUMN criterika."evoluciones_obtenidas"."numero_etapa" IS '1–3.';

COMMENT ON COLUMN criterika."evoluciones_obtenidas"."gemas_gastadas" IS '150/350/500 correspondientes a etapa.';

COMMENT ON COLUMN criterika."evoluciones_obtenidas"."economia_al_confirmar" IS 'Recibo histórico de economía, no saldo actual.';

COMMENT ON COLUMN criterika."evoluciones_obtenidas"."obtenida_en" IS 'Fecha de adquisición.';

-- Adquisición única de término educativo.
CREATE TABLE criterika."terminos_desbloqueados" (
  "jugador_id" uuid NOT NULL,
  "termino_id" uuid NOT NULL,
  "aprobacion_origen_id" uuid NOT NULL,
  "desbloqueado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_terminos_desbloqueados" PRIMARY KEY ("jugador_id", "termino_id")
);

COMMENT ON TABLE criterika."terminos_desbloqueados" IS 'Adquisición única de término educativo.';

COMMENT ON COLUMN criterika."terminos_desbloqueados"."jugador_id" IS 'Propietario.';

COMMENT ON COLUMN criterika."terminos_desbloqueados"."termino_id" IS 'Término adquirido.';

COMMENT ON COLUMN criterika."terminos_desbloqueados"."aprobacion_origen_id" IS 'Primera aprobación que lo concedió.';

COMMENT ON COLUMN criterika."terminos_desbloqueados"."desbloqueado_en" IS 'Fecha de adquisición.';

-- Efecto de corrección comprobada que no desaparece al vencer auditoría.
CREATE TABLE criterika."correcciones_administrativas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "cantidad" bigint,
  "intento_aprobado_id" uuid,
  "caso_revision_id" uuid,
  "motivo" text NOT NULL,
  "creada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_correcciones_administrativas" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."correcciones_administrativas" IS 'Efecto de corrección comprobada que no desaparece al vencer auditoría.';

COMMENT ON COLUMN criterika."correcciones_administrativas"."id" IS 'Identidad de ajuste/restauración del API.';

COMMENT ON COLUMN criterika."correcciones_administrativas"."jugador_id" IS 'Titular afectado.';

COMMENT ON COLUMN criterika."correcciones_administrativas"."tipo" IS 'GEMAS, XP, VIDAS o RESTAURACION_PROGRESO.';

COMMENT ON COLUMN criterika."correcciones_administrativas"."cantidad" IS 'Delta no cero para ajustes, NULL para reconstrucción de progreso.';

COMMENT ON COLUMN criterika."correcciones_administrativas"."intento_aprobado_id" IS 'Evidencia propia necesaria para restauración de progreso.';

COMMENT ON COLUMN criterika."correcciones_administrativas"."caso_revision_id" IS 'Caso de inconsistencia relacionado si existe.';

COMMENT ON COLUMN criterika."correcciones_administrativas"."motivo" IS 'Motivo necesario sin secretos; sujeto a revisión de PII al cancelar.';

COMMENT ON COLUMN criterika."correcciones_administrativas"."creada_en" IS 'Fecha de confirmación.';

-- Registro contable de cada variación confirmada de gemas.
CREATE TABLE criterika."movimientos_gemas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "orden_contable" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "jugador_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "cantidad" bigint NOT NULL,
  "saldo_posterior" bigint NOT NULL,
  "aprobacion_id" uuid,
  "compra_vidas_id" uuid,
  "evolucion_obtenida_id" uuid,
  "correccion_id" uuid,
  "creado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_movimientos_gemas" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."movimientos_gemas" IS 'Registro contable de cada variación confirmada de gemas.';

COMMENT ON COLUMN criterika."movimientos_gemas"."id" IS 'Identidad del movimiento del API.';

COMMENT ON COLUMN criterika."movimientos_gemas"."orden_contable" IS 'Orden generado, estable, sin exigir ausencia de huecos.';

COMMENT ON COLUMN criterika."movimientos_gemas"."jugador_id" IS 'Titular.';

COMMENT ON COLUMN criterika."movimientos_gemas"."tipo" IS 'RECOMPENSA_NIVEL, COMPRA_VIDAS, EVOLUCION o AJUSTE_ADMIN.';

COMMENT ON COLUMN criterika."movimientos_gemas"."cantidad" IS 'Delta con signo distinto de cero.';

COMMENT ON COLUMN criterika."movimientos_gemas"."saldo_posterior" IS 'Saldo después de esta operación confirmada.';

COMMENT ON COLUMN criterika."movimientos_gemas"."aprobacion_id" IS 'Origen exclusivo si recompensa.';

COMMENT ON COLUMN criterika."movimientos_gemas"."compra_vidas_id" IS 'Origen exclusivo si paquete.';

COMMENT ON COLUMN criterika."movimientos_gemas"."evolucion_obtenida_id" IS 'Origen exclusivo si evolución.';

COMMENT ON COLUMN criterika."movimientos_gemas"."correccion_id" IS 'Origen exclusivo si ajuste de gemas.';

COMMENT ON COLUMN criterika."movimientos_gemas"."creado_en" IS 'Fecha de confirmación.';
