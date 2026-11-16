-- Criterika · migración 0001 · 30_funciones_contexto_auditoria.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.


-- El contexto procede del backend autenticado. La credencial SQL compartida NO verifica JWT.
-- Los tres administradores son cuentas de aplicación; estos roles son grupos técnicos de PostgreSQL.
CREATE FUNCTION criterika.rol_conexion() RETURNS name
LANGUAGE sql STABLE SET search_path=pg_catalog
AS $$ SELECT COALESCE(NULLIF(current_setting('role',true),'none'),session_user)::name $$;

CREATE FUNCTION criterika.es_mantenimiento() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,criterika
AS $$ SELECT criterika.rol_conexion()='criterika_owner'
 OR pg_has_role(criterika.rol_conexion(),'criterika_maintenance','USAGE') $$;

CREATE FUNCTION criterika.establecer_contexto(p_tipo text,p_actor uuid,p_request uuid,p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,criterika,pg_temp AS $$
DECLARE v_rol text;
BEGIN
 IF p_tipo NOT IN ('JUGADOR','ADMINISTRADOR','SISTEMA','MANTENIMIENTO') OR p_request IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Contexto inválido';
 END IF;
 IF p_tipo IN ('JUGADOR','ADMINISTRADOR') THEN
  SELECT rol INTO v_rol FROM criterika.cuentas WHERE id=p_actor;
  IF v_rol IS DISTINCT FROM p_tipo THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Actor no corresponde al contexto';
  END IF;
 ELSIF p_actor IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Contexto técnico no admite identidad humana atribuida';
 END IF;
 IF p_tipo='MANTENIMIENTO' AND NOT criterika.es_mantenimiento() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Rol de mantenimiento requerido';
 END IF;
 IF p_motivo IS NOT NULL AND length(p_motivo)>500 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Motivo excede el límite';
 END IF;
 PERFORM set_config('criterika.actor_tipo',p_tipo,true);
 PERFORM set_config('criterika.actor_id',coalesce(p_actor::text,''),true);
 PERFORM set_config('criterika.request_id',p_request::text,true);
 PERFORM set_config('criterika.motivo',coalesce(p_motivo,''),true);
END $$;

CREATE FUNCTION criterika.cambios_auditables(p_antes jsonb,p_despues jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('campo',k,
  'anterior',CASE WHEN k=ANY(ARRAY['estado','rol','tipo','habilitada','orden','posicion','numero','cantidad','saldo_posterior','gemas_saldo','xp_total','vidas_totales','estructura_fijada','version','version_recurso','numero_etapa','gemas_gastadas','vidas_entregadas']) THEN p_antes->k ELSE 'null'::jsonb END,
  'posterior',CASE WHEN k=ANY(ARRAY['estado','rol','tipo','habilitada','orden','posicion','numero','cantidad','saldo_posterior','gemas_saldo','xp_total','vidas_totales','estructura_fijada','version','version_recurso','numero_etapa','gemas_gastadas','vidas_entregadas']) THEN p_despues->k ELSE 'null'::jsonb END) ORDER BY k),'[]'::jsonb)
 FROM (SELECT jsonb_object_keys(coalesce(p_antes,'{}')||coalesce(p_despues,'{}')) AS k) keys
 WHERE p_antes->k IS DISTINCT FROM p_despues->k
$$;

CREATE FUNCTION criterika.auditar_cambio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
DECLARE a jsonb; d jsonb; r jsonb; v_tipo text; v_actor uuid; v_req uuid;
 v_evento uuid; v_sujeto uuid; v_id uuid; v_campo text; v_motivo text;
