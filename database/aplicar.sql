\set ON_ERROR_STOP on
-- Ejecutar con aplicar.py: verifica contenido de cada SQL antes de invocar psql.
SELECT pg_advisory_lock(763151,1000);
\ir bootstrap/registro.sql
SELECT NOT EXISTS(SELECT 1 FROM control_sql.migraciones WHERE version='0001') AS pendiente \gset
\if :pendiente
BEGIN;
\ir migrations/0001_inicial/00_esquemas_roles.sql
\ir migrations/0001_inicial/10_tablas_cuentas.sql
\ir migrations/0001_inicial/11a_tablas_aprendizaje.sql
\ir migrations/0001_inicial/11b_tablas_cartas_diccionario_archivos.sql
\ir migrations/0001_inicial/12_tablas_participacion.sql
\ir migrations/0001_inicial/13_tablas_economia.sql
\ir migrations/0001_inicial/14a_tablas_aceptaciones.sql
\ir migrations/0001_inicial/14b_tablas_derechos_privacidad.sql
\ir migrations/0001_inicial/14c_tablas_moderacion_auditoria.sql
\ir migrations/0001_inicial/15_tablas_soportes.sql
\ir migrations/0001_inicial/20_claves_y_relaciones.sql
\ir migrations/0001_inicial/21_restricciones.sql
\ir migrations/0001_inicial/22_indices.sql
\ir migrations/0001_inicial/30_funciones_contexto_auditoria.sql
\ir migrations/0001_inicial/31_funciones_proteccion.sql
\ir migrations/0001_inicial/32_funciones_integridad_diferida.sql
\ir migrations/0001_inicial/40_triggers.sql
\ir migrations/0001_inicial/50_permisos.sql
\ir migrations/0001_inicial/60_datos_base.sql
INSERT INTO control_sql.migraciones(version,descripcion,checksum) VALUES ('0001','Base inicial modular', :'huella');
COMMIT;
\else
SELECT checksum = :'huella' AS coincide FROM control_sql.migraciones WHERE version='0001' \gset
\if :coincide
\echo Migracion 0001 ya aplicada; sin cambios.
\else
DO $$ BEGIN RAISE EXCEPTION 'Migracion aplicada modificada: agregar otra version'; END $$;
\endif
\endif
SELECT pg_advisory_unlock(763151,1000);
