-- Criterika · migración 0001 · 15_tablas_soportes.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Sesiones revocables de cuenta sin persistir access JWT como credencial recuperable.
CREATE TABLE criterika."sesiones" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cuenta_id" uuid NOT NULL,
  "refresh_hash" bytea NOT NULL,
  "refresh_anterior_hash" bytea,
  "creada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "expira_en" timestamptz NOT NULL,
  "revocada_en" timestamptz,
  "identidad_confirmada_en" timestamptz,
  CONSTRAINT "pk_sesiones" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."sesiones" IS 'Sesiones revocables de cuenta sin persistir access JWT como credencial recuperable.';

COMMENT ON COLUMN criterika."sesiones"."id" IS 'Identidad de sesión.';

COMMENT ON COLUMN criterika."sesiones"."cuenta_id" IS 'Cuenta propietaria.';

COMMENT ON COLUMN criterika."sesiones"."refresh_hash" IS 'Verificador del refresh vigente, nunca token en claro.';

COMMENT ON COLUMN criterika."sesiones"."refresh_anterior_hash" IS 'Detecta reutilización/recuperación dentro de ventana definida.';

COMMENT ON COLUMN criterika."sesiones"."creada_en" IS 'Inicio de sesión.';

COMMENT ON COLUMN criterika."sesiones"."expira_en" IS 'Límite absoluto de treinta días u ocho horas según rol.';

COMMENT ON COLUMN criterika."sesiones"."revocada_en" IS 'Revocación antes de vencimiento.';

COMMENT ON COLUMN criterika."sesiones"."identidad_confirmada_en" IS 'Ventana de cinco minutos para operación sensible.';

-- Registro no verificado que todavía no es cuenta activa.
CREATE TABLE criterika."registros_pendientes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "correo_normalizado" text NOT NULL,
  "nombre" text NOT NULL,
  "apellidos" text NOT NULL,
  "fecha_nacimiento" date NOT NULL,
  "contrasena_hash" text NOT NULL,
  "terminos_version_id" uuid NOT NULL,
  "aviso_version_id" uuid NOT NULL,
  "finalidades_codigos" text[] NOT NULL,
  "aceptada_en" timestamptz NOT NULL,
  "ip_aceptacion" inet NOT NULL,
  "creado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "expira_en" timestamptz NOT NULL,
  "cuenta_creada_id" uuid,
  CONSTRAINT "pk_registros_pendientes" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."registros_pendientes" IS 'Registro no verificado que todavía no es cuenta activa.';

COMMENT ON COLUMN criterika."registros_pendientes"."id" IS 'Identidad de registro del API.';

COMMENT ON COLUMN criterika."registros_pendientes"."correo_normalizado" IS 'Destino de verificación; existencia de cuenta no se revela.';

COMMENT ON COLUMN criterika."registros_pendientes"."nombre" IS 'Datos pendientes.';

COMMENT ON COLUMN criterika."registros_pendientes"."apellidos" IS 'Datos pendientes.';

COMMENT ON COLUMN criterika."registros_pendientes"."fecha_nacimiento" IS 'Edad validada en recepción.';

COMMENT ON COLUMN criterika."registros_pendientes"."contrasena_hash" IS 'Argon2id desde el inicio.';

COMMENT ON COLUMN criterika."registros_pendientes"."terminos_version_id" IS 'Documento realmente presentado.';

COMMENT ON COLUMN criterika."registros_pendientes"."aviso_version_id" IS 'Aviso realmente presentado.';

COMMENT ON COLUMN criterika."registros_pendientes"."finalidades_codigos" IS 'Valores locales declarados en ese aviso, validados al captar/confirmar.';

COMMENT ON COLUMN criterika."registros_pendientes"."aceptada_en" IS 'Instante original de manifestación.';

COMMENT ON COLUMN criterika."registros_pendientes"."ip_aceptacion" IS 'IP original captada en servidor.';

