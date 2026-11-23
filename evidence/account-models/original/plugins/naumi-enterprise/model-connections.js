import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {officialModelSpecs,modelSpecView,configureModelSpec,refreshModelSpecs} from './model-specs.js';

import {reasoningLevels,configureReasoning,reasoningView,validateDefault} from './model-reasoning.js';

const protocols=['openai-completions','openai-responses','anthropic-messages'];
const effortMap=z.record(z.string(),z.union([z.string().min(1).max(40),z.null()]));
const modelInput=z.array(z.enum(['text','image'])).min(1).max(2).refine(v=>new Set(v).size===v.length);
const model=z.object({id:z.string().trim().min(1).max(512),input:z.union([modelInput,z.null()]).optional(),reasoningPreset:z.enum(['inherit','disabled','official','custom']).optional(),reasoningEfforts:z.union([z.literal(false),effortMap]).optional(),reasoningMode:z.enum(['native','adaptive','budget']).optional(),name:z.string().trim().max(160).optional(),contextWindow:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),maxTokens:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional()}).strict();
const save=z.object({action:z.literal('save'),id:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),expectedRevision:z.number().int().nonnegative(),displayName:z.string().trim().min(1).max(120),baseURL:z.string().trim().min(1).max(2048),api:z.enum(protocols),reasoning:z.enum(reasoningLevels).nullable().optional(),models:z.array(model).min(1).max(200),apiKey:z.string().trim().min(1).max(16000).optional()}).strict();
const remove=z.object({action:z.literal('remove'),id:z.string().min(1).max(80),expectedRevision:z.number().int().nonnegative()}).strict();
const refresh=z.object({action:z.literal('refresh-specs'),expectedRevision:z.number().int().nonnegative()}).strict();
const discover=z.object({action:z.literal('discover'),id:z.string().min(1).max(80).optional(),baseURL:z.string().trim().min(1).max(2048),api:z.enum(protocols),apiKey:z.string().trim().min(1).max(16000).optional()}).strict();
const error=(code,status=400)=>Object.assign(new Error(code),{code,status});
export function endpoint(value){
 let u;try{u=new URL(value);}catch{throw error('MODEL_URL_INVALID');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||/\/(?:chat\/completions|responses|messages)\/?$/.test(u.pathname))throw error('MODEL_URL_INVALID');
 return u.href.replace(/\/+$/,'');
}
const unconfigured={provider:'naumi-custom',model:'configure-model'};
const official=id=>['deepseek-official','deepseek-account'].includes(id);

/** Settings own route configuration; the existing local credential service alone owns secrets.
 * A rotated key gets a fresh reference, so a failed CAS never changes a working route's key.
 */
