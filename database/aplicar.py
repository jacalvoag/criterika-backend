"""Verifica archivos y aplica una migración modular con psql; solo requiere Python estándar y psql."""
from pathlib import Path
import hashlib,json,os,subprocess,sys
root=Path(__file__).resolve().parent
manifest=json.loads((root/'migrations/0001_inicial/manifest.json').read_text())
for item in manifest['files']:
 path=(root/item['path']).resolve()
 if root not in path.parents or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
  raise SystemExit('Integridad inválida de archivo SQL: '+item['path'])
fingerprint=hashlib.sha256(json.dumps(manifest['files'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
if fingerprint!=manifest['checksum']:raise SystemExit('Manifiesto de migración inválido')
psql=os.environ.get('PSQL_BIN','psql')
result=subprocess.run([psql,'-X','--no-password','--set','ON_ERROR_STOP=1','--set','huella='+fingerprint,'--file',str(root/'aplicar.sql')],cwd=root)
sys.exit(result.returncode)
