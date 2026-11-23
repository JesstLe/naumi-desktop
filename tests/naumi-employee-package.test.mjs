import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {packageImports,auditPackage} from '../scripts/audit-enterprise-package.mjs';
import {DINGTALK_VERSION,DINGTALK_SHA256,resolveDingTalk,dingTalkEnvironment,dingTalkHealth,materializeDingTalk} from '../plugins/naumi-enterprise/dingtalk-runtime.js';
import {EmployeeCapabilities} from '../plugins/naumi-enterprise/employee-capabilities.js';
import {dingTalkPin,verifyDingTalkArchive,stageDingTalk} from '../desktop/scripts/stage-dingtalk.mjs';
import {scanRuntimeInventory,prepareRuntime} from '../desktop/scripts/prepare-runtime.mjs';
const project=path.resolve(import.meta.dirname,'..');
const fixture=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-package-'));return {dir,write(name,data){const p=path.join(dir,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof data==='string'?data:JSON.stringify(data));return p;},close(){assert(dir.startsWith(os.tmpdir()+path.sep));fs.rmSync(dir,{recursive:true,force:true});}};};

test('package scanner parses declarations, multiline exports and literal dynamic imports, not comments or strings',()=>{
 const text=`// import x from 'comment';\nconst s="from 'not-a-module'";import {x} from 'a';export {y} from './y.js';import('b');import(variable);`;
 assert.deepEqual(packageImports(text),['a','./y.js','b']);
});
test('all enterprise runtime files have declared imports and public peers',()=>{
 const value=auditPackage(project+'/plugins/naumi-enterprise',{checkInstalled:true});assert(value.files>60);assert(value.externalImports.includes('@earendil-works/pi-ai'));assert(value.externalImports.includes('@deepseek-ai/dsh-schedule'));
});
test('closure gate rejects omitted files and undeclared direct dependencies',()=>{
 const f=fixture();try{f.write('package.json',{name:'fixture',type:'module'});f.write('host.js',"import x from 'not-declared';");assert.throws(()=>auditPackage(f.dir),/DEPENDENCY_UNDECLARED/);assert.throws(()=>auditPackage(f.dir,{packedFiles:['package.json']}),/FILE_OMITTED/);}finally{f.close();}
});
test('closure gate rejects missing relative module and web assets',()=>{
 const f=fixture();try{f.write('package.json',{});f.write('host.js',"import './missing.js';");assert.throws(()=>auditPackage(f.dir),/IMPORT_MISSING/);f.write('host.js',"import('/naumi/assets/missing.js');");assert.throws(()=>auditPackage(f.dir),/WEB_ASSET_MISSING/);}finally{f.close();}
});
test('CLI pin agrees with runtime executable and version',()=>{assert.equal(dingTalkPin.version,DINGTALK_VERSION);assert.equal(dingTalkPin.executableSHA256,DINGTALK_SHA256);assert.equal(dingTalkPin.name,'dingtalk-workspace-cli');});
test('dependency audit rejects an accidental ancestor fallback outside the bundle',()=>{
 const f=fixture();try{f.write('module/package.json',{dependencies:{fixture:'1.0.0'}});f.write('module/host.js',"import 'fixture';");f.write('node_modules/fixture/package.json',{name:'fixture',version:'1.0.0'});assert.throws(()=>auditPackage(f.dir+'/module',{checkInstalled:true,dependencyRoot:f.dir+'/module/node_modules'}),/DEPENDENCY_OUTSIDE_BUNDLE/);}finally{f.close();}
});
test('archive tampering is rejected before extraction or installation',async()=>{
 const f=fixture();try{const archive=f.write('bad.tgz','untrusted');assert.throws(()=>verifyDingTalkArchive(Buffer.from('bad')),/TARBALL_INTEGRITY/);await assert.rejects(stageDingTalk(f.dir+'/target',{archive,cache:f.dir+'/cache',download(){throw Error('NO_NETWORK');}}),/TARBALL_INTEGRITY/);assert(!fs.existsSync(f.dir+'/target'));}finally{f.close();}
});
test('CLI environment is employee-local, strips inherited credentials and disables updates/tracking/global skills',()=>{
 const home=path.join(os.tmpdir(),'employee with spaces'),env=dingTalkEnvironment(home,{SystemRoot:'C:/Windows',PATH:'system',DWS_TOKEN:'s',dws_client_secret:'s',DINGTALK_TOKEN:'s',OPENAI_API_KEY:'s',DWS_CONFIG_DIR:'developer',DWS_TRUSTED_DOMAINS:'evil'});
 assert.deepEqual(Object.keys(env).sort(),['DWS_CONFIG_DIR','DWS_NO_SKILLS','DWS_NO_UPDATE_CHECK','DWS_USAGE_TRACKING','PATH','SystemRoot'].sort());assert.equal(env.DWS_CONFIG_DIR,path.join(home,'integrations/dingtalk'));assert.equal(env.DWS_USAGE_TRACKING,'0');assert.throws(()=>dingTalkEnvironment('relative'),/PROFILE_REQUIRED/);
});
test('runtime resolver refuses unsupported targets, foreign packages, installers and corrupt binaries',()=>{
 const f=fixture();try{const manifestPath=f.write('package.json',{name:dingTalkPin.name,version:DINGTALK_VERSION});assert.throws(()=>resolveDingTalk({manifestPath,platform:'linux'}),/PLATFORM_NOT_BUNDLED/);f.write('package.json',{name:'dingtalk-cli',version:DINGTALK_VERSION});assert.throws(()=>resolveDingTalk({manifestPath}),/BUNDLE_INVALID/);f.write('package.json',{name:dingTalkPin.name,version:DINGTALK_VERSION,scripts:{postinstall:'evil'}});assert.throws(()=>resolveDingTalk({manifestPath}),/BUNDLE_INVALID/);f.write('package.json',{name:dingTalkPin.name,version:DINGTALK_VERSION});f.write('vendor/dws.exe','MZ wrong binary');assert.throws(()=>resolveDingTalk({manifestPath}),/CHECKSUM_MISMATCH/);}finally{f.close();}
});
test('missing bundle is not installation or authorization',async()=>{let called=false;const r=await dingTalkHealth({resolve(){throw Error('DINGTALK_BUNDLE_MISSING');},run(){called=true;}});assert.equal(r.installed,false);assert.equal(r.authorized,null);assert.equal(called,false);});
test('employee runtime never accepts a corrupt cached or source executable',()=>{
 const f=fixture();try{const bad=f.write('source.exe','MZ wrong');assert.throws(()=>materializeDingTalk({command:bad},f.dir+'/home'),/CHECKSUM_MISMATCH/);f.write('home/runtime/dingtalk/'+DINGTALK_VERSION+'/'+DINGTALK_SHA256+'/dws.exe','MZ altered');assert.throws(()=>materializeDingTalk({command:bad},f.dir+'/home'),/RUNTIME_CHECKSUM_MISMATCH/);}finally{f.close();}
});
test('employee runtime refuses junctions into another profile',()=>{
 const f=fixture();try{f.write('other/keep','preserved');fs.mkdirSync(f.dir+'/home');fs.symlinkSync(f.dir+'/other',f.dir+'/home/runtime','junction');assert.throws(()=>materializeDingTalk({command:'unused'},f.dir+'/home'),/RUNTIME_LINK_INVALID/);assert.equal(fs.readFileSync(f.dir+'/other/keep','utf8'),'preserved');fs.unlinkSync(f.dir+'/home/runtime');}finally{f.close();}
});
test('readonly probe uses exactly fixed local command and never infers remote permission or leaks vendor fields',async()=>{
 for(const authenticated of [true,false]){const result=await dingTalkHealth({home:'unused',runtime:{version:DINGTALK_VERSION},run:async(_runtime,args)=>{assert.deepEqual(args,['auth','status','--readonly','--format','json']);return {code:0,output:JSON.stringify({success:true,authenticated,token:'never-return',email:'private'})};}});assert.equal(result.installed,true);assert.equal(result.healthy,true);assert.equal(result.authorized,authenticated);assert.equal(result.connected,null);assert.equal(result.networkVerified,false);assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('never-return'));}
});
test('malformed and failed auth probes remain unknown, not uninstalled or connected',async()=>{
 for(const value of [{code:1,output:'secret'},{code:0,output:'no json'},{code:0,output:'{"success":true}'}]){const r=await dingTalkHealth({runtime:{version:DINGTALK_VERSION},run:async()=>value});assert.equal(r.installed,true);assert.equal(r.healthy,false);assert.equal(r.authorized,null);assert.equal(r.connected,null);assert(!JSON.stringify(r).includes('secret'));}
});
test('capability inventory uses measured CLI state without inventing tool registration',async()=>{
 const c=new EmployeeCapabilities({ctx:{tools:{definitions:()=>[]}},browser:{health:async()=>({installed:true,healthy:true}),dispose:async()=>{}},desktop:()=>null,dingtalk:async()=>({installed:true,authorized:false,healthy:true,reasonCode:'DINGTALK_LOGIN_REQUIRED'})});try{await c.refresh();const v=c.read('bot').records.find(r=>r.id==='dingtalk');assert.equal(v.installed,true);assert.equal(v.authorized,false);assert.equal(v.connected,null);}finally{await c.close();}
});
test('runtime scan rejects credential files, sessions, device keys and browser state at any depth',()=>{
 for(const p of ['.env','a/.env.local','a/.credentials.yaml','a/Login Data','a/Local State','a/device-private-key.json','a/key.pem','a/employee.sqlite','sessions/x.json','logs/test.log','node_modules/a/.dsh/x'])assert.throws(()=>scanRuntimeInventory([{path:p}]),/PRIVATE_FILE/);
 assert.equal(scanRuntimeInventory([{path:'node_modules/zod/package.json'},{path:'defaults/home.yml'},{path:'node_modules/cli/LICENSE'}]).forbiddenPaths,0);
});
test('runtime staging rejects unrelated and symlink targets before modifying data',async()=>{
 const f=fixture();try{const original=f.write('unrelated/keep.txt','preserved');await assert.rejects(prepareRuntime({root:f.dir,target:f.dir+'/unrelated'}),/TARGET_INVALID/);f.write('runtime/backend/keep.txt','preserved');await assert.rejects(prepareRuntime({root:f.dir,target:f.dir+'/runtime/backend'}),/TARGET_NOT_OWNED/);assert.equal(fs.readFileSync(original,'utf8'),'preserved');}finally{f.close();}
});

// Packaged linked services resolve the shipped CLI without installing anything into the legacy root.
test('explicit managed bundle manifest remains pinned and rejects relative/foreign overrides',()=>{const f=fixture();try{assert.throws(()=>resolveDingTalk({environment:{NAUMI_DINGTALK_MANIFEST:'relative/package.json'}}),/BUNDLE_INVALID/);const manifestPath=f.write('package.json',{name:'dingtalk-cli',version:DINGTALK_VERSION});assert.throws(()=>resolveDingTalk({environment:{NAUMI_DINGTALK_MANIFEST:manifestPath}}),/BUNDLE_INVALID/);}finally{f.close();}});