export class ModelConnections{
 constructor(ctx,{request=fetch,timeoutMs=12000}={}){this.ctx=ctx;this.queue=Promise.resolve();this.request=request;this.timeoutMs=timeoutMs;this.discoveries=0;}
 async discover(input,{signal}={}){
  const parsed=discover.safeParse(input);if(!parsed.success)throw error('MODEL_INVALID_REQUEST');const p=parsed.data,base=endpoint(p.baseURL);
  const previous=p.id?this.namespace().value.providers?.[p.id]:undefined;
  // A saved credential is reusable only for the same origin, never for a newly typed host.
  if(!p.apiKey&&previous?.apiKeyEnv&&new URL(endpoint(previous.baseURL)).origin!==new URL(base).origin)throw error('MODEL_DISCOVERY_KEY_ORIGIN_CHANGED');
  const key=p.apiKey??(previous?.apiKeyEnv?(await this.ctx.credentials.resolve(previous.apiKeyEnv))?.value:undefined);
  if(!key)throw error('MODEL_KEY_REQUIRED');if(/[\r\n\u0000-\u001f\u007f]/.test(key))throw error('MODEL_KEY_INVALID');
  if(this.discoveries>=3)throw error('MODEL_DISCOVERY_BUSY',429);
  this.discoveries++;const timeout=AbortSignal.timeout(this.timeoutMs),combined=AbortSignal.any([timeout,...signal?[signal]:[]]);
  const headers={accept:'application/json',...p.api==='anthropic-messages'?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{authorization:'Bearer '+key}};
  const suffixes=/\/v1$/.test(new URL(base).pathname)?['/models']:p.api==='anthropic-messages'?['/v1/models','/models']:['/models','/v1/models'];
  const models=new Map();let url=new URL(base+suffixes[0]),bytes=0;
  try{
   for(let page=0;page<10;page++){
    let response=await this.request(url,{method:'GET',headers,redirect:'manual',credentials:'omit',signal:combined});
    if(page===0&&[404,405].includes(response.status)&&suffixes.length>1){await response.body?.cancel();url=new URL(base+suffixes[1]);response=await this.request(url,{method:'GET',headers,redirect:'manual',credentials:'omit',signal:combined});}
    if(!response.ok){await response.body?.cancel();throw error([401,403].includes(response.status)?'MODEL_DISCOVERY_AUTH':response.status===404||response.status===405?'MODEL_DISCOVERY_UNSUPPORTED':response.status===429?'MODEL_DISCOVERY_RATE_LIMITED':response.status>=300&&response.status<400?'MODEL_DISCOVERY_REDIRECT':'MODEL_DISCOVERY_FAILED',502);}
    const reader=response.body?.getReader();if(!reader)throw error('MODEL_DISCOVERY_INVALID',502);const chunks=[];
    try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1048576)throw error('MODEL_DISCOVERY_TOO_LARGE',502);chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw error('MODEL_DISCOVERY_INVALID',502);}
    if(!Array.isArray(body?.data)||body.has_more!==undefined&&typeof body.has_more!=='boolean')throw error('MODEL_DISCOVERY_INVALID',502);
    for(const row of body.data){const declared=row?.input??row?.input_modalities??row?.modalities?.input,input=modelInput.safeParse(declared);const result=model.safeParse({id:row?.id,...input.success?{input:input.data}:{},...typeof row?.display_name==='string'?{name:row.display_name}: {}});if(!result.success||/[\u0000-\u001f\u007f]/.test(result.data.id))throw error('MODEL_DISCOVERY_INVALID',502);models.set(result.data.id,result.data);if(models.size>2000)throw error('MODEL_DISCOVERY_TOO_LARGE',502);}
    if(!body.has_more)return {models:[...models.values()]};
    if(typeof body.last_id!=='string'||!body.last_id||body.last_id.length>512||body.last_id===url.searchParams.get('after_id'))throw error('MODEL_DISCOVERY_INVALID',502);
    url.searchParams.set('after_id',body.last_id);
   }
   throw error('MODEL_DISCOVERY_TOO_LARGE',502);
  }catch(e){if(timeout.aborted)throw error('MODEL_DISCOVERY_TIMEOUT',504);if(signal?.aborted)throw error('MODEL_DISCOVERY_CANCELLED',499);if(/^MODEL_/.test(e.code??''))throw e;throw error('MODEL_DISCOVERY_FAILED',502);}
  finally{this.discoveries--;}
 }
 namespace(){const ns=this.ctx.settings.describe({redactSecrets:true}).find(n=>n.ns==='llm-pi-ai');if(!ns)throw error('MODEL_SETTINGS_UNAVAILABLE',503);return ns;}
 async read(){const ns=this.namespace(),groups=[];for(const[id,p]of Object.entries(ns.value.providers??{})){
  if(this.ctx.get?.('naumiModelPolicy')&&!p.models?.length)continue;
  const info=p.apiKeyEnv?await this.ctx.credentials.describe(p.apiKeyEnv):{configured:false,writable:true};
  groups.push({id,displayName:p.displayName??id,api:p.api??'openai-completions',reasoning:p.reasoning??null,baseURL:p.baseURL??'',models:(p.models??[]).map(m=>({id:m.id,...m.name?{name:m.name}:{}})),configured:info.configured,editable:protocols.includes(p.api)&&Array.isArray(p.models)&&p.models.length>0});
 }for(const group of groups){const provider=ns.value.providers[group.id];group.models=group.models.map(m=>{const raw=provider.models.find(row=>row.id===m.id);return {...modelSpecView({...m,...raw.contextWindow===undefined?{}:{contextWindow:raw.contextWindow},...raw.maxTokens===undefined?{}:{maxTokens:raw.maxTokens}},provider),input:raw.input?.length?[...raw.input]:null,...reasoningView(raw,provider.api)};});}return {revision:ns.revision,writable:this.ctx.settings.writable&&!this.ctx.get?.('naumiModelPolicy'),managedPolicy:this.ctx.get?.('naumiModelPolicy')?.state??null,groups,specs:officialModelSpecs};}
 async repairDefault(removed){
  const current=this.ctx.agentDefaultModel.currentSelection();
  const p=this.namespace().value.providers??{},own=p[current.provider];
  const missingModel=own?.models?.length&&!own.models.some(m=>m.id===current.model);
  if(!official(current.provider)&&current.provider!==unconfigured.provider&&current.provider!==removed&&!missingModel)return;
  const first=missingModel?[current.provider,own]:Object.entries(p).find(([,v])=>v.models?.length);
  await this.ctx.agentDefaultModel.saveSelection(first?{provider:first[0],model:first[1].models[0].id}:unconfigured);
 }
 execute(input){const policy=this.ctx.get?.('naumiModelPolicy');if(policy){if(input?.action==='retry-policy'&&Object.keys(input).every(k=>k==='action'||k==='expectedRevision'))return policy.apply().catch(()=>null).then(()=>this.read());return Promise.reject(error('MODEL_POLICY_MANAGED',403));}const run=this.queue.then(()=>this.write(input));this.queue=run.catch(()=>{});return run;}
 async write(input){
  const parsed=z.union([save,remove,refresh]).safeParse(input);if(!parsed.success)throw error('MODEL_INVALID_REQUEST');const p=parsed.data;
  const ns=this.namespace();if(!this.ctx.settings.writable)throw error('MODEL_SETTINGS_READ_ONLY',403);if(ns.revision!==p.expectedRevision)throw error('MODEL_SETTINGS_CONFLICT',409);
  if(p.action==='refresh-specs'){
   const result=refreshModelSpecs(ns.value.providers??{});
   // Describe.value is schema-normalized (including implicit input/compat defaults).
   // Write only the two requested numeric leaves, never materialize a whole model array.
   const ops=result.changes.flatMap(row=>{const index=ns.value.providers[row.group].models.findIndex(m=>m.id===row.model);return ['contextWindow','maxTokens'].map(key=>({op:'set',path:['providers',row.group,'models',String(index),key],value:row.after[key]}));});
   if(ops.length)await this.ctx.settings.mutate('llm-pi-ai',ops,ns.revision);
   return {...await this.read(),specRefresh:{changed:result.changes.length,changes:result.changes,unknown:result.unknown,conditional:result.conditional}};
  }
  const previous=ns.value.providers?.[p.id],stored=ns.user?.providers?.[p.id]??previous;let newRef;
  if(p.action==='remove'){
   if(!previous)throw error('MODEL_GROUP_NOT_FOUND',404);
   await this.ctx.settings.mutate('llm-pi-ai',[{op:'unset',path:['providers',p.id]}],ns.revision);
  }else{
   if(new Set(p.models.map(m=>m.id)).size!==p.models.length)throw error('MODEL_DUPLICATE_ID');
   if(!p.apiKey&&!previous?.apiKeyEnv)throw error('MODEL_KEY_REQUIRED');
   const profile={...stored,displayName:p.displayName,baseURL:endpoint(p.baseURL),api:p.api,models:p.models.map(m=>{const value=configureReasoning(m,configureModelSpec(m,(stored?.models??previous?.models)?.find(old=>old.id===m.id),previous??{}),p.api);if(m.input===null)delete value.input;return value;}),apiKeyEnv:previous?.apiKeyEnv};
   if(p.reasoning!==undefined){if(p.reasoning===null)delete profile.reasoning;else profile.reasoning=p.reasoning;}
   if(p.reasoning!==undefined||p.models.some(m=>m.reasoningPreset!==undefined||m.reasoningEfforts!==undefined)){profile.preserveReasoningDefault=true;validateDefault(profile,profile.reasoning);}
   if(p.apiKey){if(/[\r\n\u0000-\u001f\u007f]/.test(p.apiKey))throw error('MODEL_KEY_INVALID');newRef='NAUMI_MODEL_'+randomUUID().replaceAll('-','').toUpperCase();profile.apiKeyEnv=newRef;await this.ctx.credentials.set(newRef,p.apiKey);}
   try{await this.ctx.settings.mutate('llm-pi-ai',[{op:'set',path:['providers',p.id],value:profile}],ns.revision);}
   catch(e){if(newRef)try{await this.ctx.credentials.unset(newRef);}catch{throw error('MODEL_SAVE_CLEANUP_FAILED',500);}throw e;}
  }
  // Configuration is already durable. Report a default-selection issue separately, not as a failed save.
  let defaultPending=false;try{await this.repairDefault(p.action==='remove'?p.id:undefined);}catch{defaultPending=true;}
  return {...await this.read(),defaultPending};
 }
}

