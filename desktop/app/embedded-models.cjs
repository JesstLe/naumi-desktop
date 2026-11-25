'use strict';
// Explicitly authorized, temporary two-user distribution. Never an implicit credential export.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto'),{createRequire}=require('node:module');
const profile=require('./profile.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const REF=/^NAUMI_EMBEDDED_TEST_[A-F0-9]{24}$/;
const names=['claude fable5.2','gpt6.1sol','gpt6.1terra','claude opus5.5'];
function validate(v){
 if(v?.version===2&&v.mode==='bundled-release'){
  assert(/^[a-z0-9-]{1,100}$/.test(v.revision),'BUNDLED_CONFIG_INVALID');const rows=Object.entries(v.providers??{});assert(rows.length>0&&rows.length<=100,'BUNDLED_ROUTES_REQUIRED');const refs=new Set(),labels=new Set();
  for(const[id,p]of rows){assert(/^naumi-account-m-[a-f0-9]{24}$/.test(id)&&['anthropic-messages','openai-completions','openai-responses'].includes(p.api),'BUNDLED_ROUTE_INVALID');const u=new URL(p.baseURL);assert(!u.username&&!u.password&&!u.search&&!u.hash&&(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))&&!u.pathname.includes('/api/desktop-models'),'BUNDLED_DIRECT_URL_REQUIRED');assert(/^NAUMI_BUNDLED_[A-F0-9]{24}$/.test(p.apiKeyEnv)&&typeof v.refs?.[p.apiKeyEnv]==='string'&&v.refs[p.apiKeyEnv].length&&!/[\x00-\x1f\x7f]/.test(v.refs[p.apiKeyEnv]),'BUNDLED_KEY_INVALID');refs.add(p.apiKeyEnv);assert(p.models?.length===1,'BUNDLED_ONE_OPTION_PER_ROUTE');const m=p.models[0];assert(id==='naumi-account-'+m.id&&typeof m.name==='string'&&m.name.trim()&&!labels.has(m.name),'BUNDLED_MODEL_INVALID');labels.add(m.name);assert(Number.isSafeInteger(m.contextWindow)&&m.contextWindow>0&&Number.isSafeInteger(m.maxTokens)&&m.maxTokens>0&&m.maxTokens<m.contextWindow&&Array.isArray(m.input)&&m.input.length&&m.input.every(x=>['text','image'].includes(x)),'BUNDLED_CAPABILITY_REQUIRED');assert(typeof v.wireModels?.[id]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(v.wireModels[id]),'BUNDLED_WIRE_MODEL_REQUIRED');}
  assert(Object.keys(v.refs).length===refs.size&&Object.keys(v.refs).every(r=>refs.has(r))&&Object.keys(v.wireModels).length===rows.length&&Object.keys(v.wireModels).every(id=>Object.hasOwn(v.providers,id)),'BUNDLED_EXTRA_CONFIGURATION');return v;
 }

 assert(v?.version===1&&v.mode==='embedded-test'&&/^[a-z0-9-]{1,100}$/.test(v.revision),'EMBEDDED_CONFIG_INVALID');
 const rows=Object.entries(v.providers??{});assert(rows.length===4,'EMBEDDED_FOUR_ROUTES_REQUIRED');const labels=[];
 for(const[id,p]of rows){assert(/^[a-z][a-z0-9_-]{0,79}$/.test(id)&&['anthropic-messages','openai-completions','openai-responses'].includes(p.api),'EMBEDDED_ROUTE_INVALID');const u=new URL(p.baseURL);assert(!u.username&&!u.password&&!u.search&&!u.hash&&(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)),'EMBEDDED_URL_INVALID');assert(REF.test(p.apiKeyEnv)&&typeof v.refs?.[p.apiKeyEnv]==='string'&&v.refs[p.apiKeyEnv].length>0&&!/[\x00-\x1f\x7f]/.test(v.refs[p.apiKeyEnv]),'EMBEDDED_KEY_INVALID');assert(p.models?.length===1,'EMBEDDED_MODEL_INVALID');const m=p.models[0],expected={'claude fable5.2':'deepseek-flash','gpt6.1sol':'gpt-6-luna','gpt6.1terra':'gpt-6-luna','claude opus5.5':'claude-sonnet-5-5'};assert(expected[m.name]===m.id,'EMBEDDED_MODEL_INVALID');labels.push(m.name);}
 assert(JSON.stringify(labels.sort())===JSON.stringify([...names].sort()),'EMBEDDED_MODEL_SET_INVALID');const refs=new Set(rows.map(([,p])=>p.apiKeyEnv));assert(Object.keys(v.refs).length===refs.size&&Object.keys(v.refs).every(r=>refs.has(r)),'EMBEDDED_EXTRA_SECRET');return v;
}
function plain(file){for(let p=file;fs.existsSync(p);p=path.dirname(p)){assert(!fs.lstatSync(p).isSymbolicLink(),'EMBEDDED_LINK_REJECTED');if(p===path.dirname(p))break;}return file;}
function atomic(file,bytes){plain(file);fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}for(let i=0;;i++)try{fs.renameSync(temp,file);break;}catch(e){if(i===7||!['EPERM','EBUSY','EACCES'].includes(e.code))throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
const stateFile=home=>path.join(home,'desktop-embedded-models.json');
function recover(home){
 const f=stateFile(home);if(!fs.existsSync(f))return false;plain(f);const j=JSON.parse(fs.readFileSync(f));if(j.phase==='ready')return false;
 assert(j.version===1&&j.phase==='applying'&&j.home===path.resolve(home)&&/^[a-f0-9-]{36}$/.test(j.id),'EMBEDDED_JOURNAL_INVALID');
 for(const r of j.files){assert(['profiles/web/cordis.patch.yml','.credentials.yaml'].includes(r.relative),'EMBEDDED_JOURNAL_INVALID');const target=plain(path.join(home,r.relative)),actual=fs.existsSync(target)?sha(fs.readFileSync(target)):null;assert(actual===r.before||actual===r.after,'EMBEDDED_RECOVERY_DRIFT');}
 for(const r of j.files){const target=path.join(home,r.relative);if(r.before!==null){const source=plain(path.join(home,'embedded-model-backups',j.id,r.relative)),b=fs.readFileSync(source);assert(sha(b)===r.before,'EMBEDDED_BACKUP_INVALID');atomic(target,b);}else if(fs.existsSync(target))fs.unlinkSync(target);}
 if(j.previous)profile.atomic(f,j.previous);else fs.unlinkSync(f);return true;
}
function apply(settings,{payload,fault=()=>{}}={}){
 if(!settings.isolated&&!settings.linkedService)return {changed:false};
 const release=settings.releaseRoot??settings.root,manifest=JSON.parse(fs.readFileSync(path.join(release,'runtime-manifest.json')));
 recover(settings.home);if(!payload&&!manifest.embeddedModels&&!manifest.bundledModels)return {changed:false};
 if(!payload){assert(['embedded-test','bundled-models'].includes(manifest.edition)&&manifest.personalCredentials===true,'EMBEDDED_MANIFEST_INVALID');const bundled=!!manifest.bundledModels,file=plain(path.join(release,'defaults',bundled?'bundled-models.json':'embedded-models.json')),b=fs.readFileSync(file);assert(sha(b)===(manifest.bundledModels??manifest.embeddedModels).sha256,'EMBEDDED_RESOURCE_CHANGED');payload=JSON.parse(b);if(process.env.NAUMI_TEST==='1'&&process.env.NAUMI_EMBEDDED_TEST_FIXTURE)payload=JSON.parse(fs.readFileSync(process.env.NAUMI_EMBEDDED_TEST_FIXTURE));}
 const v=validate(payload),home=path.resolve(settings.home);plain(home);const yaml=createRequire(path.join(release,'package.json'))('yaml'),cfg=plain(path.join(home,'profiles/web/cordis.patch.yml')),cred=plain(path.join(home,'.credentials.yaml'));
 const beforeCfg=fs.readFileSync(cfg),beforeCred=fs.existsSync(cred)?fs.readFileSync(cred):null,doc=yaml.parseDocument(beforeCfg.toString()),secrets=yaml.parseDocument(beforeCred?.toString()??'version: 1\nrefs: {}\nrecords: {}\n');assert(!doc.errors.length&&!secrets.errors.length&&Array.isArray(doc.toJS()),'EMBEDDED_YAML_INVALID');assert(secrets.get('version')===1,'EMBEDDED_CREDENTIAL_SCHEMA');
 let idx=doc.toJS().findIndex(r=>r.id==='llm-pi-ai');if(idx<0){idx=doc.contents.items.length;doc.add(doc.createNode({id:'llm-pi-ai',config:{}}));}doc.setIn([idx,'config','providers'],v.providers);
 for(const[ref,key]of Object.entries(v.refs))secrets.setIn(['refs',ref],key);
 const nextCfg=Buffer.from(doc.toString()),nextCred=Buffer.from(secrets.toString()),receipt=stateFile(home),previous=fs.existsSync(receipt)?JSON.parse(fs.readFileSync(receipt)):null;
 if(beforeCfg.equals(nextCfg)&&beforeCred?.equals(nextCred)&&previous?.phase==='ready'&&previous.revision===v.revision)return {changed:false,revision:v.revision};
 const id=randomUUID(),files=[{relative:'.credentials.yaml',before:beforeCred?sha(beforeCred):null,after:sha(nextCred)},{relative:'profiles/web/cordis.patch.yml',before:sha(beforeCfg),after:sha(nextCfg)}];
 for(const[r,b]of [[files[0],beforeCred],[files[1],beforeCfg]])if(b){const target=plain(path.join(home,'embedded-model-backups',id,r.relative));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,b,{flag:'wx',mode:0o600});}
 profile.atomic(receipt,{version:1,phase:'applying',home,id,revision:v.revision,files,previous});
 try{fault('prepared');for(const[r,b]of [[files[0],nextCred],[files[1],nextCfg]]){const target=path.join(home,r.relative),actual=fs.existsSync(target)?sha(fs.readFileSync(target)):null;assert(actual===r.before,'EMBEDDED_TARGET_DRIFT');atomic(target,b);fault(r.relative);}profile.atomic(receipt,{version:1,phase:'ready',revision:v.revision,ownedRefs:[...new Set([...(previous?.ownedRefs??[]),...Object.keys(v.refs)])],providerIds:Object.keys(v.providers),backupId:id,configSHA256:sha(nextCfg)});return {changed:true,revision:v.revision,models:Object.values(v.providers).reduce((n,p)=>n+p.models.length,0)};}catch(e){recover(home);throw e;}
}
module.exports={validate,apply,recover,stateFile};
