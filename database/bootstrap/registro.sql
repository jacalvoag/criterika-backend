CREATE SCHEMA IF NOT EXISTS control_sql;
REVOKE ALL ON SCHEMA control_sql FROM PUBLIC;
CREATE TABLE IF NOT EXISTS control_sql.migraciones (
 version text PRIMARY KEY,
 descripcion text NOT NULL,
 checksum text NOT NULL CHECK(length(checksum)=64),
 aplicada_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
