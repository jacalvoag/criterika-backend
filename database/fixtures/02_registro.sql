-- Solo pruebas locales desechables: textos ficticios, nunca documentos operativos.
BEGIN;
INSERT INTO criterika.cuentas(id,rol,correo_normalizado,correo_presentacion,contrasena_hash,nombre)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ADMINISTRADOR',
 'admin'||n||'@example.invalid','admin'||n||'@example.invalid','$argon2id$FICTICIO_NO_AUTENTICABLE','Admin ficticio'
FROM generate_series(1,3) n;
INSERT INTO criterika.finalidades(codigo,descripcion_base,necesaria) VALUES ('cuenta','Finalidad ficticia de cuenta',true);
INSERT INTO criterika.versiones_documentos_legales
 (id,tipo,etiqueta_version,contenido_markdown,tipo_cambio,requiere_aceptacion)
VALUES ('00000000-0000-4000-8000-000000000101','TERMINOS','prueba-1','Términos ficticios de pruebas.','CONTRACTUAL',true),
 ('00000000-0000-4000-8000-000000000102','AVISO_PRIVACIDAD','prueba-1','Aviso ficticio de pruebas.','CONTRACTUAL',true);
INSERT INTO criterika.documento_finalidades(documento_version_id,finalidad_codigo,descripcion_presentada)
 VALUES ('00000000-0000-4000-8000-000000000102','cuenta','Finalidad ficticia presentada.');
UPDATE criterika.versiones_documentos_legales SET sha256=sha256(convert_to(contenido_markdown,'UTF8')),
 publicada_en='2026-11-23T00:00:00Z',es_vigente=true;
COMMIT;
