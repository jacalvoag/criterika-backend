-- Criterika · migración 0001 · 31_funciones_proteccion.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.


CREATE FUNCTION criterika.proteger_historico() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
DECLARE v_revision uuid; v_xid xid8; v_publicada timestamptz;
BEGIN
 IF criterika.es_mantenimiento() THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('actividades_revision','revision_terminos') THEN
  IF TG_OP='INSERT' THEN
   SELECT transaccion_creacion INTO v_xid FROM criterika.revisiones_nivel WHERE id=NEW.revision_id;
   IF v_xid IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Revisión publicada inmutable';
   END IF;
   RETURN NEW;
  END IF;
 ELSIF TG_TABLE_NAME='versiones_documentos_legales' AND TG_OP='UPDATE' THEN
  IF OLD.publicada_en IS NULL THEN RETURN NEW; END IF;
  IF (to_jsonb(OLD)-'es_vigente'-'version_recurso')=(to_jsonb(NEW)-'es_vigente'-'version_recurso') THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='documento_finalidades' THEN
  v_revision:=CASE WHEN TG_OP='DELETE' THEN OLD.documento_version_id ELSE NEW.documento_version_id END;
  SELECT publicada_en INTO v_publicada FROM criterika.versiones_documentos_legales WHERE id=v_revision;
  IF v_publicada IS NULL THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
 ELSIF TG_OP='INSERT' THEN RETURN NEW;
 END IF;
 RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Historial protegido: usar nueva operación o mantenimiento autorizado';
END $$;

CREATE FUNCTION criterika.proteger_cuenta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.rol<>OLD.rol THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='El rol de una cuenta es inmutable';
 END IF;
 IF TG_OP='INSERT' AND NEW.rol='ADMINISTRADOR' THEN
  IF NOT criterika.es_mantenimiento() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Aprovisionamiento administrativo requerido'; END IF;
  PERFORM pg_advisory_xact_lock(763151,3);
  IF (SELECT count(*) FROM criterika.cuentas WHERE rol='ADMINISTRADOR')>=3 THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Solo tres administradores predefinidos';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION criterika.validar_rol_jugador() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM criterika.cuentas WHERE id=NEW.cuenta_id AND rol='JUGADOR') THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='El estado de juego requiere cuenta de jugador';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION criterika.proteger_estructura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
DECLARE v_unidad uuid; v_fijada boolean;
BEGIN
 IF TG_TABLE_NAME='unidades' THEN
  IF TG_OP='UPDATE' AND OLD.estructura_fijada AND (NOT NEW.estructura_fijada OR NEW.orden<>OLD.orden) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Estructura de unidad fijada';
  END IF;
  IF TG_OP='DELETE' AND OLD.estructura_fijada THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Unidad utilizada no eliminable'; END IF;
 ELSE
  v_unidad:=CASE WHEN TG_OP='DELETE' THEN OLD.unidad_id ELSE NEW.unidad_id END;
  SELECT estructura_fijada INTO v_fijada FROM criterika.unidades WHERE id=v_unidad FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.unidad_id<>NEW.unidad_id THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='No trasladar contenido entre unidades';
  END IF;
  IF v_fijada AND (TG_OP IN ('INSERT','DELETE') OR
     (TG_TABLE_NAME='niveles' AND (to_jsonb(NEW)->>'orden' IS DISTINCT FROM to_jsonb(OLD)->>'orden' OR to_jsonb(NEW)->>'tipo' IS DISTINCT FROM to_jsonb(OLD)->>'tipo'))) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Estructura de unidad fijada';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE FUNCTION criterika.fijar_estructura_por_intento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
BEGIN
 UPDATE criterika.unidades SET estructura_fijada=true
 WHERE id=(SELECT unidad_id FROM criterika.niveles WHERE id=NEW.nivel_id) AND NOT estructura_fijada;
 RETURN NULL;
END $$;

CREATE FUNCTION criterika.proteger_resultado_terminal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
BEGIN
 IF OLD.estado<>'EN_CURSO' AND to_jsonb(NEW)<>to_jsonb(OLD) AND NOT criterika.es_mantenimiento() THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Resultado terminal no modificable';
 END IF;
 RETURN NEW;
END $$;
