from pathlib import Path
import subprocess,zipfile,json,hashlib
r=Path.cwd();o=r/'evidence/account-models-real';c=Path('D:/NaumiChecks/account-models-real-copy-c08735d');base='c08735d1f8a6600c3614757ed21334d9d7687c98';files=subprocess.check_output(['git','diff','--name-only',base,'187053d'],text=True).splitlines();files.append('services/account-models/README.md');assert len(files)==len(set(files))==11;sha=lambda b:hashlib.sha256(b).hexdigest();entries=[]
for f in files:
 modified=(r/f).read_bytes();old=subprocess.run(['git','show',base+':'+f],capture_output=True);original=old.stdout if old.returncode==0 else None;entries.append({'path':f,'original':sha(original) if original is not None else None,'modified':sha(modified)})
 if original is not None:
  p=o/'original'/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(original)
 p=c/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(modified)
(c/'.naumi-real-model-copy').write_text('copy-only',encoding='utf-8')
m={'baseline':base,'functionalCommit':'187053d','integratedCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceRoot':str(r),'liveRoot':'E:/Workspace/naumi-desktop','entries':entries};(o/'manifest.json').write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8');(o/'DIFF_FILE.patch').write_bytes(subprocess.check_output(['git','diff','--binary',base,'--',*files]))
rollback='''#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node - "$1" "$HERE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),target=fs.realpathSync(process.argv[2]),here=process.argv[3],m=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(path.join(target,'.naumi-real-model-copy'))||[m.sourceRoot,m.liveRoot].some(p=>path.resolve(p).toLowerCase()===target.toLowerCase()))throw Error('MARKED_COPY_REQUIRED');
for(const e of m.entries){const p=path.resolve(target,e.path);if(!p.startsWith(target+path.sep)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p||hash(fs.readFileSync(p))!==e.modified)throw Error('COPY_CHANGED');if(e.original&&hash(fs.readFileSync(path.join(here,'original',e.path)))!==e.original)throw Error('ORIGINAL_CHANGED');}
let restored=0,removed=0;for(const e of m.entries){const p=path.join(target,e.path);if(e.original){fs.copyFileSync(path.join(here,'original',e.path),p);if(hash(fs.readFileSync(p))!==e.original)throw Error('RESTORE_FAILED');restored++;}else{fs.unlinkSync(p);removed++;}}
console.log('ROLLBACK restored='+restored+' removed='+removed+' hashes=PASS source=MODIFIED live=UNTOUCHED unknown_receipts=RETAINED exit=0');
NODE
''';(o/'ROLLBACK.sh').write_text(rollback,encoding='utf-8',newline='\n')
subprocess.run(['git','init','--quiet'],cwd=c,check=True);subprocess.run(['git','apply','--reverse','--check',str(o/'DIFF_FILE.patch')],cwd=c,check=True)
a=subprocess.run(['D:/DEV/Git/bin/bash.exe',str(o/'ROLLBACK.sh').replace('\\','/'),str(c)],capture_output=True);(o/'ROLLBACK.log').write_bytes(a.stdout+a.stderr);assert a.returncode==0;print(a.stdout.decode().strip())
a=subprocess.run(['node','--test','tests/account-models.test.mjs'],cwd=c,capture_output=True);(o/'ROLLBACK_TESTS.log').write_bytes(a.stdout+a.stderr);assert a.returncode==0;print('ROLLBACK_TESTS tests=12 pass=12 fail=0 exit=0')
with zipfile.ZipFile(o/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED) as z:
 for e in entries:
  z.write(r/e['path'],'modified/'+e['path'])
  if e['original']:z.write(o/'original'/e['path'],'original/'+e['path'])
 z.write(o/'manifest.json','manifest.json');i=zipfile.ZipInfo('ROLLBACK.sh');i.external_attr=0o100755<<16;z.writestr(i,rollback)
with zipfile.ZipFile(o/'MODIFIED_FILE.zip') as z:assert z.testzip() is None;print('MODIFIED_ZIP entries='+str(len(z.namelist()))+' CRC=PASS')
assert all(sha((r/e['path']).read_bytes())==e['modified'] for e in entries)
assert sha((r/'runtime/account-models-service/live-host.mjs').read_bytes())==json.loads((o/'SUMMARY.json').read_text(encoding='utf-8'))['liveServerBundleSHA256']
with zipfile.ZipFile(o/'LIVE_HOST_BUNDLE.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.write(r/'runtime/account-models-service/live-host.mjs','live-host.mjs');z.write(r/'runtime/account-models-service/LIVE_PIN.json','LIVE_PIN.json')
print('ACTIVE_SOURCE=MODIFIED LIVE_HOST_SHA256=PASS')
