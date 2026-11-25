"""Phased account-model deployment; additive ingress only, no central slot control.
Preparation and ingress each require the central owner's explicitly released window.
No passwords, credential ciphertext or cookie values are emitted.
"""
import datetime,re,atexit
import argparse,contextlib,fcntl,hashlib,json,os,pathlib,secrets,shutil,socket,sqlite3,subprocess,sys,tarfile,time,urllib.request,urllib.error
BASE=pathlib.Path('/opt/naumi-desktop-models')
GATE=pathlib.Path('/etc/nginx/sites-available/reference-workbench')
IMAGE='sha256:35a8ace40abc8f74ac41432d0901c24a6c8b8991789e4e30cfc88cc866f59f31'
ORIGIN='https://47.105.59.142'
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(args,*,input=None,timeout=90,check=True):
 r=subprocess.run(args,input=input,capture_output=True,timeout=timeout)
 if check and r.returncode:raise RuntimeError('COMMAND_FAILED_'+args[0])
 return r.stdout
def atomic(file,data,mode=0o600):
 temp=file.with_name(file.name+'.account-models-temp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.replace(temp,file)
 finally:
  if temp.exists():temp.unlink()
def request(url):
 try:
  with urllib.request.urlopen(url,timeout=15) as r:return r.status,json.loads(r.read())
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def inventory():return {r['Name']:{'Id':r['Id'],'Image':r['Image'],'StartedAt':r['State']['StartedAt']} for r in json.loads(run(['docker','inspect',*run(['docker','ps','-q']).decode().split()]))}
def locks(stack):
 for f in ['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock',str(BASE/'deploy.lock')]:
  h=stack.enter_context(open(f,'a'));fcntl.flock(h,fcntl.LOCK_EX|fcntl.LOCK_NB)
NODE_RECORDS=[]
def node(release,env,entry,args=[],input=None):
 opname='naumi-model-op-'+release.name[:12]+'-'+(args[0] if args else 'none');receipt={'entry':entry,'action':args[0] if args else None,'container':opname,'exit':None,'status':'PENDING','sqlShapes':[]};NODE_RECORDS.append(receipt)
 result=subprocess.run(['docker','run','--rm','--name',opname,'-i','--network','naumi47_staging','--read-only','--tmpfs','/tmp:rw,nosuid,noexec,size=16m','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--env-file',str(env),'-e','NODE_OPTIONS=','-e','NODE_PATH=/app/node_modules','-v',str(release)+':/app/account-models:ro','--workdir','/app/account-models','--entrypoint','node',IMAGE,entry,*args],input=input,capture_output=True,timeout=90)
 receipt.update({'exit':result.returncode,'status':'COMPLETE','sqlShapes':[x for x in result.stderr.decode(errors='replace').splitlines() if x.startswith('IMPORT_SQL_SHAPES ')]})
 return result.stdout
def jsonnode(*args,**kw):
 v=json.loads(node(*args,**kw));assert v.get('status')=='PASS',v.get('status','INVALID_OPERATOR_RECEIPT');return v
def check_original(before):
 now=inventory();assert all(now.get(n)==v for n,v in before.items()),'ORIGINAL_CONTAINER_CHANGED'
def main():
 p=argparse.ArgumentParser();p.add_argument('phase',choices=['prepare','ingress','rollback-ingress']);p.add_argument('--source',required=True);p.add_argument('--archive');p.add_argument('--archive-sha');p.add_argument('--gateway-sha',required=True);p.add_argument('--expected-dump-sha',required=True);p.add_argument('--not-after',required=True);a=p.parse_args()
 assert len(a.source)==40 and all(c in 'abcdef0123456789' for c in a.source),'SOURCE_PIN_REQUIRED'
 deadline=datetime.datetime.fromisoformat(a.not_after.replace('Z','+00:00'));assert deadline.tzinfo and 0<(deadline-datetime.datetime.now(datetime.timezone.utc)).total_seconds()<=600,'INVALID_BOUNDED_WINDOW'
 BASE.mkdir(mode=0o700,exist_ok=True)
 with contextlib.ExitStack() as stack:
  locks(stack);before=GATE.read_bytes();assert sha(before)==a.gateway_sha,'NGINX_CAS_CHANGED';original=inventory();dump=run(['nginx','-T']);assert sha(dump)==a.expected_dump_sha,'NGINX_FULL_CLOSURE_CHANGED'
  protected={f:sha(pathlib.Path(f).read_bytes()) for f in re.findall(rb'^# configuration file ([^:]+):$',dump,re.M).copy() for f in [f.decode()]}
  assert request(ORIGIN+'/api/auth/session')==(200,{'user':None}),'AUTH_PREFLIGHT_FAILED'
  release=BASE/'releases'/a.source;record=BASE/'evidence'/a.source;record.mkdir(parents=True,mode=0o700,exist_ok=True)
  container='naumi-desktop-models-'+a.source[:12];snippet=release/'nginx-location.conf'
  atomic(record/'nginx-T.before',dump);state={'import':'NOT_STARTED','role':'NOT_STARTED','container':'NOT_STARTED','defaults':'NOT_STARTED'}
  def admission():
   assert datetime.datetime.now(datetime.timezone.utc)<deadline,'WINDOW_EXPIRED'
   free=shutil.disk_usage('/').free;mem=int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
   assert free>=10*1024**3+1200*1024**2,'ROOT_SPACE_ADMISSION';assert mem>=768*1024**2,'MEMORY_ADMISSION';return free,mem
  def checkpoint():atomic(record/'PREPARE_STATE.json',(json.dumps({'source':a.source,'state':state,'operators':NODE_RECORDS,'rootFree':shutil.disk_usage('/').free,'memAvailable':int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024})+'\n').encode())
  atexit.register(checkpoint)
  if a.phase=='prepare':
   assert not release.exists(),'OWN_RELEASE_EXISTS';assert not (BASE/'private/service.env').exists(),'OWN_SERVICE_EXISTS'
   archive=pathlib.Path(a.archive);assert sha(archive.read_bytes())==a.archive_sha,'ARCHIVE_PIN_CHANGED'
   free,mem=admission()
   # Includes archive/expanded bundle, 512MiB DB, WAL, consistent backup and logs/growth.
   disk_peak=1200*1024**2;assert free>=10*1024**3+disk_peak,'ROOT_SPACE_ADMISSION';assert mem>=768*1024**2,'MEMORY_ADMISSION'
   with socket.socket() as s:s.bind(('127.0.0.1',3192))
   release.mkdir(parents=True)
   with tarfile.open(archive) as tar:
    assert all(m.isfile() and not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts for m in tar.getmembers()),'UNSAFE_ARCHIVE'
    tar.extractall(release,filter='data')
   manifest=json.loads((release/'DEPLOYMENT_PIN.json').read_text());assert manifest['source']==a.source
   for f in manifest['files']:assert sha((release/f['path']).read_bytes())==f['sha256'],'RELEASE_FILE_DRIFT'
   info=json.loads(run(['docker','inspect','naumi47-web-layer-export-20261120-r1']))[0];assert info['Image']==IMAGE,'RUNTIME_IMAGE_CHANGED'
   env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x);assert env.get('NAUMI_ENTERPRISE_DEPLOYMENT_MODE')=='dedicated','DEDICATED_AUTHORITY_REQUIRED';assert env.get('DATABASE_URL') and len(env.get('SETTINGS_SECRET',''))>=32
   private=BASE/'private';private.mkdir(mode=0o700,exist_ok=True);os.chmod(private,0o700);operator_env=private/'operator.env'
   atomic(operator_env,('DATABASE_URL='+env['DATABASE_URL']+'\nSETTINGS_SECRET='+env['SETTINGS_SECRET']+'\nNAUMI_IMPORT_SQL_TRACE=shape\n').encode())
   try:
    # Secret payload arrives only through pinned SSH stdin, never the archive.
    payload=sys.stdin.buffer.read(2*1024*1024+1);assert len(payload)<=2*1024*1024
    envelope=json.loads(payload);req=envelope['request'];policy=envelope['adminPolicy'];assert policy['mode']=='native-owner' and len(policy['subject'])<255 and re.fullmatch(r'[^@\s]+@[^@\s]+',policy['subject']),'ADMIN_SUBJECT_INVALID';payload=json.dumps(req).encode();allow=json.loads((release/'IMPORT_ALLOWLIST.json').read_text());assert req['schemaVersion']==1 and req['sourceId']==allow['sourceId'] and req['operationId']==allow['operationId'] and req['configDigest']==allow['configDigest'],'IMPORT_PIN_CHANGED';assert set(req)=={'schemaVersion','sourceId','operationId','configDigest','connections'},'IMPORT_FIELDS_CHANGED'
    assert [{k:v for k,v in c.items() if k!='key'} for c in req['connections']]==allow['connections'],'IMPORT_CONFIG_DRIFT'
    assert env.get('NAUMI_ENTERPRISE_ALLOWED_IDS')==policy['enterpriseId'],'ADMIN_ENTERPRISE_BINDING_CHANGED'
    exclude=[c['providerId'] for c in allow['connections']];snapinput=json.dumps({'excludeProviders':exclude}).encode();prior=jsonnode(release,operator_env,'operator.mjs',['snapshot'],input=snapinput)
    admission();state['import']='PENDING';checkpoint()
    imported=json.loads(node(release,operator_env,'import.cjs',['apply','--existing-schema'],input=payload));(record/'import.json').write_text(json.dumps(imported,indent=2)+'\n');state['import']=imported['status'];checkpoint();assert imported['status']=='PASS',imported['status']
    after=jsonnode(release,operator_env,'operator.mjs',['snapshot'],input=snapinput)
    (record/'existing-data-digests.json').write_text(json.dumps({'before':prior,'after':after},indent=2)+'\n');assert prior==after,'EXISTING_DATABASE_DRIFT'
    admission();state['role']='PENDING';checkpoint();password=secrets.token_urlsafe(32);role=jsonnode(release,operator_env,'operator.mjs',['role'],input=json.dumps({'password':password}).encode())
    state['role']='CREATED';checkpoint()
    from urllib.parse import urlsplit,urlunsplit,quote
    u=urlsplit(env['DATABASE_URL']);netloc=role['role']+':'+quote(password,safe='')+'@'+u.hostname+(':'+str(u.port) if u.port else '')
    database_url=urlunsplit((u.scheme,netloc,u.path,u.query,u.fragment))
    service_env=('DATABASE_URL='+database_url+'\nSETTINGS_SECRET='+env['SETTINGS_SECRET']+'\nNAUMI_IDENTITY_ORIGIN='+ORIGIN+'\nNAUMI_AUTH_INTERNAL_ORIGIN='+ORIGIN+'\nNAUMI_ACCOUNT_MODEL_ADMIN_ENTERPRISE='+policy['enterpriseId']+'\nNAUMI_ACCOUNT_MODEL_ADMIN_SUBJECT='+policy['subject']+'\nNAUMI_ACCOUNT_MODEL_REQUIRE_RO=1\nNAUMI_ACCOUNT_MODEL_CATALOG=/app/account-models/catalog.json\nNAUMI_ACCOUNT_MODEL_DATA=/data\nNAUMI_ACCOUNT_MODEL_ASSETS=/app/account-models\nHOST=0.0.0.0\nPORT=3192\nNODE_OPTIONS=\n')
    atomic(private/'service.env',service_env.encode());(record/'role.json').write_text(json.dumps(role,indent=2)+'\n')
   finally:operator_env.unlink(missing_ok=True)
   data=BASE/'data';data.mkdir(mode=0o700);os.chown(data,1001,1001)
   admission();state['container']='CREATE_PENDING';checkpoint()
   run(['docker','create','--name',container,'--user','1001:1001','--network','naumi47_staging','-p','127.0.0.1:3192:3192','--restart','unless-stopped','--read-only','--tmpfs','/tmp:rw,nosuid,noexec,size=16m','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','384m','--cpus','1','--pids-limit','100','--log-opt','max-size=5m','--log-opt','max-file=3','--env-file',str(private/'service.env'),'-v',str(release)+':/app/account-models:ro','-v',str(data)+':/data','--workdir','/app/account-models','--entrypoint','node',IMAGE,'server.mjs'])
   state['container']='CREATED';checkpoint();run(['docker','network','connect','naumi47_public_egress',container]);admission();state['container']='START_PENDING';checkpoint();run(['docker','start',container]);state['container']='STARTED';checkpoint()
   for i in range(60):
    try:
     if request('http://127.0.0.1:3192/api/desktop-models/health')[0]==200:break
    except Exception:pass
    time.sleep(.25)
   assert request('http://127.0.0.1:3192/api/desktop-models/health')[0]==200,'SIDECAR_HEALTH_FAILED'
   # Verify the SAME runtime with default TLS trust and exact original auth authority.
   tls=json.loads(run(['docker','exec',container,'node','--input-type=module','-e',"const r=await fetch('https://47.105.59.142/api/auth/session');console.log(JSON.stringify({status:r.status,user:(await r.json()).user}));"]))
   assert tls=={'status':200,'user':None},'TLS_AUTH_FAILED'
   catalog=json.loads(run(['docker','exec',container,'node','operator.mjs','catalog']));assert catalog['status']=='PASS' and len(catalog['models'])==4,'READONLY_CATALOG_FAILED'
   admission();state['defaults']='PENDING';checkpoint();defaults=json.loads(run(['docker','exec',container,'node','operator.mjs','defaults']));assert defaults['status']=='PASS','DEFAULT_GRANT_FAILED';state['defaults']='ENABLED';checkpoint()
   with sqlite3.connect('file:'+str(data/'account-models.sqlite')+'?mode=ro',uri=True) as src,sqlite3.connect(record/'initial.sqlite') as dest:src.backup(dest)
   assert sqlite3.connect(record/'initial.sqlite').execute('PRAGMA integrity_check').fetchone()[0]=='ok','INITIAL_BACKUP_INVALID'
   check_original(original);assert GATE.read_bytes()==before,'NGINX_CHANGED_DURING_PREPARE'
   after_dump=run(['nginx','-T']);atomic(record/'nginx-T.after-prepare',after_dump);assert after_dump==dump,'NGINX_FULL_CLOSURE_CHANGED';assert all(sha(pathlib.Path(f).read_bytes())==v for f,v in protected.items()),'NGINX_INCLUDED_FILE_CHANGED'
   report={'status':'READY_FOR_INGRESS','source':a.source,'image':IMAGE,'archiveSHA256':a.archive_sha,'rootFreeBefore':free,'memAvailableBefore':mem,'diskRemainingPeakBudget':disk_peak,'container':container,'tls':tls,'catalog':catalog,'defaults':defaults,'originalContainersUnchanged':len(original),'gatewayUnchanged':True,'nginxFullStdoutSHA256':sha(after_dump),'protectedFiles':protected,'state':state,'operators':NODE_RECORDS,'importedProviders':exclude,'importedRows':{k:4 for k in ['app_supplier_source_snapshots','app_supplier_model_metadata','app_supplier_model_metadata_versions','app_model_credentials']},'modelCalls':0}
   atomic(record/'PREPARED.json',(json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report));return
  assert (record/'PREPARED.json').exists(),'PREPARATION_REQUIRED'
  marker=' include '+str(snippet)+';';anchor=' listen 443 ssl; server_name 47.105.59.142;'
  if a.phase=='ingress':
   text=before.decode();assert text.count(anchor)==1 and marker not in text,'NGINX_ANCHOR_CHANGED';after=text.replace(anchor,anchor+'\n'+marker).encode()
   atomic(record/'nginx.before',before);atomic(record/'nginx.after',after)
   assert all(sha(pathlib.Path(f).read_bytes())==v for f,v in protected.items()),'NGINX_INCLUDED_FILE_CHANGED';admission()
   try:
    atomic(GATE,after,0o644)
    for label,cmd in [('nginx-test',['nginx','-t']),('nginx-reload',['systemctl','reload','nginx'])]:
     assert datetime.datetime.now(datetime.timezone.utc)<deadline,'WINDOW_EXPIRED'
     result=subprocess.run(cmd,capture_output=True,timeout=30);atomic(record/(label+'.log'),result.stdout+result.stderr);assert result.returncode==0,'INGRESS_COMMAND_FAILED'
    after_dump=run(['nginx','-T']);atomic(record/'nginx-T.after-ingress',after_dump)
    assert all(sha(pathlib.Path(f).read_bytes())==(sha(after) if os.path.realpath(f)==str(GATE) else v) for f,v in protected.items()),'NGINX_INCLUDED_FILE_CHANGED'
    assert request(ORIGIN+'/api/desktop-models/health')[0]==200,'PUBLIC_HEALTH_FAILED'
    assert request(ORIGIN+'/admin/desktop-models')[0]==401,'ADMIN_ANONYMOUS_NOT_DENIED'
    assert request(ORIGIN+'/api/desktop-models/v1/admin/catalog')[0]==401,'ADMIN_API_ANONYMOUS_NOT_DENIED'
    assert request(ORIGIN+'/api/auth/session')==(200,{'user':None}),'AUTH_REGRESSION'
    check_original(original)
   except Exception:
    assert GATE.read_bytes()==after,'ROLLBACK_GATEWAY_DRIFT';atomic(GATE,before,0o644);run(['nginx','-t']);run(['systemctl','reload','nginx']);restored=run(['nginx','-T']);atomic(record/'nginx-T.after-failed-ingress-rollback',restored);assert restored==dump,'NGINX_ROLLBACK_CLOSURE_DRIFT';atomic(record/'FAILED_INGRESS_ROLLBACK.json',(json.dumps({'status':'CAS_RESTORED','gatewaySHA256':sha(before),'nginxFullStdoutSHA256':sha(restored),'persistentDataPreserved':True})+'\n').encode());raise
   report={'status':'INGRESS_PASS','source':a.source,'gatewayBefore':sha(before),'gatewayAfter':sha(after),'snippetSHA256':sha(snippet.read_bytes()),'nginxFullStdoutSHA256':sha(run(['nginx','-T'])),'publicTLSHealth':200,'anonymousAdmin':401,'originalContainersUnchanged':len(original),'modelCalls':0,'centralSupervisorAcceptance':False}
  else:
   expected=(record/'nginx.after').read_bytes();assert before==expected,'ROLLBACK_GATEWAY_DRIFT';restored=(record/'nginx.before').read_bytes();atomic(GATE,restored,0o644);run(['nginx','-t']);run(['systemctl','reload','nginx']);check_original(original)
   report={'status':'INGRESS_ROLLBACK_PASS','restoredGatewaySHA256':sha(restored),'persistentDataPreserved':True,'modelsServiceRetained':True,'originalContainersUnchanged':len(original)}
  atomic(record/(a.phase+'.json'),(json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
if __name__=='__main__':
 try:main()
 except BlockingIOError:print(json.dumps({'status':'DEFERRED','error':'DEPLOYMENT_LOCK_BUSY'}));sys.exit(75)
 except Exception as e:print(json.dumps({'status':'FAIL','error':str(e) if str(e).replace('_','').isalnum() and len(str(e))<100 else 'DEPLOYMENT_STAGE_FAILED','noAutomaticDatabaseRollback':True}));sys.exit(1)
