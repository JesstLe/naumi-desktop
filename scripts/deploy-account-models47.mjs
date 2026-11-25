// Explicit operator transport; preparation requires central owner's released phase.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {takeoverInput} from './lib/account-model-takeover-input.mjs';
const phase=process.argv[2],arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3),source=arg('source'),gateway=arg('gateway-sha'),archive=arg('archive');
assert(['prepare','ingress','rollback-ingress'].includes(phase)&&/^[a-f0-9]{40}$/.test(source)&&/^[a-f0-9]{64}$/.test(gateway),'DEPLOYMENT_EXACT_PINS_REQUIRED');
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'main','FIXED_MAIN_ONLY');assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source,'FIXED_SOURCE_CHANGED');
const config='E:/Workspace/naumi/output/server-connections/47.105.59.142/connection.json',c=JSON.parse(fs.readFileSync(config));assert(c.host==='47.105.59.142'&&c.username==='root');
const common=['-i',path.join(process.env.LOCALAPPDATA,'Naumi/operator-47-import/operator.pem'),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+path.join(path.dirname(config),'known_hosts')],exe=n=>path.join(process.env.SystemRoot,'System32/OpenSSH/'+n+'.exe'),dest='root@'+c.host,out='evidence/account-takeover',remote='/opt/naumi-desktop-models/incoming/'+source+'.tar';
fs.mkdirSync(out,{recursive:true});const sync=(name,args,input)=>{const r=spawnSync(exe(name),args,{input,encoding:'utf8',windowsHide:true,timeout:180000});if(r.status!==0)throw Error('PINNED_TRANSPORT_FAILED');return r.stdout;};
let request=null,hash;
if(phase==='prepare'){
 assert(archive&&fs.statSync(archive).size<8*1024*1024,'SMALL_PUBLIC_ARCHIVE_REQUIRED');hash=createHash('sha256').update(fs.readFileSync(archive)).digest('hex');request=takeoverInput(arg('input')??'D:/NaumiReleases/0.4.13/win-unpacked/resources/backend/defaults/embedded-models.json');
 sync('ssh',['-T',...common,dest,'umask 077; mkdir -p /opt/naumi-desktop-models/incoming']);sync('scp',[...common,archive,dest+':'+remote]);
}
// Script is passed through a separate fixed public file; payload stdin remains secret-only.
const script='scripts/deploy-account-models47.py',bytes=fs.readFileSync(script),scriptHash=createHash('sha256').update(bytes).digest('hex'),scriptRemote='/opt/naumi-desktop-models/incoming/deploy-'+scriptHash+'.py';
sync('scp',[...common,script,dest+':'+scriptRemote]);
const cmd=`test "$(sha256sum ${scriptRemote} | cut -d ' ' -f 1)" = ${scriptHash} && python3 -B ${scriptRemote} ${phase} --source ${source} --gateway-sha ${gateway}`+(phase==='prepare'?` --archive ${remote} --archive-sha ${hash}`:'');
const r=spawnSync(exe('ssh'),['-T',...common,dest,cmd],{input:request?JSON.stringify(request):'',encoding:'utf8',windowsHide:true,timeout:240000});
fs.writeFileSync(path.join(out,'REMOTE_'+phase+'.log'),r.stdout+r.stderr);let v;try{v=JSON.parse(r.stdout);}catch{throw Error('REMOTE_RECEIPT_MISSING');}fs.writeFileSync(path.join(out,'REMOTE_'+phase+'.json'),JSON.stringify({source,exit:r.status,...v},null,2)+'\n');console.log(JSON.stringify(v));process.exitCode=r.status??1;