export function installModelConnections(ctx){
 return ctx.inject(['webServer','connection','settings','credentials','agentDefaultModel'],scope=>{
  const service=new ModelConnections(scope);
  scope.on('ready',()=>service.repairDefault().catch(()=>{}));
  scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/model-connections',handler:async(req,res)=>{
   res.setHeader('Cache-Control','no-store');const send=(status,value)=>{if(!res.destroyed)res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));};
   const admission=scope.connection.admit(req);if('rejection'in admission){send(admission.rejection,{error:'AUTH_REQUIRED'});return;}if(admission.peer.principal.kind!=='owner'){send(403,{error:'OWNER_REQUIRED'});return;}
   try{
    if(req.method==='GET'){send(200,await service.read());return;}
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'METHOD_NOT_ALLOWED'});return;}
    if(req.headers['x-naumi-model-connections']!=='1'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'SAME_ORIGIN_REQUIRED'});return;}
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){send(415,{error:'JSON_REQUIRED'});return;}
    let bytes=0,text='';for await(const b of req){bytes+=b.length;if(bytes>131072){send(413,{error:'MODEL_BODY_TOO_LARGE'});return;}text+=b;}
    let input;try{input=JSON.parse(text);}catch{throw error('MODEL_INVALID_REQUEST');}
    if(input?.action==='discover'){
     const ac=new AbortController(),close=()=>{if(!res.writableEnded)ac.abort();};res.on('close',close);
     try{send(200,await service.discover(input,{signal:ac.signal}));}finally{res.off('close',close);}
    }else send(200,await service.execute(input));
   }catch(e){const conflict=e.code==='SETTINGS_CONFLICT';send(conflict?409:e.status??500,{error:conflict?'MODEL_SETTINGS_CONFLICT':/^MODEL_[A-Z_]+$/.test(e.code??'')?e.code:'MODEL_SAVE_FAILED'});}
  }}));
 });
}
