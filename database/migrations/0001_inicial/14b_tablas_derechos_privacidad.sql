-- Criterika · migración 0001 · 14b_tablas_derechos_privacidad.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

-- Expediente del solicitante/titular, incluso sin cuenta accesible.
CREATE TABLE criterika."solicitudes_privacidad" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "folio" text NOT NULL,
  "titular_cuenta_id" uuid,
  "nombre_solicitante" text NOT NULL,
  "correo_notificaciones" text NOT NULL,
  "representacion_alegada" boolean DEFAULT false NOT NULL,
  "tipo" text NOT NULL,
  "alcance" text NOT NULL,
  "descripcion" text NOT NULL,
  "rectificaciones_solicitadas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "estado" text DEFAULT 'RECIBIDA' NOT NULL,
  "recibida_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "limite_respuesta_en" timestamptz NOT NULL,
  "notificada_resolucion_en" timestamptz,
  "limite_ejecucion_en" timestamptz,
  "identidad_verificada_en" timestamptz,
  "expira_informacion_personal_en" timestamptz,
  "version" bigint DEFAULT 1 NOT NULL,
  CONSTRAINT "pk_solicitudes_privacidad" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."solicitudes_privacidad" IS 'Expediente del solicitante/titular, incluso sin cuenta accesible.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."id" IS 'Identidad del expediente.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."folio" IS 'Referencia humana única.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."titular_cuenta_id" IS 'Cuenta identificada tras acreditación; no obligatoria para admitir una solicitud.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."nombre_solicitante" IS 'Titular o representante, no necesariamente nombre de la cuenta.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."correo_notificaciones" IS 'Canal verificado; no prueba por sí solo identidad del titular.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."representacion_alegada" IS 'Indica revisión de representación cuando corresponda.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."tipo" IS 'ACCESO, RECTIFICACION, CANCELACION, OPOSICION o REVOCACION.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."alcance" IS 'TODOS_MIS_DATOS o DATOS_ESPECIFICOS.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."descripcion" IS 'Petición del titular, privada.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."rectificaciones_solicitadas" IS 'Lista tipada de campos permitidos y valores propios; sin rol, saldos o progreso.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."estado" IS 'RECIBIDA, VERIFICANDO_IDENTIDAD, EN_REVISION, RESUELTA, EN_EJECUCION o COMPLETADA.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."recibida_en" IS 'Inicio de cómputo de respuesta.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."limite_respuesta_en" IS 'Vencimiento calculado con calendario aplicable.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."notificada_resolucion_en" IS 'Inicio del plazo de ejecución si procede.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."limite_ejecucion_en" IS 'Vencimiento aplicable a ejecución.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."identidad_verificada_en" IS 'Resumen de verificación acreditada, coordinado con historial de verificaciones.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."expira_informacion_personal_en" IS 'Depuración al concluir necesidad o bloqueo justificado.';

COMMENT ON COLUMN criterika."solicitudes_privacidad"."version" IS 'Concurrencia del expediente.';

-- Alcance de oposición o revocación solicitado sobre finalidades conocidas.
CREATE TABLE criterika."solicitud_finalidades" (
  "solicitud_id" uuid NOT NULL,
  "finalidad_codigo" text NOT NULL,
  CONSTRAINT "pk_solicitud_finalidades" PRIMARY KEY ("solicitud_id", "finalidad_codigo")
);

COMMENT ON TABLE criterika."solicitud_finalidades" IS 'Alcance de oposición o revocación solicitado sobre finalidades conocidas.';

COMMENT ON COLUMN criterika."solicitud_finalidades"."solicitud_id" IS 'Expediente de origen.';

COMMENT ON COLUMN criterika."solicitud_finalidades"."finalidad_codigo" IS 'Finalidad señalada por el titular o identificada desde descripción suficiente.';

-- Evidencia privada aportada a un expediente.
CREATE TABLE criterika."adjuntos_privacidad" (
  "solicitud_id" uuid NOT NULL,
  "archivo_id" uuid NOT NULL,
  "aportado_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "expira_en" timestamptz,
  CONSTRAINT "pk_adjuntos_privacidad" PRIMARY KEY ("solicitud_id", "archivo_id")
);

