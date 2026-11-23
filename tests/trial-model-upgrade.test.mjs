import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import * as pi from '@deepseek-ai/dsh-llm-pi-ai';
import {ModelPolicy,modelPolicyPlan,modelPolicyRecovery,LUNA_TERRA_PROVIDER} from '../plugins/naumi-enterprise/model-policy.js';
import {ModelConnections} from '../plugins/naumi-enterprise/model-connections.js';

const trials=JSON.parse(fs.readFileSync(new URL('./fixtures/distributed-trial-models.json',import.meta.url)));
function fixture(shape='r2',options={}){
 let providers=structuredClone(trials[shape]),revision=0,writes=0,selection={provider:Object.keys(providers)[0],model:Object.values(providers)[0].models[0].id};const backups=[],requests=[];
 const ctx={settings:{writable:true,describe:()=>[{ns:'llm-pi-ai',revision,value:{providers:structuredClone(providers)},user:{providers:structuredClone(providers)}}],async mutate(ns,ops,expected){assert.equal(ns,'llm-pi-ai');if(expected!==revision)throw Object.assign(Error('SETTINGS_CONFLICT'),{code:'SETTINGS_CONFLICT'});for(const op of ops){if(op.path.length===1)providers=structuredClone(op.value);else if(op.op==='unset')delete providers[op.path[1]];else providers[op.path[1]]=structuredClone(op.value);}revision++;writes++;}},credentials:{describe:async ref=>({configured:!options.missingKey?.(ref)}),resolve:async ref=>({value:'fixture-key-for-'+ref})},agentDefaultModel:{currentSelection:()=>selection,saveSelection:async s=>{selection=s;}}};
 const discover=options.discover??(async input=>{requests.push(input);return {models:[{id:'gpt-6-luna'}]};});
 const policy=new ModelPolicy(ctx,{discover,backup:async v=>backups.push(structuredClone(v))});ctx.get=k=>k==='naumiModelPolicy'?policy:undefined;
 return {ctx,policy,backups,requests,get providers(){return providers;},set providers(p){providers=p;},get writes(){return writes;},get revision(){return revision;},concurrentWrite(){revision++;},get selection(){return selection;}};
}

