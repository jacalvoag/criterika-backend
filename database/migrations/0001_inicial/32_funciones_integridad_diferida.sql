-- Criterika · migración 0001 · 32_funciones_integridad_diferida.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.


CREATE FUNCTION criterika.validar_revision_completa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
DECLARE v_id uuid; v_total integer; v_fila jsonb;
BEGIN
 v_fila:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 v_id:=(v_fila->>CASE WHEN TG_TABLE_NAME='revisiones_nivel' THEN 'id' ELSE 'revision_id' END)::uuid;
 IF NOT EXISTS(SELECT 1 FROM criterika.revisiones_nivel WHERE id=v_id) THEN RETURN NULL; END IF;
 SELECT count(*) INTO v_total FROM criterika.actividades_revision WHERE revision_id=v_id;
 IF v_total NOT BETWEEN 3 AND 6 OR EXISTS(SELECT 1 FROM criterika.actividades_revision WHERE revision_id=v_id GROUP BY tipo HAVING count(*)>2) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Revisión requiere 3 a 6 actividades y máximo dos por tipo';
 END IF;
 IF EXISTS(SELECT 1 FROM criterika.actividades_revision WHERE revision_id=v_id
  AND ((contenido->>'tipo') IS DISTINCT FROM tipo OR (criterio->>'tipo') IS DISTINCT FROM tipo)) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Contenido y criterio deben corresponder al tipo';
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION criterika.validar_aprobacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM criterika.intentos_nivel WHERE id=NEW.intento_origen_id AND estado='APROBADO') THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Aprobación requiere intento aprobado';
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION criterika.validar_origen_gemas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,criterika,pg_temp AS $$
DECLARE v_origen text; v_id uuid; v_esperado bigint; v_cantidad bigint; v_conteo integer; v_tipo text; v_fila jsonb;
BEGIN
 v_fila:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='movimientos_gemas' THEN
  IF v_fila->>'aprobacion_id' IS NOT NULL THEN v_origen:='aprobaciones_nivel';v_id:=(v_fila->>'aprobacion_id')::uuid;
  ELSIF v_fila->>'compra_vidas_id' IS NOT NULL THEN v_origen:='compras_vidas';v_id:=(v_fila->>'compra_vidas_id')::uuid;
  ELSIF v_fila->>'evolucion_obtenida_id' IS NOT NULL THEN v_origen:='evoluciones_obtenidas';v_id:=(v_fila->>'evolucion_obtenida_id')::uuid;
  ELSE v_origen:='correcciones_administrativas';v_id:=(v_fila->>'correccion_id')::uuid; END IF;
 ELSE
  v_origen:=TG_TABLE_NAME;v_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 END IF;
 IF v_origen='aprobaciones_nivel' THEN
  SELECT gemas_otorgadas INTO v_esperado FROM criterika.aprobaciones_nivel WHERE id=v_id;
  SELECT count(*),sum(cantidad) INTO v_conteo,v_cantidad FROM criterika.movimientos_gemas WHERE aprobacion_id=v_id;
 ELSIF v_origen='compras_vidas' THEN
  SELECT -gemas_gastadas INTO v_esperado FROM criterika.compras_vidas WHERE id=v_id;
  SELECT count(*),sum(cantidad) INTO v_conteo,v_cantidad FROM criterika.movimientos_gemas WHERE compra_vidas_id=v_id;
 ELSIF v_origen='evoluciones_obtenidas' THEN
  SELECT -gemas_gastadas INTO v_esperado FROM criterika.evoluciones_obtenidas WHERE id=v_id;
  SELECT count(*),sum(cantidad) INTO v_conteo,v_cantidad FROM criterika.movimientos_gemas WHERE evolucion_obtenida_id=v_id;
 ELSE
  SELECT CASE WHEN tipo='GEMAS' THEN cantidad ELSE 0 END,tipo INTO v_esperado,v_tipo FROM criterika.correcciones_administrativas WHERE id=v_id;
  SELECT count(*),sum(cantidad) INTO v_conteo,v_cantidad FROM criterika.movimientos_gemas WHERE correccion_id=v_id;
 END IF;
 IF v_esperado IS NULL THEN RETURN NULL; END IF;
 IF (v_esperado=0 AND v_conteo<>0) OR (v_esperado<>0 AND (v_conteo<>1 OR v_cantidad IS DISTINCT FROM v_esperado)) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Operación económica requiere su movimiento exacto en la misma transacción';
 END IF;
 RETURN NULL;
END $$;
