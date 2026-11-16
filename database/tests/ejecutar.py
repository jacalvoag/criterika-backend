"""Pruebas PostgreSQL reales sobre una BD nueva cuyo nombre empiece por criterika_prueba_."""
from pathlib import Path
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
import os,sys,subprocess,json,uuid,unittest,threading,tempfile,shutil,hashlib
import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

ROOT=Path(__file__).resolve().parents[1]
def uid(n):return uuid.UUID(f'00000000-0000-4000-8000-{n:012d}')
ADMIN=uid(1);PLAYER=uid(10);OTHER=uid(11);UNIT=uid(100);LEVEL=uid(101);REV=uid(300);ATTEMPT=uid(400)
def connect(**kw):return psycopg.connect(**kw)
def context(c,kind='MANTENIMIENTO',actor=None):
 c.execute('SELECT criterika.establecer_contexto(%s,%s,%s,%s)',(kind,actor,uuid.uuid4(),'Prueba automatizada de integridad y concurrencia.'))
@contextmanager
def sandbox(kind='MANTENIMIENTO',actor=None,app=False):
 c=connect()
 try:
  if app:c.execute('SET LOCAL ROLE criterika_app')
  context(c,kind,actor)
  yield c
 finally:c.rollback();c.close()
def new_attempt(c,player=PLAYER,approved=False):
 ident=uuid.uuid4()
 c.execute('''INSERT INTO criterika.intentos_nivel(id,jugador_id,nivel_id,revision_id,estado,
 motivo_finalizacion,finalizado_en,zona_horaria,gemas_previstas,xp_prevista)
 VALUES(%s,%s,%s,%s,%s,%s,%s,'America/Mexico_City',150,100)''',
 (ident,player,LEVEL,REV,'APROBADO' if approved else 'EN_CURSO','TODAS_SUPERADAS' if approved else None,
  c.execute('SELECT transaction_timestamp()').fetchone()[0] if approved else None))
 return ident
def credit(c,player,amount):
 correction=uuid.uuid4();old=c.execute('SELECT gemas_saldo FROM criterika.estados_jugador WHERE cuenta_id=%s FOR UPDATE',(player,)).fetchone()[0]
 c.execute("INSERT INTO criterika.correcciones_administrativas(id,jugador_id,tipo,cantidad,motivo) VALUES(%s,%s,'GEMAS',%s,'Saldo ficticio para prueba de transacción.')",(correction,player,amount))
 c.execute("INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,correccion_id) VALUES(%s,'AJUSTE_ADMIN',%s,%s,%s)",(player,amount,old+amount,correction))
 c.execute('UPDATE criterika.estados_jugador SET gemas_saldo=%s WHERE cuenta_id=%s',(old+amount,player))
def create_player(balance=0,lives=5):
 ident=uuid.uuid4();email=f'{ident}@example.invalid'
 with connect() as c:
  context(c)
  c.execute("INSERT INTO criterika.cuentas(id,rol,correo_normalizado,correo_presentacion,contrasena_hash,nombre,apellidos,fecha_nacimiento) VALUES(%s,'JUGADOR',%s,%s,'$argon2id$PRUEBA_NO_AUTENTICABLE','Persona ficticia','Ejemplo','2000-01-01')",(ident,email,email))
  c.execute("INSERT INTO criterika.estados_jugador(cuenta_id,vidas_totales,proxima_regeneracion_en) VALUES(%s,%s,CASE WHEN %s<5 THEN now()+interval '1 hour' END)",(ident,lives,lives))
  if balance:credit(c,ident,balance)
 return ident

class DatabaseTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  with connect(autocommit=True) as c:
   db=c.execute('SELECT current_database()').fetchone()[0]
   if not db.startswith('criterika_prueba_'):raise RuntimeError('Se requiere una BD nueva criterika_prueba_*')
   if c.execute('SELECT count(*) FROM criterika.cuentas').fetchone()[0]:raise RuntimeError('Las pruebas requieren datos vacíos; no se modifica una BD existente')
   c.execute((ROOT/'fixtures/00_datos_prueba.sql').read_text())

 def test_01_tablas(self):
  with sandbox() as c:self.assertEqual(c.execute("SELECT count(*) FROM pg_tables WHERE schemaname='criterika'").fetchone()[0],53)
 def test_02_relaciones(self):
  with sandbox() as c:self.assertEqual(c.execute("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON c.connamespace=n.oid WHERE n.nspname='criterika' AND contype='f'").fetchone()[0],88)
 def test_03_datos_tecnicos(self):
  with sandbox() as c:self.assertEqual(c.execute('SELECT count(*) FROM criterika.estados_tareas').fetchone()[0],5)
 def test_04_reaplicar(self):
  result=subprocess.run([sys.executable,ROOT/'aplicar.py'],text=True,capture_output=True)
  self.assertEqual(result.returncode,0,result.stderr)
  with sandbox() as c:self.assertEqual(c.execute('SELECT count(*) FROM control_sql.migraciones').fetchone()[0],1)
 def test_05_integridad_archivos(self):
  with tempfile.TemporaryDirectory() as temp:
   dest=Path(temp)/'paquete';shutil.copytree(ROOT,dest,ignore=shutil.ignore_patterns('resultados.json','informe_pruebas.md'))
   p=dest/'migrations/0001_inicial/60_datos_base.sql';p.write_text(p.read_text()+'\n-- cambio indebido\n')
   result=subprocess.run([sys.executable,dest/'aplicar.py'],text=True,capture_output=True)
   self.assertNotEqual(result.returncode,0);self.assertIn('Integridad inválida',result.stderr)
 def test_06_saldo_negativo(self):
  with sandbox() as c:
   with self.assertRaises(psycopg.errors.CheckViolation):
    c.execute('UPDATE criterika.estados_jugador SET gemas_saldo=-1 WHERE cuenta_id=%s',(PLAYER,))
 def test_07_vidas_seis(self):
  with sandbox() as c:
   with self.assertRaises(psycopg.errors.CheckViolation):c.execute('UPDATE criterika.estados_jugador SET vidas_totales=6 WHERE cuenta_id=%s',(PLAYER,))
 def test_08_vidas_sin_reloj(self):
  with sandbox() as c:
   with self.assertRaises(psycopg.errors.CheckViolation):c.execute('UPDATE criterika.estados_jugador SET vidas_totales=4,proxima_regeneracion_en=NULL WHERE cuenta_id=%s',(PLAYER,))
 def test_09_cuarto_admin(self):
  with sandbox() as c:
   with self.assertRaises(psycopg.errors.CheckViolation):
    c.execute("INSERT INTO criterika.cuentas(rol,correo_normalizado,correo_presentacion,contrasena_hash,nombre) VALUES('ADMINISTRADOR','cuarto@example.invalid','cuarto@example.invalid','$argon2id$PRUEBA_NO_AUTENTICABLE','Cuarto ficticio')")
 def test_10_rol_inmutable(self):
  with sandbox() as c:
   with self.assertRaises(psycopg.errors.ObjectNotInPrerequisiteState):c.execute("UPDATE criterika.cuentas SET rol='ADMINISTRADOR' WHERE id=%s",(PLAYER,))
 def test_11_admin_sin_juego(self):
  with sandbox() as c:
   with self.assertRaises(psycopg.errors.CheckViolation):c.execute('INSERT INTO criterika.estados_jugador(cuenta_id) VALUES(%s)',(ADMIN,))
 def test_12_escritura_otro_titular(self):
  with sandbox('JUGADOR',PLAYER,True) as c:
   with self.assertRaises(psycopg.errors.InsufficientPrivilege):c.execute("UPDATE criterika.cuentas SET nombre='Nombre ajeno' WHERE id=%s",(OTHER,))
 def test_13_un_intento_activo(self):
  with sandbox() as c:
   new_attempt(c)
   with self.assertRaises(psycopg.errors.UniqueViolation):new_attempt(c)
 def test_14_cuarta_ejecucion(self):
  with sandbox() as c:
   activity=c.execute('SELECT id FROM criterika.actividades_intento WHERE intento_id=%s LIMIT 1',(ATTEMPT,)).fetchone()[0]
   with self.assertRaises(psycopg.errors.CheckViolation):
    c.execute("INSERT INTO criterika.ejecuciones_actividad(actividad_intento_id,intento_id,numero,estado,estado_juego) VALUES(%s,%s,4,'EN_CURSO','{}')",(activity,ATTEMPT))
 def test_15_aprobacion_otro_jugador(self):
  with sandbox() as c:
   with self.assertRaises(psycopg.errors.ForeignKeyViolation):
    c.execute('INSERT INTO criterika.aprobaciones_nivel(jugador_id,nivel_id,intento_origen_id,gemas_otorgadas,xp_otorgada) VALUES(%s,%s,%s,150,100)',(OTHER,LEVEL,ATTEMPT))
 def test_16_posicion_de_revision(self):
  with sandbox() as c:
   attempt=new_attempt(c)
   with self.assertRaises(psycopg.errors.ForeignKeyViolation):
    c.execute("INSERT INTO criterika.actividades_intento(intento_id,revision_id,actividad_id,posicion_inicial,estado,orden_pendiente) VALUES(%s,%s,%s,2,'PENDIENTE',1)",(attempt,REV,uid(201)))
 def test_17_movimiento_faltante(self):
  with sandbox() as c:
   c.execute("INSERT INTO criterika.compras_vidas(jugador_id,paquete,vidas_entregadas,gemas_gastadas) VALUES(%s,'VIDA_1',1,100)",(PLAYER,))
   with self.assertRaises(psycopg.errors.CheckViolation):c.execute('SET CONSTRAINTS ALL IMMEDIATE')
 def test_18_movimiento_importe_erroneo(self):
  with sandbox() as c:
   purchase=c.execute("INSERT INTO criterika.compras_vidas(jugador_id,paquete,vidas_entregadas,gemas_gastadas) VALUES(%s,'VIDA_1',1,100) RETURNING id",(PLAYER,)).fetchone()[0]
   c.execute("INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,compra_vidas_id) VALUES(%s,'COMPRA_VIDAS',-99,0,%s)",(PLAYER,purchase))
   with self.assertRaises(psycopg.errors.CheckViolation):c.execute('SET CONSTRAINTS ALL IMMEDIATE')
 def test_19_movimiento_otro_propietario(self):
  with sandbox() as c:
   purchase=c.execute("INSERT INTO criterika.compras_vidas(jugador_id,paquete,vidas_entregadas,gemas_gastadas) VALUES(%s,'VIDA_1',1,100) RETURNING id",(PLAYER,)).fetchone()[0]
   with self.assertRaises(psycopg.errors.ForeignKeyViolation):
    c.execute("INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,compra_vidas_id) VALUES(%s,'COMPRA_VIDAS',-100,0,%s)",(OTHER,purchase))
 def test_20_auditoria_automatica(self):
  with sandbox('ADMINISTRADOR',ADMIN,True) as c:
   before=c.execute('SELECT count(*) FROM criterika.eventos_auditoria').fetchone()[0]
   c.execute("UPDATE criterika.unidades SET nombre='Nombre privado no debe copiarse' WHERE id=%s",(UNIT,))
   self.assertEqual(c.execute('SELECT count(*) FROM criterika.eventos_auditoria').fetchone()[0],before+1)
   row=c.execute("SELECT administrador_id,cambios_permitidos FROM criterika.eventos_auditoria WHERE recurso_id=%s ORDER BY ocurrido_en DESC LIMIT 1",(UNIT,)).fetchone()
   self.assertEqual(row[0],ADMIN);self.assertNotIn('Nombre privado',json.dumps(row[1]));self.assertIn('nombre',json.dumps(row[1]))
 def test_21_bitacora_no_editable(self):
  with sandbox('ADMINISTRADOR',ADMIN,True) as c:
   with self.assertRaises(psycopg.errors.InsufficientPrivilege):c.execute('DELETE FROM criterika.eventos_auditoria')
 def test_22_contexto_mantenimiento_falso(self):
  with sandbox('ADMINISTRADOR',ADMIN,True) as c:
   with self.assertRaises(psycopg.errors.InsufficientPrivilege):
    c.execute("SELECT criterika.establecer_contexto('MANTENIMIENTO',NULL,%s,NULL)",(uuid.uuid4(),))
 def test_23_estructura_fijada(self):
  with sandbox('ADMINISTRADOR',ADMIN,True) as c:
   with self.assertRaises(psycopg.errors.ObjectNotInPrerequisiteState):c.execute('UPDATE criterika.unidades SET orden=99 WHERE id=%s',(UNIT,))
 def test_24_terminal_inmutable(self):
  with sandbox('ADMINISTRADOR',ADMIN,True) as c:
   with self.assertRaises(psycopg.errors.ObjectNotInPrerequisiteState):c.execute("UPDATE criterika.intentos_nivel SET estado='FALLIDO',motivo_finalizacion='TERCER_FALLO' WHERE id=%s",(ATTEMPT,))
 def test_25_revision_inmutable(self):
  with sandbox('ADMINISTRADOR',ADMIN,True) as c:
   with self.assertRaises(psycopg.errors.ObjectNotInPrerequisiteState):c.execute("UPDATE criterika.revisiones_nivel SET nombre_publicado='Cambio' WHERE id=%s",(REV,))
 def test_26_revision_incompleta(self):
  with sandbox() as c:
   c.execute("INSERT INTO criterika.revisiones_nivel(nivel_id,numero,nombre_publicado) VALUES(%s,2,'Incompleta')",(LEVEL,))
   with self.assertRaises(psycopg.errors.CheckViolation):c.execute('SET CONSTRAINTS ALL IMMEDIATE')
 def test_27_avatar_ajeno(self):
  with sandbox() as c:
   media=c.execute("INSERT INTO criterika.archivos(clave_objeto,uso,propietario_cuenta_id,tipo_contenido,bytes,sha256,estado) VALUES(%s,'AVATAR',%s,'image/png',100,%s,'ACTIVO') RETURNING id",(str(uuid.uuid4()),OTHER,b'a'*32)).fetchone()[0]
   with self.assertRaises(psycopg.errors.ForeignKeyViolation):c.execute('UPDATE criterika.cuentas SET avatar_archivo_id=%s WHERE id=%s',(media,PLAYER))
 def test_28_auditoria_fallida_revierte_cambio(self):
  with connect() as root:
   original=root.execute('SELECT nombre FROM criterika.unidades WHERE id=%s',(UNIT,)).fetchone()[0]
   root.execute('ALTER TABLE criterika.eventos_auditoria ADD CONSTRAINT prueba_fallo_auditoria CHECK(false) NOT VALID')
  try:
   with self.assertRaises(psycopg.errors.CheckViolation):
    with connect() as c:
     c.execute('SET LOCAL ROLE criterika_app');context(c,'ADMINISTRADOR',ADMIN)
     c.execute("UPDATE criterika.unidades SET nombre='No debe confirmarse' WHERE id=%s",(UNIT,))
   with connect() as c:self.assertEqual(c.execute('SELECT nombre FROM criterika.unidades WHERE id=%s',(UNIT,)).fetchone()[0],original)
  finally:
   with connect() as c:c.execute('ALTER TABLE criterika.eventos_auditoria DROP CONSTRAINT prueba_fallo_auditoria')
 def test_29_concurrencia_compras(self):
  player=create_player(600,2);barrier=threading.Barrier(2)
  def purchase():
   with connect() as c:
    c.execute('SET LOCAL ROLE criterika_app');context(c,'JUGADOR',player);barrier.wait(timeout=10)
    balance,lives=c.execute('SELECT gemas_saldo,vidas_totales FROM criterika.estados_jugador WHERE cuenta_id=%s FOR UPDATE',(player,)).fetchone()
    if lives+3>5:return 'LIMITE_VIDAS'
    ident=c.execute("INSERT INTO criterika.compras_vidas(jugador_id,paquete,vidas_entregadas,gemas_gastadas) VALUES(%s,'VIDAS_3',3,150) RETURNING id",(player,)).fetchone()[0]
    c.execute("INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,compra_vidas_id) VALUES(%s,'COMPRA_VIDAS',-150,%s,%s)",(player,balance-150,ident))
    c.execute('UPDATE criterika.estados_jugador SET gemas_saldo=%s,vidas_totales=5,proxima_regeneracion_en=NULL WHERE cuenta_id=%s',(balance-150,player))
    return 'OK'
  with ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(lambda _:purchase(),range(2)))
  self.assertCountEqual(out,['OK','LIMITE_VIDAS'])
  with connect() as c:self.assertEqual(c.execute('SELECT gemas_saldo,vidas_totales FROM criterika.estados_jugador WHERE cuenta_id=%s',(player,)).fetchone(),(450,5))
 def test_30_concurrencia_primera_aprobacion(self):
  player=create_player();barrier=threading.Barrier(2)
  with connect() as c:context(c);attempt=new_attempt(c,player,True)
  def award():
   with connect() as c:
    c.execute('SET LOCAL ROLE criterika_app');context(c,'JUGADOR',player);barrier.wait(timeout=10)
    balance,xp=c.execute('SELECT gemas_saldo,xp_total FROM criterika.estados_jugador WHERE cuenta_id=%s FOR UPDATE',(player,)).fetchone()
    exists=c.execute('SELECT id FROM criterika.aprobaciones_nivel WHERE jugador_id=%s AND nivel_id=%s',(player,LEVEL)).fetchone()
    if exists:return 'EXISTENTE'
    approval=c.execute('INSERT INTO criterika.aprobaciones_nivel(jugador_id,nivel_id,intento_origen_id,gemas_otorgadas,xp_otorgada) VALUES(%s,%s,%s,150,100) RETURNING id',(player,LEVEL,attempt)).fetchone()[0]
    c.execute("INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,aprobacion_id) VALUES(%s,'RECOMPENSA_NIVEL',150,%s,%s)",(player,balance+150,approval))
    c.execute('UPDATE criterika.estados_jugador SET gemas_saldo=%s,xp_total=%s WHERE cuenta_id=%s',(balance+150,xp+100,player))
    return 'OK'
  with ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(lambda _:award(),range(2)))
  self.assertCountEqual(out,['OK','EXISTENTE'])
  with connect() as c:self.assertEqual(c.execute('SELECT gemas_saldo,xp_total FROM criterika.estados_jugador WHERE cuenta_id=%s',(player,)).fetchone(),(150,100))

 def test_31_instalacion_fallida_es_atomica(self):
  dbname='criterika_prueba_fallo_'+uuid.uuid4().hex[:12]
  with connect(autocommit=True) as c:c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(dbname)))
  try:
   with tempfile.TemporaryDirectory() as temp:
    dest=Path(temp)/'paquete';shutil.copytree(ROOT,dest,ignore=shutil.ignore_patterns('resultados.json','informe_pruebas.md'))
    p=dest/'migrations/0001_inicial/60_datos_base.sql';p.write_text(p.read_text()+'\nSELECT 1/0; -- fallo de prueba al final de la instalación\n')
    mpath=dest/'migrations/0001_inicial/manifest.json';m=json.loads(mpath.read_text())
    for item in m['files']:item['sha256']=hashlib.sha256((dest/item['path']).read_bytes()).hexdigest()
    m['checksum']=hashlib.sha256(json.dumps(m['files'],sort_keys=True,separators=(',',':')).encode()).hexdigest();mpath.write_text(json.dumps(m))
    result=subprocess.run([sys.executable,dest/'aplicar.py'],env={**os.environ,'PGDATABASE':dbname},text=True,capture_output=True)
    self.assertNotEqual(result.returncode,0)
   with connect(dbname=dbname) as c:
    self.assertIsNone(c.execute("SELECT to_regnamespace('criterika')").fetchone()[0])
    self.assertEqual(c.execute('SELECT count(*) FROM control_sql.migraciones').fetchone()[0],0)
  finally:
   with connect(autocommit=True) as c:c.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(dbname)))

 def test_32_contexto_inventado(self):
  with sandbox('JUGADOR',PLAYER,True) as c:
   c.execute("SELECT set_config('criterika.actor_tipo','INVENTADO',true)")
   with self.assertRaises(psycopg.errors.InsufficientPrivilege):c.execute("UPDATE criterika.cuentas SET nombre='No autorizado' WHERE id=%s",(PLAYER,))

 def test_33_primera_aprobacion_requiere_resultado(self):
  with sandbox() as c:
   attempt=new_attempt(c)
   approval=c.execute('INSERT INTO criterika.aprobaciones_nivel(jugador_id,nivel_id,intento_origen_id,gemas_otorgadas,xp_otorgada) VALUES(%s,%s,%s,150,100) RETURNING id',(PLAYER,LEVEL,attempt)).fetchone()[0]
   c.execute("INSERT INTO criterika.movimientos_gemas(jugador_id,tipo,cantidad,saldo_posterior,aprobacion_id) VALUES(%s,'RECOMPENSA_NIVEL',150,150,%s)",(PLAYER,approval))
   with self.assertRaises(psycopg.errors.CheckViolation):c.execute('SET CONSTRAINTS ALL IMMEDIATE')

 def test_34_auditoria_titular_indirecto(self):
  with sandbox('ADMINISTRADOR',ADMIN,True) as c:
   attempt=new_attempt(c)
   resource=c.execute("INSERT INTO criterika.actividades_intento(intento_id,revision_id,actividad_id,posicion_inicial,estado,orden_pendiente) VALUES(%s,%s,%s,1,'PENDIENTE',1) RETURNING id",(attempt,REV,uid(201))).fetchone()[0]
   self.assertEqual(c.execute('SELECT count(*) FROM criterika.eventos_auditoria e JOIN criterika.auditoria_sujetos s ON s.evento_id=e.id WHERE e.recurso_id=%s AND s.cuenta_id=%s',(resource,PLAYER)).fetchone()[0],1)

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(DatabaseTests)
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 report={'pruebas':result.testsRun,'fallos':len(result.failures),'errores':len(result.errors),
 'base_datos':os.environ.get('PGDATABASE'),'alcance':'DDL, permisos, triggers y transacciones SQL de prueba; no backend HTTP, borrado externo ni infraestructura de producción.'}
 with connect() as c:report['postgresql']=c.execute('SELECT version()').fetchone()[0]
 (ROOT/'tests/resultados.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(0 if result.wasSuccessful() else 1)
