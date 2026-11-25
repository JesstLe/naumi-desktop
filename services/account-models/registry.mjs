import {createHash} from 'node:crypto';
export const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const fault=(code,status=400)=>Object.assign(Error(code),{status});
export const email=v=>{if(typeof v!=='string'||v.length>254||!/^([^@\s]+)@([^@\s]+)$/.test(v)||/[\s\x00-\x1f]/.test(v))throw fault('ACCOUNT_MODEL_SUBJECT_INVALID');return v.toLowerCase();};
export function checkedRoutes(rows,{allowLoopback=false}={}){
 if(!Array.isArray(rows)||rows.length>600)throw fault('ACCOUNT_MODEL_REGISTRY_INVALID',503);
 const routes=rows.map(v=>{const u=new URL(v.baseURL);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(v.id)||!['openai-completions','openai-responses','anthropic-messages'].includes(v.api)||u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||allowLoopback&&u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw fault('ACCOUNT_MODEL_REGISTRY_INVALID',503);
 const m=v.model;if(!m||typeof m.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(m.id)||typeof m.name!=='string'||!m.name||m.name.length>160)throw fault('ACCOUNT_MODEL_REGISTRY_INVALID',503);
 for(const k of ['contextWindow','maxTokens'])if(!Number.isSafeInteger(m[k])||m[k]<1||m[k]>2000000)throw fault('ACCOUNT_MODEL_CAPACITY_REQUIRED',503);
 if(!Array.isArray(m.input)||!m.input.length||m.input.some(x=>!['text','image'].includes(x)))throw fault('ACCOUNT_MODEL_CAPABILITY_REQUIRED',503);
 // Only explicitly declared SDK model capabilities leave the source registry.
 const model=Object.fromEntries(['id','name','contextWindow','maxTokens','input','reasoning','reasoningEfforts','reasoningPreset','reasoningDefault','compat','cost'].filter(k=>m[k]!==undefined).map(k=>[k,structuredClone(m[k])]));
 return {id:v.id,group:String(v.group??'Naumi').slice(0,100),api:v.api,baseURL:u.href.replace(/\/$/,''),credentialRef:v.credentialRef,providerId:v.providerId,model};});
 if(new Set(routes.map(r=>r.id)).size!==routes.length)throw fault('ACCOUNT_MODEL_ROUTE_COLLISION',503);return routes;
}
/** Original Canvas credentials remain the only secret owner; never copy/decrypt into catalogs. */
export class ImportedRegistry{
 constructor({pool,credentials}){Object.assign(this,{pool,credentials});}
 async list(){const {rows}=await this.pool.query(`SELECT s.provider_id,s.source_data,m.model_id,m.metadata FROM app_supplier_source_snapshots s JOIN app_supplier_model_metadata m ON m.provider_id=s.provider_id WHERE s.kind='desktop-model-import-v1' ORDER BY s.provider_id,m.model_id`);
 const routes=[],unavailable=[];for(const r of rows){const x=r.metadata?.parameterMetadata?.desktopSource,c=x?.configuration;if(!c)throw fault('ACCOUNT_MODEL_SOURCE_INVALID',503);const row={id:'r-'+digest([r.provider_id,r.model_id]).slice(0,32),group:c.displayName,api:c.api,baseURL:c.baseURL,providerId:r.provider_id,credentialRef:r.source_data.credentialRef,model:{...x.model,id:r.model_id,name:x.model.name??r.model_id,input:x.model.input??(r.metadata.modality==='text'?['text']:undefined)}};
 try{routes.push(...checkedRoutes([row]));}catch(e){if(!['ACCOUNT_MODEL_CAPACITY_REQUIRED','ACCOUNT_MODEL_CAPABILITY_REQUIRED'].includes(e.message))throw e;unavailable.push({id:row.id,group:row.group,model:{id:row.model.id,name:row.model.name},error:e.message});}}
 this.unavailable=unavailable;return checkedRoutes(routes);}
 async secret(route){return this.credentials.read(route.credentialRef,route.providerId);}
 async userExists(subject){return !!(await this.pool.query('SELECT 1 FROM app_users WHERE lower(email)=$1',[email(subject)])).rows.length;}
}
export function publicRoute(r,origin){return {id:r.id,group:r.group,provider:'naumi-account-'+r.id,api:r.api,baseURL:origin+'/api/desktop-models/v1/gateway/'+r.id,model:{...r.model,id:r.publicModelId??r.model.id}};}

/** Server-owned aliases share the original source and credential reader. */
export class CatalogRegistry {
 constructor(source,config){
  if(config?.version!==1||!Array.isArray(config.models)||!config.models.length||config.models.length>100)throw fault('ACCOUNT_MODEL_CATALOG_INVALID',503);
  const ids=new Set();for(const m of config.models){if(Object.keys(m).some(k=>!['id','sourceRoute','name'].includes(k))||!/^m-[a-f0-9]{24}$/.test(m.id)||ids.has(m.id)||!/^r-[a-f0-9]{32}$/.test(m.sourceRoute)||typeof m.name!=='string'||!m.name.trim()||m.name.length>160)throw fault('ACCOUNT_MODEL_CATALOG_INVALID',503);ids.add(m.id);}
  this.source=source;this.config=structuredClone(config);
 }
 async list(){const all=await this.source.list();const rows=this.config.models.map(m=>{const source=all.find(r=>r.id===m.sourceRoute);if(!source)throw fault('ACCOUNT_MODEL_CATALOG_SOURCE_MISSING',503);return {...source,id:m.id,publicModelId:m.id,group:'Naumi',model:{...source.model,name:m.name}};});this.unavailable=[];return rows;}
 secret(route){return this.source.secret(route);}
 userExists(subject){return this.source.userExists(subject);}
}
