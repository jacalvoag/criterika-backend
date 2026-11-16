-- Criterika · migración 0001 · 50_permisos.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.


REVOKE ALL ON ALL TABLES IN SCHEMA criterika FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA criterika FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA criterika FROM PUBLIC;
GRANT USAGE ON SCHEMA criterika TO criterika_app,criterika_maintenance;
GRANT SELECT ON ALL TABLES IN SCHEMA criterika TO criterika_app,criterika_maintenance;
GRANT INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA criterika TO criterika_app,criterika_maintenance;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON criterika.eventos_auditoria,criterika.auditoria_sujetos,
 criterika.controles_eliminacion FROM criterika_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA criterika TO criterika_app,criterika_maintenance;
GRANT EXECUTE ON FUNCTION criterika.establecer_contexto(text,uuid,uuid,text) TO criterika_app,criterika_maintenance;
-- No hay contraseñas ni usuarios LOGIN aquí. El operador crea logins fuera de estas migraciones,
-- concede SOLO el grupo apropiado y configura TLS/almacenamiento cifrado en el entorno real.
-- Las funciones de trigger SECURITY DEFINER usan search_path cerrado y no se conceden directamente.
