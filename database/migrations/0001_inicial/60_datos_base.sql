-- Criterika · migración 0001 · 60_datos_base.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.


-- Solo catálogo técnico fijo. No crea usuarios, documentos legales ficticios ni credenciales.
INSERT INTO criterika.estados_tareas(nombre,estado,pendientes)
VALUES ('INTENTOS','PENDIENTE',0),('DEPURACION','PENDIENTE',0),('INCONSISTENCIAS','PENDIENTE',0),
 ('INACTIVIDAD','PENDIENTE',0),('ELIMINACIONES','PENDIENTE',0);