COMMENT ON COLUMN criterika."registros_pendientes"."creado_en" IS 'Fecha de recepción.';

COMMENT ON COLUMN criterika."registros_pendientes"."expira_en" IS 'Máximo absoluto 24 horas, no se extiende por reenvío.';

COMMENT ON COLUMN criterika."registros_pendientes"."cuenta_creada_id" IS 'Marca temporal de finalización para recuperación segura de respuesta.';

-- Credenciales temporales separadas por finalidad.
CREATE TABLE criterika."desafios_verificacion" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "clase" text NOT NULL,
  "finalidad" text NOT NULL,
  "cuenta_id" uuid,
  "registro_id" uuid,
  "solicitud_privacidad_id" uuid,
  "desafio_padre_id" uuid,
  "correo_destino" text NOT NULL,
  "verificador_hash" bytea NOT NULL,
  "intentos_fallidos" smallint DEFAULT 0 NOT NULL,
  "creado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "expira_en" timestamptz NOT NULL,
  "usado_en" timestamptz,
  "reenvio_disponible_en" timestamptz,
  "estado_envio" text DEFAULT 'PENDIENTE' NOT NULL,
  "mensaje_envio_cifrado" bytea,
  CONSTRAINT "pk_desafios_verificacion" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."desafios_verificacion" IS 'Credenciales temporales separadas por finalidad.';

COMMENT ON COLUMN criterika."desafios_verificacion"."id" IS 'Handle aleatorio de desafío/credencial.';

COMMENT ON COLUMN criterika."desafios_verificacion"."clase" IS 'CODIGO o TOKEN_ENTRADA_ARCO o ENLACE_RECUPERACION o CONFIRMACION_CORREO.';

COMMENT ON COLUMN criterika."desafios_verificacion"."finalidad" IS 'REGISTRO, LOGIN_ADMIN, RECUPERACION, ENTRADA_ARCO o RECTIFICACION_CORREO.';

COMMENT ON COLUMN criterika."desafios_verificacion"."cuenta_id" IS 'Cuenta relacionada cuando existe y está autorizada la vinculación.';

COMMENT ON COLUMN criterika."desafios_verificacion"."registro_id" IS 'Registro pendiente de origen.';

COMMENT ON COLUMN criterika."desafios_verificacion"."solicitud_privacidad_id" IS 'Expediente de rectificación si corresponde.';

COMMENT ON COLUMN criterika."desafios_verificacion"."desafio_padre_id" IS 'Desafío ya verificado que origina credencial de entrada ARCO.';

COMMENT ON COLUMN criterika."desafios_verificacion"."correo_destino" IS 'Destino estrictamente necesario, no prueba de titularidad de otra cuenta.';

COMMENT ON COLUMN criterika."desafios_verificacion"."verificador_hash" IS 'Código/enlace/token solo mediante verificador seguro.';

COMMENT ON COLUMN criterika."desafios_verificacion"."intentos_fallidos" IS '0–5 para códigos.';

COMMENT ON COLUMN criterika."desafios_verificacion"."creado_en" IS 'Fecha de creación.';

COMMENT ON COLUMN criterika."desafios_verificacion"."expira_en" IS 'Diez minutos; token de entrada ARCO treinta minutos.';

COMMENT ON COLUMN criterika."desafios_verificacion"."usado_en" IS 'Un uso de código/enlace; entrada ARCO limitada hasta vencimiento según alcance.';

COMMENT ON COLUMN criterika."desafios_verificacion"."reenvio_disponible_en" IS 'No antes de sesenta segundos para código.';

COMMENT ON COLUMN criterika."desafios_verificacion"."estado_envio" IS 'PENDIENTE, ENVIADO o ERROR.';

COMMENT ON COLUMN criterika."desafios_verificacion"."mensaje_envio_cifrado" IS 'Solo secreto temporal necesario para reintentar envío; eliminar al enviar o vencer, nunca loguear.';

