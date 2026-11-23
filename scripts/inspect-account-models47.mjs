import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import {randomUUID,createHash} from'node:crypto';
const connection='E:/Workspace/naumi/output/server-connections/47.105.59.142/connection.json',c=JSON.parse(fs.readFileSync(connection));if(c.host!=='47.105.59.142'||c.username!=='root')throw Error('PIN_REQUIRED');const key=path.join(process.env.LOCALAPPDATA,'Naumi/operator-47-import/operator.pem'),common=['-i',key,'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+path.join(path.dirname(connection),'known_hosts')],exe=n=>path.join(process.env.SystemRoot,'System32/OpenSSH/'+n+'.exe'),remote='/tmp/naumi-account-model-inspect-'+randomUUID()+'.mjs',file='runtime/account-models-service/inspect.mjs',hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let r=spawnSync(exe('scp'),[...common,file,'root@'+c.host+':'+remote],{windowsHide:true,encoding:'utf8',timeout:30000});if(r.status)throw Error('UPLOAD_FAILED');r=spawnSync(exe('ssh'),['-T',...common,'root@'+c.host,'python3 -B -'],{windowsHide:true,encoding:'utf8',timeout:30000,input:`import subprocess,json,pathlib,hashlib
assert hashlib.sha256(pathlib.Path('${remote}').read_bytes()).hexdigest()=='${hash}'
rows=subprocess.check_output(['docker','ps','--format','{{.Names}}']).decode().splitlines();webs=[n for n in rows if n.startswith('naumi47-web-')];assert len(webs)==1
web=webs[0];target='/app/'+pathlib.Path('${remote}').name
before={n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]['State']['StartedAt'] for n in rows}
subprocess.run(['docker','cp','${remote}',web+':'+target],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
 r=subprocess.run(['docker','exec','-e','NODE_OPTIONS=',web,'node',target],capture_output=True,text=True,timeout=20)
 try:v=json.loads(r.stdout)
 except Exception:v={'status':'FAIL','error':'INSPECT_ENTRY_FAILED','exit':r.returncode}
 v['existingContainersUnchanged']=all(json.loads(subprocess.check_output(['docker','inspect',n]))[0]['State']['StartedAt']==start for n,start in before.items());print(json.dumps(v))
finally:
 subprocess.run(['docker','exec','-u','0',web,'rm','-f',target],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);pathlib.Path('${remote}').unlink()
`});fs.writeFileSync('evidence/account-models/REMOTE_REGISTRY_READONLY.log',r.stdout+r.stderr);console.log('REGISTRY_READONLY '+r.stdout.trim());if(r.status||JSON.parse(r.stdout).status!=='PASS')process.exitCode=1;
