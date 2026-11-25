import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {randomUUID} from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {gatewayTransport,gatewayFailure} from '../services/account-models/upstream.mjs';
import {accountModelServer} from '../services/account-models/server.mjs';import {AccountModelStore} from '../services/account-models/store.mjs';import {checkedRoutes} from '../services/account-models/registry.mjs';

test('upstream pool explicitly budgets 30s connection/TLS, uses ordinary Agent not RetryAgent, and leaves global fetch unchanged',async()=>{
 let options,closed=0,calls=0,forwarded;const global=globalThis.fetch,signal=new AbortController().signal;
 class Pool{constructor(v){options=v;}close(){closed++;}}
 const t=gatewayTransport({AgentClass:Pool,request:async(url,input)=>{calls++;forwarded={url,input};return Response.json({ok:true});}});
 const body='synthetic body';await t.request('https://fixture.example/v1/chat/completions',{method:'POST',body,signal,redirect:'error'});
 assert.equal(options.connectTimeout,30000);assert.equal(options.autoSelectFamily,true);assert.equal(options.headersTimeout,300000);assert.equal(options.connections,4);assert.equal(options.pipelining,1);assert.equal(options.allowH2,false);assert(!('rejectUnauthorized' in options));assert.equal(globalThis.fetch,global);assert.equal(forwarded.input.body,body);assert.equal(forwarded.input.signal,signal);assert.equal(forwarded.input.redirect,'error');assert.equal(calls,1);await t.close();assert.equal(closed,1);
});

test('connection failure is one POST attempt, never an alternate endpoint or implicit retry',async()=>{
 let calls=0;const t=gatewayTransport({AgentClass:class{close(){}},request:async()=>{calls++;throw new TypeError('PRIVATE_URL_TOKEN',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});}});
 await assert.rejects(t.request('https://fixture.example/v1/chat/completions',{method:'POST',body:'PRIVATE_PROMPT'}));assert.equal(calls,1);await t.close();
});

test('typed failure traverses bounded nested causes but whitelists only codes, request identity, stage and elapsed time',()=>{
 const e=new TypeError('PRIVATE_URL PRIVATE_KEY',{cause:new AggregateError([Object.assign(Error('PRIVATE_BODY'),{code:'ENETUNREACH'}),{code:'UND_ERR_CONNECT_TIMEOUT',message:'PRIVATE_AUTH'}])});e.stack='PRIVATE_STACK';
 const v=gatewayFailure(e,{requestId:randomUUID(),stage:'upstream-connect',elapsedMs:10010});assert.equal(v.status,504);assert.equal(v.code,'ACCOUNT_MODEL_UPSTREAM_TIMEOUT');assert.deepEqual(v.record.causeCodes,['ENETUNREACH','UND_ERR_CONNECT_TIMEOUT']);assert(!JSON.stringify(v).includes('PRIVATE_'));assert.equal(v.record.automaticRetry,false);
});

test('certificate failures retain verification, resets/client disconnect/known upstream rejection remain distinct',()=>{
 for(const code of ['CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE'])assert.equal(gatewayFailure({cause:{code}},{stage:'upstream-connect'}).code,'ACCOUNT_MODEL_UPSTREAM_TLS_FAILED');
 assert.equal(gatewayFailure({cause:{code:'ECONNRESET'}},{stage:'upstream-connect'}).code,'ACCOUNT_MODEL_UPSTREAM_CONNECTION_FAILED');assert.equal(gatewayFailure(Error('abort'),{stage:'upstream-stream',clientAborted:true}).code,'ACCOUNT_MODEL_CLIENT_DISCONNECTED');
 assert.equal(gatewayFailure(Object.assign(Error('ACCOUNT_MODEL_UPSTREAM_REJECTED'),{status:502}),{stage:'upstream-headers'}).status,502);
 const cyclic={code:'ECONNREFUSED'};cyclic.cause=cyclic;assert.equal(gatewayFailure(cyclic,{stage:'upstream-connect'}).code,'ACCOUNT_MODEL_UPSTREAM_CONNECTION_FAILED');
});