-- Recuperación temporal de respuestas por intención.
CREATE TABLE criterika."controles_idempotencia" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ambito_hash" bytea NOT NULL,
  "cuenta_id" uuid,
  "sesion_id" uuid,
  "metodo" text NOT NULL,
  "ruta_normalizada" text NOT NULL,
  "clave" uuid NOT NULL,
  "huella_solicitud" bytea NOT NULL,
  "estado" text NOT NULL,
  "respuesta_cifrada" bytea,
  "codigo_http" integer,
  "creado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "expira_en" timestamptz NOT NULL,
  CONSTRAINT "pk_controles_idempotencia" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."controles_idempotencia" IS 'Recuperación temporal de respuestas por intención.';

COMMENT ON COLUMN criterika."controles_idempotencia"."id" IS 'Identidad interna del control.';

COMMENT ON COLUMN criterika."controles_idempotencia"."ambito_hash" IS 'Ámbito protegido de actor/sesión o trámite público, sin credenciales en claro.';

COMMENT ON COLUMN criterika."controles_idempotencia"."cuenta_id" IS 'Referencia para autorización/depuración si existe cuenta.';

COMMENT ON COLUMN criterika."controles_idempotencia"."sesion_id" IS 'Referencia de sesión si aplica.';

COMMENT ON COLUMN criterika."controles_idempotencia"."metodo" IS 'Método HTTP.';

COMMENT ON COLUMN criterika."controles_idempotencia"."ruta_normalizada" IS 'Operación y parámetros de identidad necesarios, nunca query con PII o tokens.';

COMMENT ON COLUMN criterika."controles_idempotencia"."clave" IS 'Idempotency-Key del cliente.';

COMMENT ON COLUMN criterika."controles_idempotencia"."huella_solicitud" IS 'Huella protegida del cuerpo normalizado.';

COMMENT ON COLUMN criterika."controles_idempotencia"."estado" IS 'EN_PROCESO o CONFIRMADO.';

COMMENT ON COLUMN criterika."controles_idempotencia"."respuesta_cifrada" IS 'Respuesta protegida para replay; puede contener PII/tokens, sin copia en logs.';

COMMENT ON COLUMN criterika."controles_idempotencia"."codigo_http" IS 'Resultado original confirmado.';

COMMENT ON COLUMN criterika."controles_idempotencia"."creado_en" IS 'Fecha de reserva de intención.';

COMMENT ON COLUMN criterika."controles_idempotencia"."expira_en" IS '24 horas, o cinco minutos si devuelve tokens.';

-- Estado mínimo de tareas internas sin crear otro sistema de negocio.
CREATE TABLE criterika."estados_tareas" (
  "nombre" text NOT NULL,
  "ultima_ejecucion_en" timestamptz,
  "ultimo_exito_en" timestamptz,
  "estado" text NOT NULL,
  "pendientes" integer DEFAULT 0 NOT NULL,
  "codigo_error" text,
  CONSTRAINT "pk_estados_tareas" PRIMARY KEY ("nombre")
);

COMMENT ON TABLE criterika."estados_tareas" IS 'Estado mínimo de tareas internas sin crear otro sistema de negocio.';

COMMENT ON COLUMN criterika."estados_tareas"."nombre" IS 'INTENTOS, DEPURACION, INCONSISTENCIAS, INACTIVIDAD o ELIMINACIONES.';

COMMENT ON COLUMN criterika."estados_tareas"."ultima_ejecucion_en" IS 'Fecha de ejecución.';

COMMENT ON COLUMN criterika."estados_tareas"."ultimo_exito_en" IS 'Fecha de último éxito.';

COMMENT ON COLUMN criterika."estados_tareas"."estado" IS 'OK, PENDIENTE o ERROR.';

COMMENT ON COLUMN criterika."estados_tareas"."pendientes" IS 'Conteo agregado sin datos personales.';

COMMENT ON COLUMN criterika."estados_tareas"."codigo_error" IS 'Error sanitizado.';
