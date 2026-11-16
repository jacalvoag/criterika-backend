-- Criterika · migración 0001 · 00_esquemas_roles.sql
-- PostgreSQL 18; ejecutar mediante aplicar.py / aplicar.sql.


DO $roles$
BEGIN
 IF current_setting('server_version_num')::integer < 180000 THEN
  RAISE EXCEPTION 'Criterika requiere PostgreSQL 18 o superior';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='criterika_owner') THEN
  CREATE ROLE criterika_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='criterika_app') THEN
  CREATE ROLE criterika_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='criterika_maintenance') THEN
  CREATE ROLE criterika_maintenance NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('criterika_owner','criterika_app','criterika_maintenance')
            AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Los roles de grupo existentes no cumplen atributos mínimos';
 END IF;
 EXECUTE format('GRANT criterika_owner TO %I',session_user);
END $roles$;
CREATE SCHEMA criterika AUTHORIZATION criterika_owner;
ALTER SCHEMA control_sql OWNER TO criterika_owner;
ALTER TABLE control_sql.migraciones OWNER TO criterika_owner;
SET LOCAL ROLE criterika_owner;
REVOKE ALL ON SCHEMA criterika FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA criterika REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