async function fixture({mode='connect',diagnosticThrows=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-availability-')),store=new AccountModelStore(path.join(dir,'db.sqlite')),subject='synthetic@example.test',device='a'.repeat(64),route=checkedRoutes([{id:'synthetic-route',api:'openai-completions',baseURL:'https://fixture.example/v1',providerId:'PRIVATE_PROVIDER',credentialRef:'PRIVATE_REF',model:{id:'PRIVATE_WIRE_MODEL',name:'Display model',input:['text'],contextWindow:128000,maxTokens:128}}])[0];
 store.save('owner',{subject:null,expectedRevision:0,operationId:randomUUID(),enabled:true,routes:[route.id]},[route.id],{defaults:true});const lease=store.authorize(subject,device,[route]);let calls=0;const records=[];
 const server=accountModelServer({store,origin:'http://127.0.0.1',authenticate:async()=>({subject}),registry:{list:async()=>[route],secret:async()=> 'PRIVATE_CREDENTIAL'},diagnostic:v=>{records.push(v);if(diagnosticThrows)throw Error('logging failed');},request:async()=>{calls++;if(mode==='connect')throw new TypeError('PRIVATE_URL',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});if(mode==='reject')return new Response('PRIVATE_BODY',{status:401});if(mode==='reset')throw new TypeError('PRIVATE_AUTH',{cause:{code:'ECONNRESET'}});return new Response('data: {"error":"PRIVATE_BODY"}\n\n',{headers:{'Content-Type':'text/event-stream'}});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/desktop-models/v1/gateway/'+route.id+'/chat/completions',id=randomUUID(),options={method:'POST',headers:{Authorization:'Bearer '+lease.token,'x-naumi-device':device,'x-naumi-request-id':id,'Content-Type':'application/json'},body:JSON.stringify({model:route.model.id,stream:true,max_tokens:64,messages:[{role:'user',content:'PRIVATE_PROMPT'}]})};
 return {store,records,id,get calls(){return calls;},post:()=>fetch(url,options),async close(){server.closeAllConnections();await new Promise(r=>server.close(r));store.close();fs.rmSync(dir,{recursive:true,force:true});}};
}

test('real HTTP timeout returns typed 504+UUID, preserves UNKNOWN and same UUID replay is 409 with one dispatch',async()=>{
 const f=await fixture();try{const r=await f.post(),v=await r.json();assert.equal(r.status,504);assert.deepEqual(v,{error:'ACCOUNT_MODEL_UPSTREAM_TIMEOUT',requestId:f.id});assert.equal(r.headers.get('x-naumi-request-id'),f.id);assert.equal(f.store.db.prepare('SELECT state FROM requests WHERE id=?').get(f.id).state,'unknown');assert.equal((await f.post()).status,409);assert.equal(f.calls,1);assert.equal(f.records.length,1);assert.equal(f.records[0].stage,'upstream-connect');assert(!JSON.stringify(f.records).includes('PRIVATE_'));}finally{await f.close();}
});

test('diagnostic sink failure never replaces receipt/status, upstream rejection remains rejected not falsely unknown',async()=>{
 for(const mode of ['connect','reject','reset']){const f=await fixture({mode,diagnosticThrows:true});try{const r=await f.post();await r.text();assert.equal(r.status,mode==='connect'?504:mode==='reject'?502:503);assert.equal(f.store.db.prepare('SELECT state FROM requests WHERE id=?').get(f.id).state,mode==='reject'?'rejected':'unknown');assert.equal(f.calls,1);}finally{await f.close();}}
});

test('invalid stream is not retried or rewritten into successful completion',async()=>{
 const f=await fixture({mode:'stream'});try{const r=await f.post().catch(()=>null);if(r)await r.text().catch(()=>{});assert.equal(f.store.db.prepare('SELECT state FROM requests WHERE id=?').get(f.id).state,'unknown');assert.equal(f.calls,1);assert.equal(f.records[0].stage,'upstream-stream');assert.equal((await f.post()).status,409);}finally{await f.close();}
});
