-- SOLO PARA BD DE PRUEBA VACÍA. No forma parte de aplicar.sql.
-- Identidades ficticias y hashes deliberadamente no autenticables.
BEGIN;
SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,'00000000-0000-4000-8000-000000000999','Preparar datos ficticios para pruebas de integridad.');

INSERT INTO criterika.cuentas(id,rol,correo_normalizado,correo_presentacion,contrasena_hash,nombre,apellidos,fecha_nacimiento)
VALUES
('00000000-0000-4000-8000-000000000001','ADMINISTRADOR','admin1@example.invalid','admin1@example.invalid','$argon2id$PRUEBA_NO_AUTENTICABLE','Admin de prueba 1',NULL,NULL),
('00000000-0000-4000-8000-000000000002','ADMINISTRADOR','admin2@example.invalid','admin2@example.invalid','$argon2id$PRUEBA_NO_AUTENTICABLE','Admin de prueba 2',NULL,NULL),
('00000000-0000-4000-8000-000000000003','ADMINISTRADOR','admin3@example.invalid','admin3@example.invalid','$argon2id$PRUEBA_NO_AUTENTICABLE','Admin de prueba 3',NULL,NULL),
('00000000-0000-4000-8000-000000000010','JUGADOR','jugador1@example.invalid','jugador1@example.invalid','$argon2id$PRUEBA_NO_AUTENTICABLE','Jugador de prueba 1','Ejemplo','2000-01-01'),
('00000000-0000-4000-8000-000000000011','JUGADOR','jugador2@example.invalid','jugador2@example.invalid','$argon2id$PRUEBA_NO_AUTENTICABLE','Jugador de prueba 2','Ejemplo','2000-01-01');
INSERT INTO criterika.estados_jugador(cuenta_id) VALUES
('00000000-0000-4000-8000-000000000010'),('00000000-0000-4000-8000-000000000011');

INSERT INTO criterika.unidades(id,nombre,descripcion,orden)
VALUES('00000000-0000-4000-8000-000000000100','Unidad ficticia','Contenido para probar relaciones SQL, no catálogo para publicar.',1);
INSERT INTO criterika.niveles(id,unidad_id,orden,tipo,nombre_borrador)
VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000100',1,'NORMAL','Nivel ficticio');
INSERT INTO criterika.actividades(id,nivel_id,posicion_borrador,tipo_borrador,instrucciones_borrador,contenido_borrador,criterio_borrador)
VALUES
('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101',1,'MEMORAMA','Encuentra las parejas.',
'{"tipo":"MEMORAMA","parejas":[{"id":"00000000-0000-4000-8000-000000000701","izquierda":"Confidencialidad","derecha":"Acceso autorizado"},{"id":"00000000-0000-4000-8000-000000000702","izquierda":"Integridad","derecha":"Sin alteraciones no autorizadas"}]}',
'{"tipo":"MEMORAMA","erroresPorPareja":2}'),
('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101',2,'PREGUNTAS','Confirma una respuesta.',
'{"tipo":"PREGUNTAS","preguntas":[{"id":"00000000-0000-4000-8000-000000000710","enunciado":"¿Qué protege la confidencialidad?","opciones":[{"id":"00000000-0000-4000-8000-000000000711","texto":"Limitar el acceso"},{"id":"00000000-0000-4000-8000-000000000712","texto":"Compartir credenciales"}],"opcionCorrectaId":"00000000-0000-4000-8000-000000000711","explicacion":"El acceso se limita a personas autorizadas.","pista":null}]}',
'{"tipo":"PREGUNTAS","porcentajeMinimo":80}'),
('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000101',3,'RELACIONAR','Relaciona los conceptos.',
'{"tipo":"RELACIONAR","parejas":[{"id":"00000000-0000-4000-8000-000000000720","izquierda":"Respeto","derecha":"Considerar derechos ajenos"},{"id":"00000000-0000-4000-8000-000000000721","izquierda":"Honestidad","derecha":"Informar con veracidad"}]}',
'{"tipo":"RELACIONAR","erroresPermitidos":3}');
INSERT INTO criterika.revisiones_nivel(id,nivel_id,numero,nombre_publicado)
VALUES('00000000-0000-4000-8000-000000000300','00000000-0000-4000-8000-000000000101',1,'Nivel ficticio');
INSERT INTO criterika.actividades_revision(revision_id,actividad_id,nivel_id,posicion,tipo,instrucciones,contenido,criterio)
SELECT '00000000-0000-4000-8000-000000000300',id,nivel_id,posicion_borrador,tipo_borrador,instrucciones_borrador,contenido_borrador,criterio_borrador
FROM criterika.actividades;
UPDATE criterika.niveles SET revision_publicada_id='00000000-0000-4000-8000-000000000300'
WHERE id='00000000-0000-4000-8000-000000000101';

-- Historial ficticio de un intento aprobado; no simula ni prueba el evaluador de minijuegos.
INSERT INTO criterika.intentos_nivel(id,jugador_id,nivel_id,revision_id,estado,motivo_finalizacion,finalizado_en,zona_horaria,gemas_previstas,xp_prevista)
VALUES('00000000-0000-4000-8000-000000000400','00000000-0000-4000-8000-000000000010',
'00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000300','APROBADO','TODAS_SUPERADAS',transaction_timestamp(),'America/Mexico_City',150,100);
INSERT INTO criterika.actividades_intento(intento_id,revision_id,actividad_id,posicion_inicial,estado)
SELECT '00000000-0000-4000-8000-000000000400',revision_id,actividad_id,posicion,'SUPERADA'
FROM criterika.actividades_revision;
INSERT INTO criterika.ejecuciones_actividad(actividad_intento_id,intento_id,numero,estado,estado_juego,finalizada_en)
SELECT id,intento_id,1,'SUPERADA','{}',transaction_timestamp() FROM criterika.actividades_intento;
COMMIT;
