-- Criterika · migración 0001 · 40_triggers.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.

CREATE TRIGGER "a_cuenta_protegida" BEFORE INSERT OR UPDATE ON criterika."cuentas" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_cuenta();

CREATE TRIGGER "a_rol_jugador" BEFORE INSERT OR UPDATE ON criterika."estados_jugador" FOR EACH ROW EXECUTE FUNCTION criterika.validar_rol_jugador();

CREATE TRIGGER "a_estructura" BEFORE INSERT OR UPDATE OR DELETE ON criterika."unidades" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_estructura();

CREATE TRIGGER "a_estructura" BEFORE INSERT OR UPDATE OR DELETE ON criterika."niveles" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_estructura();

CREATE TRIGGER "a_estructura" BEFORE INSERT OR UPDATE OR DELETE ON criterika."cartas" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_estructura();

CREATE TRIGGER "a_resultado_terminal" BEFORE UPDATE ON criterika."intentos_nivel" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_resultado_terminal();

CREATE TRIGGER "b_fijar_estructura" AFTER INSERT ON criterika."intentos_nivel" FOR EACH ROW EXECUTE FUNCTION criterika.fijar_estructura_por_intento();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."revisiones_nivel" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE INSERT OR UPDATE OR DELETE ON criterika."actividades_revision" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE INSERT OR UPDATE OR DELETE ON criterika."revision_terminos" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."interacciones_evaluadas" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."aprobaciones_nivel" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."compras_vidas" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."cartas_obtenidas" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."evoluciones_obtenidas" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."terminos_desbloqueados" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."correcciones_administrativas" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."movimientos_gemas" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."aceptaciones_legales" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."aceptacion_finalidades" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_historico" BEFORE UPDATE OR DELETE ON criterika."resoluciones_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_legal_publicado" BEFORE UPDATE OR DELETE ON criterika."versiones_documentos_legales" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE TRIGGER "a_finalidades_publicadas" BEFORE INSERT OR UPDATE OR DELETE ON criterika."documento_finalidades" FOR EACH ROW EXECUTE FUNCTION criterika.proteger_historico();

CREATE CONSTRAINT TRIGGER "c_revision_completa" AFTER INSERT OR UPDATE OR DELETE ON criterika."revisiones_nivel" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION criterika.validar_revision_completa();

CREATE CONSTRAINT TRIGGER "c_revision_completa" AFTER INSERT OR UPDATE OR DELETE ON criterika."actividades_revision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION criterika.validar_revision_completa();

CREATE CONSTRAINT TRIGGER "c_aprobacion_valida" AFTER INSERT OR UPDATE ON criterika."aprobaciones_nivel" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION criterika.validar_aprobacion();

CREATE CONSTRAINT TRIGGER "d_origen_economico" AFTER INSERT OR UPDATE OR DELETE ON criterika."aprobaciones_nivel" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION criterika.validar_origen_gemas();

CREATE CONSTRAINT TRIGGER "d_origen_economico" AFTER INSERT OR UPDATE OR DELETE ON criterika."compras_vidas" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION criterika.validar_origen_gemas();

CREATE CONSTRAINT TRIGGER "d_origen_economico" AFTER INSERT OR UPDATE OR DELETE ON criterika."evoluciones_obtenidas" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION criterika.validar_origen_gemas();

CREATE CONSTRAINT TRIGGER "d_origen_economico" AFTER INSERT OR UPDATE OR DELETE ON criterika."correcciones_administrativas" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION criterika.validar_origen_gemas();

CREATE CONSTRAINT TRIGGER "d_origen_economico" AFTER INSERT OR UPDATE OR DELETE ON criterika."movimientos_gemas" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION criterika.validar_origen_gemas();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."cuentas" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."estados_jugador" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."archivos" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."unidades" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."niveles" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."actividades" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."generaciones_tablero" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."revisiones_nivel" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."actividades_revision" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."terminos" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."nivel_terminos_borrador" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."revision_terminos" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."cartas" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."etapas_carta" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."intentos_nivel" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."terminos_intento" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."actividades_intento" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."ejecuciones_actividad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."interacciones_evaluadas" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."aprobaciones_nivel" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."compras_vidas" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."cartas_obtenidas" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."evoluciones_obtenidas" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."terminos_desbloqueados" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."correcciones_administrativas" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."movimientos_gemas" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."versiones_documentos_legales" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."finalidades" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."documento_finalidades" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."aceptaciones_legales" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."aceptacion_finalidades" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."solicitudes_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."solicitud_finalidades" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."adjuntos_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."comunicaciones_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."verificaciones_identidad_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."resoluciones_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."ampliaciones_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."ejecuciones_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."pasos_ejecucion_privacidad" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."restricciones_tratamiento" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."sanciones" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."casos_revision" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."controles_eliminacion" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."resolucion_finalidades" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();

CREATE TRIGGER "z_auditoria" AFTER INSERT OR UPDATE OR DELETE ON criterika."verificacion_adjuntos" FOR EACH ROW EXECUTE FUNCTION criterika.auditar_cambio();