COMMENT ON TABLE criterika."adjuntos_privacidad" IS 'Evidencia privada aportada a un expediente.';

COMMENT ON COLUMN criterika."adjuntos_privacidad"."solicitud_id" IS 'Expediente propietario.';

COMMENT ON COLUMN criterika."adjuntos_privacidad"."archivo_id" IS 'Archivo de evidencia, no imagen pública de catálogo.';

COMMENT ON COLUMN criterika."adjuntos_privacidad"."aportado_en" IS 'Fecha de recepción.';

COMMENT ON COLUMN criterika."adjuntos_privacidad"."expira_en" IS 'Al cesar necesidad; máximo treinta días tras cierre salvo bloqueo fundado.';

-- Mensajes y constancia de notificación de trámite.
CREATE TABLE criterika."comunicaciones_privacidad" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "solicitud_id" uuid NOT NULL,
  "autor_tipo" text NOT NULL,
  "mensaje_privado" text NOT NULL,
  "creada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "notificada_en" timestamptz,
  CONSTRAINT "pk_comunicaciones_privacidad" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."comunicaciones_privacidad" IS 'Mensajes y constancia de notificación de trámite.';

COMMENT ON COLUMN criterika."comunicaciones_privacidad"."id" IS 'Identidad de mensaje del API.';

COMMENT ON COLUMN criterika."comunicaciones_privacidad"."solicitud_id" IS 'Expediente.';

COMMENT ON COLUMN criterika."comunicaciones_privacidad"."autor_tipo" IS 'SOLICITANTE, ADMINISTRADOR o SISTEMA.';

COMMENT ON COLUMN criterika."comunicaciones_privacidad"."mensaje_privado" IS 'Solo contenido necesario del trámite; no se copia a logs.';

COMMENT ON COLUMN criterika."comunicaciones_privacidad"."creada_en" IS 'Fecha de registro.';

COMMENT ON COLUMN criterika."comunicaciones_privacidad"."notificada_en" IS 'Entrega por canal verificado; no confundir registro con notificación.';

-- Decisiones de acreditación y representación.
CREATE TABLE criterika."verificaciones_identidad_privacidad" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "solicitud_id" uuid NOT NULL,
  "resultado" text NOT NULL,
  "motivo_privado" text NOT NULL,
  "evaluada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_verificaciones_identidad_privacidad" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."verificaciones_identidad_privacidad" IS 'Decisiones de acreditación y representación.';

COMMENT ON COLUMN criterika."verificaciones_identidad_privacidad"."id" IS 'Identidad de evaluación.';

COMMENT ON COLUMN criterika."verificaciones_identidad_privacidad"."solicitud_id" IS 'Expediente evaluado.';

COMMENT ON COLUMN criterika."verificaciones_identidad_privacidad"."resultado" IS 'VERIFICADA, REQUIERE_EVIDENCIA o NO_ACREDITADA.';

COMMENT ON COLUMN criterika."verificaciones_identidad_privacidad"."motivo_privado" IS 'Justificación proporcional.';

COMMENT ON COLUMN criterika."verificaciones_identidad_privacidad"."evaluada_en" IS 'Fecha del servidor.';

-- Determinación final motivada del expediente.
CREATE TABLE criterika."resoluciones_privacidad" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "solicitud_id" uuid NOT NULL,
  "resultado" text NOT NULL,
  "motivo_privado" text NOT NULL,
  "fundamento" text NOT NULL,
  "rectificaciones_aprobadas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "datos_conservados" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "bloqueo_hasta" timestamptz,
  "resuelta_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT "pk_resoluciones_privacidad" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."resoluciones_privacidad" IS 'Determinación final motivada del expediente.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."id" IS 'Identidad de resolución.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."solicitud_id" IS 'Expediente con una determinación final.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."resultado" IS 'PROCEDENTE, PARCIAL o IMPROCEDENTE.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."motivo_privado" IS 'Explicación al titular.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."fundamento" IS 'Base concreta de la decisión y de cualquier conservación.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."rectificaciones_aprobadas" IS 'Cambios tipados de perfil que se autoriza ejecutar, subset de solicitud.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."datos_conservados" IS 'Lista acotada de categorías y alcance, sin copiar esos datos.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."bloqueo_hasta" IS 'Vencimiento explícito si existe bloqueo.';

