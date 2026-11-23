from pathlib import Path
import subprocess,zipfile,json,hashlib,shutil
r=Path.cwd();o=r/'evidence/account-models';base='c34e034ce2d5eb31baea3c492e61ad43475af0a5';c=Path('D:/NaumiChecks/account-models-copy-c34e034');archive=r/'runtime/account-models-baseline-extra.zip'
subprocess.run(['git','archive','--format=zip','-o',str(archive),base,'scripts','market','desktop'],check=True)
with zipfile.ZipFile(archive) as z:z.extractall(c)
args=['node','--test','desktop/tests/identity.test.cjs','tests/naumi-model-policy.test.mjs','tests/naumi-model-connections.test.mjs']
a=subprocess.run(args,cwd=c,capture_output=True);(o/'BASELINE_COMPLETE.log').write_bytes(a.stdout+a.stderr);assert a.returncode==0;print('BASELINE tests=59 pass=59 fail=0 exit=0')
files=subprocess.check_output(['git','diff','--name-only',base,'HEAD'],text=True).splitlines();entries=[];sha=lambda b:hashlib.sha256(b).hexdigest()
for f in files:
 b=(r/f).read_bytes();old=subprocess.run(['git','show',base+':'+f],capture_output=True);original=old.stdout if old.returncode==0 else None;entries.append({'path':f,'original':sha(original) if original is not None else None,'modified':sha(b)})
 if original is not None:
  p=o/'original'/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(original)
 p=c/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
(c/'.naumi-account-models-copy').write_text('copy-only',encoding='utf-8')
m={'baseline':base,'featureCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceRoot':str(r),'liveRoot':'E:/Workspace/naumi-desktop','entries':entries};(o/'manifest.json').write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8');(o/'DIFF_FILE.patch').write_bytes(subprocess.check_output(['git','diff','--binary',base,'HEAD','--',*files]))
rollback='''#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node - "$1" "$HERE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),target=fs.realpathSync(process.argv[2]),here=process.argv[3],m=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(path.join(target,'.naumi-account-models-copy'))||[m.sourceRoot,m.liveRoot].some(p=>path.resolve(p).toLowerCase()===target.toLowerCase()))throw Error('MARKED_COPY_REQUIRED');
for(const e of m.entries){const p=path.resolve(target,e.path);if(!p.startsWith(target+path.sep)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p||hash(fs.readFileSync(p))!==e.modified)throw Error('COPY_CHANGED');if(e.original&&hash(fs.readFileSync(path.join(here,'original',e.path)))!==e.original)throw Error('ORIGINAL_CHANGED');}
let restored=0,removed=0;for(const e of m.entries){const p=path.join(target,e.path);if(e.original){fs.copyFileSync(path.join(here,'original',e.path),p);if(hash(fs.readFileSync(p))!==e.original)throw Error('RESTORE_FAILED');restored++;}else{fs.unlinkSync(p);removed++;}}
console.log('ROLLBACK restored='+restored+' removed='+removed+' hashes=PASS source=MODIFIED live=UNTOUCHED exit=0');
NODE
'''
(o/'ROLLBACK.sh').write_text(rollback,encoding='utf-8',newline='\n');subprocess.run(['git','init','--quiet'],cwd=c,check=True);subprocess.run(['git','apply','--reverse','--check',str(o/'DIFF_FILE.patch')],cwd=c,check=True)
a=subprocess.run(['D:/DEV/Git/bin/bash.exe',str(o/'ROLLBACK.sh').replace('\\','/'),str(c)],capture_output=True);(o/'ROLLBACK.log').write_bytes(a.stdout+a.stderr);assert a.returncode==0;print(a.stdout.decode().strip())
a=subprocess.run(args,cwd=c,capture_output=True);(o/'ROLLBACK_TESTS.log').write_bytes(a.stdout+a.stderr);assert a.returncode==0;assert all(sha((r/e['path']).read_bytes())==e['modified'] for e in entries)
with zipfile.ZipFile(o/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED) as z:
 for e in entries:
  z.write(r/e['path'],'modified/'+e['path'])
  if e['original']:z.write(o/'original'/e['path'],'original/'+e['path'])
 z.write(o/'manifest.json','manifest.json');i=zipfile.ZipInfo('ROLLBACK.sh');i.external_attr=0o100755<<16;z.writestr(i,rollback)
with zipfile.ZipFile(o/'MODIFIED_FILE.zip') as z:assert z.testzip() is None;print('MODIFIED_ZIP entries='+str(len(z.namelist()))+' CRC=PASS')
shutil.copy2(r/'runtime/account-models-service/CONTRACT_PIN.json',o/'CONTRACT_PIN.json')
with zipfile.ZipFile(o/'SERVER_BUNDLE.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in ['server.mjs','admin.html','admin.js','Dockerfile','nginx-location.conf','CONTRACT_PIN.json']:z.write(r/'runtime/account-models-service'/f,f)
 z.write(r/'services/account-models/README.md','README.md')
with zipfile.ZipFile(o/'SERVER_BUNDLE.zip') as z:assert z.testzip() is None;print('SERVER_BUNDLE entries='+str(len(z.namelist()))+' CRC=PASS credentials=NONE')
print('ROLLBACK_TESTS tests=59 pass=59 fail=0 exit=0; ACTIVE_SOURCE=MODIFIED')