BEGIN
 a:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 d:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 r:=CASE WHEN TG_OP='DELETE' THEN a ELSE d END;
 v_tipo:=nullif(current_setting('criterika.actor_tipo',true),'');
 IF v_tipo IS NULL AND criterika.es_mantenimiento() THEN v_tipo:='MANTENIMIENTO'; END IF;
 IF v_tipo IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contexto de operación requerido'; END IF;
 IF v_tipo NOT IN ('JUGADOR','ADMINISTRADOR','SISTEMA','MANTENIMIENTO') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Tipo de contexto no autorizado';
 END IF;
 IF v_tipo='MANTENIMIENTO' AND NOT criterika.es_mantenimiento() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contexto de mantenimiento no autorizado';
 END IF;
 -- El cambio interno de estructura al iniciar un intento no es una edición del jugador.
 IF TG_TABLE_NAME='unidades' AND TG_OP='UPDATE' AND pg_trigger_depth()>1
    AND (a-'estructura_fijada')=(d-'estructura_fijada') AND d->>'estructura_fijada'='true' THEN
  RETURN NULL;
 END IF;
 IF TG_TABLE_NAME=ANY(ARRAY['unidades','niveles','actividades','generaciones_tablero','revisiones_nivel',
  'actividades_revision','terminos','nivel_terminos_borrador','revision_terminos','cartas','etapas_carta',
  'versiones_documentos_legales','finalidades','documento_finalidades','sanciones','correcciones_administrativas',
  'resoluciones_privacidad','ampliaciones_privacidad','verificaciones_identidad_privacidad','verificacion_adjuntos'])
  AND v_tipo NOT IN ('ADMINISTRADOR','MANTENIMIENTO') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Operación administrativa requerida';
 END IF;
 IF v_tipo IN ('JUGADOR','ADMINISTRADOR') THEN
  v_actor:=nullif(current_setting('criterika.actor_id',true),'')::uuid;
  IF NOT EXISTS (SELECT 1 FROM criterika.cuentas WHERE id=v_actor AND rol=v_tipo) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Actor de operación no válido';
  END IF;
 END IF;
 IF v_tipo='JUGADOR' THEN
  v_sujeto:=coalesce(nullif(r->>'jugador_id','')::uuid,nullif(r->>'cuenta_id','')::uuid);
  IF TG_TABLE_NAME='cuentas' THEN v_sujeto:=(r->>'id')::uuid; END IF;
  IF v_sujeto IS NOT NULL AND v_sujeto<>v_actor THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Recurso de otro titular';
  END IF;
 END IF;
 -- Solo una purga acreditada por rol técnico puede omitir auditado fila a fila para no recrear PII.
 -- El coordinador debe registrar cierre agregado y control de eliminación por separado.
 IF criterika.es_mantenimiento() AND current_setting('criterika.purga',true)='true' THEN RETURN NULL; END IF;
 IF v_tipo NOT IN ('ADMINISTRADOR','MANTENIMIENTO') THEN RETURN NULL; END IF;
 v_req:=coalesce(nullif(current_setting('criterika.request_id',true),'')::uuid,gen_random_uuid());
 v_motivo:=nullif(current_setting('criterika.motivo',true),'');
 v_id:=nullif(r->>'id','')::uuid;
 INSERT INTO criterika.eventos_auditoria(actor_tipo,administrador_id,accion,recurso_tipo,recurso_id,
  ocurrido_en,motivo,cambios_permitidos,request_id,resultado,expira_en)
 VALUES(v_tipo,CASE WHEN v_tipo='ADMINISTRADOR' THEN v_actor END,TG_OP,TG_TABLE_NAME,v_id,
  clock_timestamp(),v_motivo,criterika.cambios_auditables(a,d),v_req,'CONFIRMADO',clock_timestamp()+interval '179 days')
 RETURNING id INTO v_evento;
 FOREACH v_campo IN ARRAY ARRAY['jugador_id','cuenta_id','titular_cuenta_id','propietario_cuenta_id'] LOOP
  v_sujeto:=nullif(r->>v_campo,'')::uuid;
  IF v_sujeto IS NOT NULL AND EXISTS(SELECT 1 FROM criterika.cuentas WHERE id=v_sujeto) THEN
   INSERT INTO criterika.auditoria_sujetos VALUES(v_evento,v_sujeto) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 -- Resolver también titulares de recursos cuya relación pasa por otra tabla.
 SELECT coalesce(
  (SELECT jugador_id FROM criterika.intentos_nivel WHERE id=nullif(r->>'intento_id','')::uuid),
  (SELECT i.jugador_id FROM criterika.actividades_intento ai JOIN criterika.intentos_nivel i ON i.id=ai.intento_id WHERE ai.id=nullif(r->>'actividad_intento_id','')::uuid),
  (SELECT i.jugador_id FROM criterika.ejecuciones_actividad e JOIN criterika.intentos_nivel i ON i.id=e.intento_id WHERE e.id=nullif(r->>'ejecucion_id','')::uuid),
  (SELECT titular_cuenta_id FROM criterika.solicitudes_privacidad WHERE id=nullif(r->>'solicitud_id','')::uuid),
  (SELECT s.titular_cuenta_id FROM criterika.ejecuciones_privacidad e JOIN criterika.solicitudes_privacidad s ON s.id=e.solicitud_id WHERE e.id=nullif(r->>'ejecucion_id','')::uuid)
 ) INTO v_sujeto;
 IF v_sujeto IS NOT NULL THEN
  INSERT INTO criterika.auditoria_sujetos VALUES(v_evento,v_sujeto) ON CONFLICT DO NOTHING;
 END IF;
 IF TG_TABLE_NAME='cuentas' AND v_id IS NOT NULL AND TG_OP<>'DELETE' THEN
  INSERT INTO criterika.auditoria_sujetos VALUES(v_evento,v_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