COMMENT ON COLUMN criterika."resoluciones_privacidad"."resuelta_en" IS 'Fecha del servidor.';

-- Ampliaciones justificadas sin reiniciar plazos.
CREATE TABLE criterika."ampliaciones_privacidad" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "solicitud_id" uuid NOT NULL,
  "fase" text NOT NULL,
  "vencimiento_anterior" timestamptz NOT NULL,
  "vencimiento_nuevo" timestamptz NOT NULL,
  "motivo" text NOT NULL,
  "registrada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "notificada_en" timestamptz,
  CONSTRAINT "pk_ampliaciones_privacidad" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."ampliaciones_privacidad" IS 'Ampliaciones justificadas sin reiniciar plazos.';

COMMENT ON COLUMN criterika."ampliaciones_privacidad"."id" IS 'Identidad de ampliación.';

COMMENT ON COLUMN criterika."ampliaciones_privacidad"."solicitud_id" IS 'Expediente.';

COMMENT ON COLUMN criterika."ampliaciones_privacidad"."fase" IS 'RESPUESTA o EJECUCION.';

COMMENT ON COLUMN criterika."ampliaciones_privacidad"."vencimiento_anterior" IS 'Fecha anterior preservada.';

COMMENT ON COLUMN criterika."ampliaciones_privacidad"."vencimiento_nuevo" IS 'Fecha calculada con fundamento/calendario.';

COMMENT ON COLUMN criterika."ampliaciones_privacidad"."motivo" IS 'Justificación necesaria.';

COMMENT ON COLUMN criterika."ampliaciones_privacidad"."registrada_en" IS 'Fecha de registro.';

COMMENT ON COLUMN criterika."ampliaciones_privacidad"."notificada_en" IS 'Constancia de comunicación.';

-- Ejecución reintentable de una resolución procedente o parcial.
CREATE TABLE criterika."ejecuciones_privacidad" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "resolucion_id" uuid NOT NULL,
  "solicitud_id" uuid NOT NULL,
  "estado" text NOT NULL,
  "iniciada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "completada_en" timestamptz,
  "codigo_error" text,
  CONSTRAINT "pk_ejecuciones_privacidad" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."ejecuciones_privacidad" IS 'Ejecución reintentable de una resolución procedente o parcial.';

COMMENT ON COLUMN criterika."ejecuciones_privacidad"."id" IS 'Identidad de ejecución del API.';

COMMENT ON COLUMN criterika."ejecuciones_privacidad"."resolucion_id" IS 'Determinación que autoriza acciones.';

COMMENT ON COLUMN criterika."ejecuciones_privacidad"."solicitud_id" IS 'Redundancia para asegurar resolución del mismo expediente.';

COMMENT ON COLUMN criterika."ejecuciones_privacidad"."estado" IS 'PENDIENTE, EN_PROCESO, COMPLETADA o ERROR.';

COMMENT ON COLUMN criterika."ejecuciones_privacidad"."iniciada_en" IS 'Fecha de inicio.';

COMMENT ON COLUMN criterika."ejecuciones_privacidad"."completada_en" IS 'Solo cuando todos los pasos aplicables terminaron.';

COMMENT ON COLUMN criterika."ejecuciones_privacidad"."codigo_error" IS 'Error sanitizado, sin payload personal.';

-- Control de efectos externos y supresión sin fingir transacciones entre proveedores.
CREATE TABLE criterika."pasos_ejecucion_privacidad" (
  "ejecucion_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "estado" text NOT NULL,
  "vencimiento_en" timestamptz,
  "reintentar_en" timestamptz,
  "intentos" integer DEFAULT 0 NOT NULL,
  "completado_en" timestamptz,
  "evidencia_minima" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "codigo_error" text,
  CONSTRAINT "pk_pasos_ejecucion_privacidad" PRIMARY KEY ("ejecucion_id", "tipo")
);

