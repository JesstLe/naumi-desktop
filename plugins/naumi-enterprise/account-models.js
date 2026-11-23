import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {LlmError,resolveRetryPolicy,resolveImageAttachmentAccess} from '@deepseek-ai/dsh-llm';
import {PiAiAdapter} from '@deepseek-ai/dsh-llm-pi-ai';
import {createProvider,envApiKeyAuth,InMemoryCredentialStore,defaultProviderAuthContext} from '@earendil-works/pi-ai';
import {openAICompletionsApi} from '@earendil-works/pi-ai/api/openai-completions.lazy';
import {openAIResponsesApi} from '@earendil-works/pi-ai/api/openai-responses.lazy';
import {anthropicMessagesApi} from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
const NO_RETRY=resolveRetryPolicy({mode:'normal',maxRetries:0},'naumi-account-models');
const fail=code=>{throw new LlmError(code,code);};
export function accountProfiles(value){
 return new Map(value.routes.map(r=>{const m={...r.model,provider:r.provider,baseUrl:r.baseURL,api:r.api,reasoning:r.model.reasoning??false,cost:r.model.cost??{input:0,output:0,cacheRead:0,cacheWrite:0}},api=({'openai-completions':openAICompletionsApi,'openai-responses':openAIResponsesApi,'anthropic-messages':anthropicMessagesApi})[r.api];
 if(!api)fail('ACCOUNT_MODEL_PROTOCOL_INVALID');
 const piProvider=createProvider({id:r.provider,name:r.group,baseUrl:r.baseURL,models:[m],auth:{apiKey:envApiKeyAuth('Naumi account credential',[])},api:api()});
 return[r.provider,{provider:r.provider,displayName:r.group,api:r.api,baseURL:r.baseURL,streamIdleTimeoutMs:300000,maxRequestImageBytes:8*1024*1024,maxRequestImages:15,imageOffloadCountQuantum:5,requestImagePixelBudget:4194304,requestImageMaxBytes:1048576,retryPolicy:NO_RETRY,piProvider,modelErrors:new Map(),configuredMaxTokens:new Map([[m.id,m.maxTokens]])}];}));
}
export class AccountModels{
 constructor({initial,home,request=fetch,clock=Date.now,onChange=()=>{}}){Object.assign(this,{value:initial,home,request,clock,onChange});this.flight=null;this.enabled=true;this.lastRefresh=clock();}
 allowed(v){return !!v&&this.value.routes.some(r=>r.provider===v.provider&&r.model.id===v.model);}
 select(agent){const v=agent.model.current();if(!this.allowed(v)){const r=this.value.routes.find(r=>r.model.id===v?.model)??this.value.routes[0];if(r)agent.model.select({provider:r.provider,model:r.model.id});}}
 async refresh(){if(this.value.expiresAt>this.clock()+5000&&this.clock()-this.lastRefresh<60000)return this.value;if(this.flight)return this.flight;const f=(async()=>{const file=path.join(this.home,'naumi-desktop-bridge.json');if(!fs.existsSync(file)){if(this.value.expiresAt>this.clock())return this.value;fail('ACCOUNT_MODEL_CREDENTIAL_EXPIRED');}
 if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>65536)fail('ACCOUNT_MODEL_BRIDGE_INVALID');const d=JSON.parse(fs.readFileSync(file));if(d.version!==1||!Number.isInteger(d.port)||d.port<1||d.port>65535||!/^[a-f0-9]{64}$/.test(d.token))fail('ACCOUNT_MODEL_BRIDGE_INVALID');
 const res=await this.request(`http://127.0.0.1:${d.port}/models/bootstrap`,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+d.token},signal:AbortSignal.timeout(12000)});let text=await res.text();if(text.length>524288)fail('ACCOUNT_MODEL_RESPONSE_INVALID');let v;try{v=JSON.parse(text);}catch{fail('ACCOUNT_MODEL_RESPONSE_INVALID');}if(!res.ok||!v.ok)fail(/^ACCOUNT_MODEL_[A-Z_]+$/.test(v.error)?v.error:'ACCOUNT_MODEL_UNAVAILABLE');v=v.data;
 if(!v||v.subject!==this.value.subject||v.deviceId!==this.value.deviceId||v.revision<this.value.revision||v.expiresAt<=this.clock())fail('ACCOUNT_MODEL_RESPONSE_INVALID');const changed=JSON.stringify(this.value.routes)!==JSON.stringify(v.routes);this.value=v;this.lastRefresh=this.clock();if(changed)this.onChange();return v;
 })();this.flight=f;try{return await f;}finally{if(this.flight===f)this.flight=null;}}
}
export function createAccountAdapter(ctx,client){return new PiAiAdapter({profiles:()=>accountProfiles(client.value),resolveApiKey:async()=>{await client.refresh();return client.value.token;},auth:{credentials:new InMemoryCredentialStore(),authContext:defaultProviderAuthContext()},prepareHeaders:(_req,headers)=>{headers.set('X-Naumi-Device',client.value.deviceId);headers.set('X-Naumi-Request-Id',randomUUID());return headers;},resolveAttachments:()=>ctx.get('attachments'),resolveImageAccess:(attachments,ref)=>resolveImageAttachmentAccess(attachments,p=>ctx.get('fs')?.processPathFromHostPath(p),ref)});}
export function installAccountModels(ctx,{config=process.env.NAUMI_ACCOUNT_MODELS_CONFIG,home=process.env.DSH_HOME}={}){
 if(!config)return;if(fs.lstatSync(config).isSymbolicLink()||fs.statSync(config).size>524288)fail('ACCOUNT_MODEL_CONFIG_INVALID');const initial={...JSON.parse(fs.readFileSync(config)),token:process.env.NAUMI_ACCOUNT_MODELS_TOKEN};delete process.env.NAUMI_ACCOUNT_MODELS_CONFIG;delete process.env.NAUMI_ACCOUNT_MODELS_TOKEN;
 return ctx.inject(['llm','agents','agentDefaultModel'],scope=>{
 const client=new AccountModels({initial,home}),adapter=createAccountAdapter(scope,client);scope.provide('naumiAccountModels',client);let registration;
 const register=()=>{const ids=client.value.routes.map(r=>r.provider);if(registration)registration.replace(ids);else registration=scope.llm.registerAdapter(ids,adapter);};client.onChange=register;register();scope.effect(()=>()=>{client.onChange=()=>{};registration?.();});
 scope.on('agent/created',({agent})=>client.select(agent));scope.on('ready',async()=>{const current=scope.agentDefaultModel.currentSelection();if(!client.allowed(current)){const r=client.value.routes.find(r=>r.model.id===current?.model)??client.value.routes[0];await scope.agentDefaultModel.saveSelection({provider:r.provider,model:r.model.id});}for(const a of scope.agents.list())client.select(a);});
 scope.on('llm/stream',async function*(options,next){await client.refresh();if(!client.allowed(options))fail('ACCOUNT_MODEL_ROUTE_DENIED');yield* next();});
 const timer=setInterval(()=>client.refresh().catch(()=>{}),60000);timer.unref?.();scope.effect(()=>()=>clearInterval(timer));
 });
}