test('real first distributed schema already contains required IDs and does not probe',async()=>{
 const f=fixture('first');await f.policy.apply();assert.equal(f.policy.state.ready,true);assert.equal(f.requests.length,0);assert.equal(Object.values(f.providers).flatMap(p=>p.models).length,3);assert.equal(f.writes,1);assert.deepEqual(f.policy.state.missing,[]);
});
test('real r2 schema reproduces strict 046 failure, then authenticated catalog adds exact missing declaration in one CAS',async()=>{
 const f=fixture(),before=structuredClone(f.providers);assert.throws(()=>modelPolicyPlan(before),e=>e.code==='MODEL_POLICY_SOURCE_REQUIRED'&&e.missing[0]==='gpt-6-luna');await f.policy.apply();
 assert.equal(f.policy.state.ready,true);assert.deepEqual(f.policy.state.missing,[]);assert.equal(f.writes,1);assert.deepEqual(f.backups[0].providers,before);
 const group=f.providers['ccs-codex-gpt-2f6b6a'];assert.equal(group.apiKeyEnv,before['ccs-codex-gpt-2f6b6a'].apiKeyEnv);assert.equal(group.baseURL,before['ccs-codex-gpt-2f6b6a'].baseURL);assert.equal(group.models[0].id,'gpt-6-luna');assert.equal(f.providers[LUNA_TERRA_PROVIDER].apiKeyEnv,group.apiKeyEnv);
 await f.policy.apply();assert.equal(f.writes,1);assert.equal(f.backups.length,1);
});
test('catalog authentication/network/timeout failures keep Flash usable, retain dormant source, and retry recovers without legacy choices',async()=>{
 for(const code of['MODEL_DISCOVERY_AUTH','MODEL_DISCOVERY_FAILED','MODEL_DISCOVERY_TIMEOUT']){
  let online=false;const f=fixture('r2',{discover:async()=>{if(!online)throw Object.assign(Error(code),{code});return{models:[{id:'gpt-6-luna'}]};}});await f.policy.apply();assert.equal(f.policy.state.ready,true);assert.deepEqual(f.policy.state.missing,['gpt-6-luna']);assert(!f.providers['ccs-codex-gpt-2f6b6a']);assert.equal(Object.values(f.providers).flatMap(p=>p.models).length,1);f.policy.assert(f.selection);
  assert.throws(()=>f.policy.assert({provider:'ccs-codex-gpt-2f6b6a',model:'gpt-6.1-sol'}),/MODEL_POLICY_MODEL_DENIED/);
  const api=new ModelConnections(f.ctx),partial=await api.read();assert.equal(partial.models.length,1);assert.equal(partial.writable,false);
  online=true;const ready=await api.execute({action:'retry-policy'});assert.equal(ready.managedPolicy.missingCount,0);assert.equal(ready.models.length,3);assert.equal(f.writes,2);
 }
});
test('a similarly named catalog model never qualifies or silently replaces requested model',async()=>{
 const f=fixture('r2',{discover:async()=>({models:[{id:'gpt-6-luna-preview'},{id:'gpt-6.1-sol'}]})});await f.policy.apply();assert.deepEqual(f.policy.state.missing,['gpt-6-luna']);assert(!f.policy.state.models.some(m=>m.id.startsWith('gpt-')));
});
test('missing credential affects only its source; preserved ref recovers after credentials return',async()=>{
 let missing=true;const f=fixture('r2',{missingKey:ref=>missing&&ref==='FIXTURE_R2_0',discover:async p=>({models:p.id==='ccs-codex-gpt-2f6b6a'?[{id:'gpt-6-luna'}]:[]})});await f.policy.apply();assert.equal(f.policy.state.ready,true);assert.equal(f.policy.state.models.length,1);missing=false;await f.policy.apply();assert.equal(f.policy.state.models.length,3);
});
test('Luna remains usable when Flash source is unavailable and default selects actual available model',async()=>{
 const f=fixture('first',{missingKey:ref=>ref==='FIXTURE_FIRST_4',discover:async()=>({models:[]})});
 // Mark every Flash-bearing route unavailable without guessing the fixture order.
 const refs=new Set(Object.values(f.providers).filter(p=>p.models.some(m=>m.id==='deepseek-flash')).map(p=>p.apiKeyEnv));f.ctx.credentials.describe=async ref=>({configured:!refs.has(ref)});
 await f.policy.apply();assert.equal(f.policy.state.ready,true);assert.deepEqual(f.policy.state.missing,['deepseek-flash']);assert.equal(f.selection.model,'gpt-6-luna');f.policy.assert(f.selection);
});
test('no allowed sources never mutates original config or fabricates ready',async()=>{
 const f=fixture('r2',{discover:async()=>({models:[]})});for(const p of Object.values(f.providers))p.models=[{id:'unrelated'}];const before=structuredClone(f.providers);await assert.rejects(f.policy.apply(),/MODEL_POLICY_SOURCE_REQUIRED/);assert.equal(f.writes,0);assert.deepEqual(f.providers,before);assert.equal(f.policy.state.ready,false);
});
test('concurrent settings writer during discovery wins; no overwrite; manual retry uses latest revision',async()=>{
 let f,once=true;f=fixture('r2',{discover:async()=>{if(once){once=false;f.concurrentWrite();}return {models:[{id:'gpt-6-luna'}]};}});const before=structuredClone(f.providers);await assert.rejects(f.policy.apply(),/SETTINGS_CONFLICT/);assert.deepEqual(f.providers,before);assert.equal(f.writes,0);await f.policy.apply();assert.equal(f.policy.state.ready,true);
});
test('concurrent retries serialize to a single durable migration and no arbitrary managed edits are admitted',async()=>{
 const f=fixture();await Promise.all([f.policy.apply(),f.policy.apply(),f.policy.apply()]);assert.equal(f.writes,1);const api=new ModelConnections(f.ctx);await assert.rejects(api.execute({action:'retry-policy',providers:{evil:{}}}),/MODEL_POLICY_MANAGED/);await assert.rejects(api.execute({action:'save'}),/MODEL_POLICY_MANAGED/);
});
test('real bounded HTTP discovery reuses only each saved route credential; no key writes and no inference',async()=>{
 const requests=[];const server=http.createServer((req,res)=>{requests.push({path:req.url,key:req.headers['x-api-key']});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:'gpt-6-luna',input_modalities:['text','image']}],has_more:false}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const f=fixture();for(const p of Object.values(f.providers))p.baseURL='http://127.0.0.1:'+server.address().port;const service=new ModelPolicy(f.ctx,{backup:async()=>{}});await service.apply();assert.equal(service.state.models.length,3);assert(requests.length>0&&requests.length<=2);assert(requests.every(r=>r.path==='/v1/models'&&r.key.startsWith('fixture-key-for-FIXTURE_R2_')));assert(!requests.some(r=>r.path.includes('messages')));}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('startup discovery caps candidates and preserves undiscovered source references for later recovery',async()=>{
 const f=fixture();f.providers=Object.fromEntries(Array.from({length:20},(_,i)=>['route-'+i,{...structuredClone(Object.values(trials.r2)[0]),models:i===0?[{id:'deepseek-flash'}]:[{id:'old'}]}]));f.policy.discover=async input=>{f.requests.push(input);return{models:[]};};await f.policy.apply();assert.equal(f.requests.length,8);assert.equal(Object.keys(f.providers).length,1);assert.equal(Object.keys(f.policy.recovery.read().providers).length,19);assert.equal(f.policy.state.models.length,1);
});

test('partial plan satisfies real native provider validation; empty custom provider is rejected',async()=>{
 const f=fixture('r2',{discover:async()=>({models:[]})});await f.policy.apply();const ctx=new Context();let adapter;const host=ctx.plugin({apply(s){s.provide('llm',{registerConfigurableProviders:()=>({replace(){}}),registerModelDiscovery:()=>()=>{},registerAdapter:(_r,a)=>{adapter=a;return{replace(){}};}});s.provide('credentials',{resolve:async()=>({value:'fixture-only'})});}});await host;let plugin;
 try{plugin=ctx.plugin(pi,{providers:f.providers});await plugin;const resolved=await adapter.resolveModel(f.selection.provider,f.selection.model);assert.equal(resolved.id,'deepseek-flash');}finally{await plugin?.dispose();await host.dispose();}
});
test('protected recovery journal survives service restart, guards concurrent edits, and clears only after complete CAS',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-policy-recovery-'));try{const f=fixture('r2',{discover:async()=>({models:[]})}),journal=modelPolicyRecovery(dir);f.policy.recovery=journal;await f.policy.apply();const pending=journal.read();assert.equal(Object.keys(pending.providers).length,1);assert.equal(Object.values(pending.providers)[0].apiKeyEnv,'FIXTURE_R2_0');assert(!JSON.stringify(pending).includes('fixture-key-for-'));
  assert.throws(()=>journal.write({},null),/MODEL_POLICY_RECOVERY_CONFLICT/);const restarted=new ModelPolicy(f.ctx,{recovery:modelPolicyRecovery(dir),discover:async()=>({models:[{id:'gpt-6-luna'}]}),backup:async()=>{}});await restarted.apply();assert.equal(restarted.state.models.length,3);assert.deepEqual(journal.read().providers,{});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