COMMENT ON TABLE criterika."pasos_ejecucion_privacidad" IS 'Control de efectos externos y supresión sin fingir transacciones entre proveedores.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."ejecucion_id" IS 'Ejecución propietaria.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."tipo" IS 'DATOS_OPERATIVOS, ARCHIVOS, TERCEROS, RESPALDOS o BLOQUEO_JUSTIFICADO.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."estado" IS 'PENDIENTE, EN_PROCESO, BLOQUEADO, COMPLETADO o ERROR.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."vencimiento_en" IS 'Fecha límite aplicable a ese paso.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."reintentar_en" IS 'Próxima comprobación/reintento.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."intentos" IS 'Número de intentos técnicos, no de juego.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."completado_en" IS 'Confirmación del resultado real.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."evidencia_minima" IS 'Resultado y referencias opacas necesarias; no datos suprimidos completos.';

COMMENT ON COLUMN criterika."pasos_ejecucion_privacidad"."codigo_error" IS 'Código sanitizado.';

-- Efecto vigente de oposición o revocación sobre una finalidad.
CREATE TABLE criterika."restricciones_tratamiento" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "jugador_id" uuid NOT NULL,
  "finalidad_codigo" text NOT NULL,
  "resolucion_id" uuid NOT NULL,
  "aplicada_en" timestamptz DEFAULT transaction_timestamp() NOT NULL,
  "levantada_en" timestamptz,
  CONSTRAINT "pk_restricciones_tratamiento" PRIMARY KEY ("id")
);

COMMENT ON TABLE criterika."restricciones_tratamiento" IS 'Efecto vigente de oposición o revocación sobre una finalidad.';

COMMENT ON COLUMN criterika."restricciones_tratamiento"."id" IS 'Identidad interna de restricción.';

COMMENT ON COLUMN criterika."restricciones_tratamiento"."jugador_id" IS 'Titular identificado.';

COMMENT ON COLUMN criterika."restricciones_tratamiento"."finalidad_codigo" IS 'Finalidad estable, independiente de nueva versión del aviso.';

COMMENT ON COLUMN criterika."restricciones_tratamiento"."resolucion_id" IS 'Resolución procedente o parcial que origina restricción.';

COMMENT ON COLUMN criterika."restricciones_tratamiento"."aplicada_en" IS 'Inicio del efecto.';

COMMENT ON COLUMN criterika."restricciones_tratamiento"."levantada_en" IS 'Solo mediante nueva manifestación válida o resolución que corresponda; no por publicar otro aviso.';

-- Finalidades cuyo tratamiento autoriza restringir la resolución.
CREATE TABLE criterika."resolucion_finalidades" (
  "resolucion_id" uuid NOT NULL,
  "finalidad_codigo" text NOT NULL,
  CONSTRAINT "pk_resolucion_finalidades" PRIMARY KEY ("resolucion_id", "finalidad_codigo")
);

COMMENT ON TABLE criterika."resolucion_finalidades" IS 'Finalidades cuyo tratamiento autoriza restringir la resolución.';

COMMENT ON COLUMN criterika."resolucion_finalidades"."resolucion_id" IS 'Determinación de origen.';

COMMENT ON COLUMN criterika."resolucion_finalidades"."finalidad_codigo" IS 'Finalidad afectada aprobada.';

-- Documentos concretos del expediente considerados en una verificación.
CREATE TABLE criterika."verificacion_adjuntos" (
  "verificacion_id" uuid NOT NULL,
  "solicitud_id" uuid NOT NULL,
  "archivo_id" uuid NOT NULL,
  CONSTRAINT "pk_verificacion_adjuntos" PRIMARY KEY ("verificacion_id", "archivo_id")
);

COMMENT ON TABLE criterika."verificacion_adjuntos" IS 'Documentos concretos del expediente considerados en una verificación.';

COMMENT ON COLUMN criterika."verificacion_adjuntos"."verificacion_id" IS 'Verificación realizada.';

COMMENT ON COLUMN criterika."verificacion_adjuntos"."solicitud_id" IS 'Redundancia para impedir vincular evidencias de otro expediente.';

COMMENT ON COLUMN criterika."verificacion_adjuntos"."archivo_id" IS 'Adjunto considerado.';
