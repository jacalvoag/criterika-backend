-- Criterika · migración 0001 · 10_tablas_cuentas.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Identidad única y perfil de jugador o administrador.
CREATE TABLE criterika."cuentas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "rol" text NOT NULL,
  "correo_normalizado" text NOT NULL,
  "correo_presentacion" text NOT NULL,
  "contrasena_hash" text NOT NULL,
  "nombre" text NOT NULL,
  "apellidos" text,
  "fecha_nacimiento" date,
  "avatar_archivo_id" uuid,
  "situacion_operativa" text DEFAULT 'HABILITADA' NOT NULL,
  "correo_confirmado_en" timestamptz,
  "creada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "ultimo_uso_personal_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "aviso_inactividad_en" timestamptz,
  "eliminacion_inactividad_prevista_en" timestamptz,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_cuentas" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."cuentas" IS 'Identidad única y perfil de jugador o administrador.';

COMMENT ON COLUMN criterika."cuentas"."id" IS 'Identidad de cuenta expuesta como usuarioId/id según el DTO.';

COMMENT ON COLUMN criterika."cuentas"."rol" IS 'JUGADOR o ADMINISTRADOR; no editable desde API.';

COMMENT ON COLUMN criterika."cuentas"."correo_normalizado" IS 'Identificador de acceso único según política de normalización, sin reglas particulares de proveedores.';

COMMENT ON COLUMN criterika."cuentas"."correo_presentacion" IS 'Forma de correo que se muestra al titular.';

COMMENT ON COLUMN criterika."cuentas"."contrasena_hash" IS 'Hash Argon2id; nunca contraseña reversible.';

COMMENT ON COLUMN criterika."cuentas"."nombre" IS 'Nombre del titular o nombre de la cuenta administrativa fija.';

COMMENT ON COLUMN criterika."cuentas"."apellidos" IS 'Obligatorios para jugador.';

COMMENT ON COLUMN criterika."cuentas"."fecha_nacimiento" IS 'Obligatoria para jugador; mayoría de edad validada al registrar y elegibilidad al operar.';

COMMENT ON COLUMN criterika."cuentas"."avatar_archivo_id" IS 'Avatar propio opcional.';

COMMENT ON COLUMN criterika."cuentas"."situacion_operativa" IS 'HABILITADA o CANCELACION_EN_PROCESO. Sanciones/restricciones se consultan por separado.';

COMMENT ON COLUMN criterika."cuentas"."correo_confirmado_en" IS 'Confirmación real del destino.';

COMMENT ON COLUMN criterika."cuentas"."creada_en" IS 'Hora del servidor.';

COMMENT ON COLUMN criterika."cuentas"."ultimo_uso_personal_en" IS 'No se actualiza por refresh automático o cron.';

COMMENT ON COLUMN criterika."cuentas"."aviso_inactividad_en" IS 'Aviso previo de eliminación por inactividad.';

COMMENT ON COLUMN criterika."cuentas"."eliminacion_inactividad_prevista_en" IS 'No anterior a treinta días desde aviso.';

COMMENT ON COLUMN criterika."cuentas"."version" IS 'Concurrencia optimista, independiente del número de publicaciones.';

-- Estado operativo de economía, vidas y último hito de racha.
CREATE TABLE criterika."estados_jugador" (
  "cuenta_id" uuid NOT NULL,
  "gemas_saldo" bigint DEFAULT 0 NOT NULL,
  "xp_total" bigint DEFAULT 0 NOT NULL,
  "vidas_totales" smallint DEFAULT 5 NOT NULL,
  "proxima_regeneracion_en" timestamptz,
  "racha_ultimo_dia" date,
  "racha_contador_hito" integer DEFAULT 0 NOT NULL,
  "racha_zona" text DEFAULT 'Etc/UTC' NOT NULL,
  CONSTRAINT "pk_estados_jugador" PRIMARY KEY ("cuenta_id")
);

COMMENT ON TABLE criterika."estados_jugador" IS 'Estado operativo de economía, vidas y último hito de racha.';

COMMENT ON COLUMN criterika."estados_jugador"."cuenta_id" IS 'Cuenta con rol JUGADOR; identidad de este estado.';

COMMENT ON COLUMN criterika."estados_jugador"."gemas_saldo" IS 'Resumen contable actualizado con movimientos; no negativo.';

COMMENT ON COLUMN criterika."estados_jugador"."xp_total" IS 'Primeras aprobaciones más correcciones de XP; no negativo.';

COMMENT ON COLUMN criterika."estados_jugador"."vidas_totales" IS 'Entre cero y cinco, incluye la vida reservada implícita del intento activo.';

COMMENT ON COLUMN criterika."estados_jugador"."proxima_regeneracion_en" IS 'Referencia para regenerar; NULL al alcanzar máximo.';

COMMENT ON COLUMN criterika."estados_jugador"."racha_ultimo_dia" IS 'Última fecha local acreditada.';

COMMENT ON COLUMN criterika."estados_jugador"."racha_contador_hito" IS 'Consecutivos al acreditar ese día; la vigencia al consultar se calcula.';

COMMENT ON COLUMN criterika."estados_jugador"."racha_zona" IS 'Zona IANA del último cálculo; inicialmente Etc/UTC.';
