import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareDesktopImport} from './desktop-model-import.mjs';

const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function visionProof(row,token){
 return row?.state!=='UNKNOWN'&&row?.state!=='ATTEMPT_STARTED'&&row?.httpStatus===200&&row.finishReason==='stop'&&typeof row.text==='string'
  &&row.text.toUpperCase().includes(token)
  &&/\b(red|crimson)\b[\s\S]*\bblue\b[\s\S]*\bgreen\b/i.test(row.text);
}
export function acceptedModels({first,followup,token,targets}){
 assert(/^[A-Z2-9]{6}$/.test(token),'SYNTHETIC_EXPECTATION_INVALID');
 assert(Array.isArray(targets)&&targets.length>0&&targets.length<=100
  &&new Set(targets.map(r=>r.id)).size===targets.length
  &&targets.every(r=>typeof r.id==='string'&&typeof r.name==='string'&&r.name.trim()),'EXPLICIT_TARGETS_REQUIRED');
 assert(first.automaticRetries===0&&followup.automaticRetries===0,'AUTOMATIC_REPLAY_FORBIDDEN');
 const all=[...first.models,...followup.models],ids=all.map(r=>r.requestId);
 assert(ids.every(x=>/^[a-f0-9-]{36}$/.test(x))&&new Set(ids).size===ids.length,'REQUEST_ID_REUSED');
 return targets.map(({id})=>{
  const initial=first.models.find(r=>r.model===id),extra=followup.models.filter(r=>r.model===id);
  assert(first.models.filter(r=>r.model===id).length===1&&extra.length<=1,'PROBE_MODEL_AMBIGUOUS');
  if(extra.length)assert(extra[0].priorRequestId===initial.requestId
   &&initial.state!=='UNKNOWN'&&(initial.finishReason==='length'||initial.httpStatus===400),'FOLLOWUP_NOT_TERMINAL');
  const proof=[initial,...extra].find(r=>visionProof(r,token));
  if(proof)return {id,input:['text','image'],requestId:proof.requestId,state:'VISION_PASS'};
  // Text-only is an explicit known outcome, never a silent visual capability downgrade.
  const text=extra.find(r=>r.mode==='text-only'&&r.httpStatus===200&&r.finishReason==='stop'&&r.state==='TEXT_PASS'&&r.markerMatched===true&&/^TEXT_[a-f0-9]{8}$/.test(r.text));
  return text?{id,input:['text'],requestId:text.requestId,state:'TEXT_ONLY_PASS'}:{id,input:[],state:'NOT_ACCEPTED'};
 });
}
export function prepareChannelSync({key,first,followup,token,targets,sourceId,sourceProviderId,baseURL,oldCatalog,operationId,contextWindow,maxTokens}){
 for(const n of [contextWindow,maxTokens])assert(Number.isSafeInteger(n)&&n>0&&n<=2000000,'EXPLICIT_CONFIGURED_CAPACITY_REQUIRED');
 assert(maxTokens<=contextWindow,'OUTPUT_EXCEEDS_CONTEXT');
 const outcomes=acceptedModels({first,followup,token,targets}),accepted=outcomes.filter(r=>r.input.length);
 assert(accepted.length,'NO_ACCEPTED_MODELS');
 assert(typeof sourceProviderId==='string','EXPLICIT_SOURCE_REQUIRED');
 const request=prepareDesktopImport({sourceId,operationId,providers:{[sourceProviderId]:{displayName:'Naumi',api:'openai-completions',baseURL,apiKeyEnv:'CHANNEL_KEY',models:accepted.map(r=>({id:r.id,name:targets.find(t=>t.id===r.id).name,input:r.input,contextWindow,maxTokens}))}},refs:{CHANNEL_KEY:key}});
 const connection=request.connections[0],oldNames=new Map(oldCatalog.models.map(m=>[m.name,m]));
 assert(oldNames.size===oldCatalog.models.length,'EXISTING_NAME_COLLISION');
 const catalog={version:1,models:connection.models.map(m=>({id:oldNames.get(m.name)?.id??'m-'+sha(m.name).slice(0,24),name:m.name,sourceRoute:'r-'+sha([connection.providerId,m.id]).slice(0,32)}))};
 assert(new Set(catalog.models.map(m=>m.id)).size===catalog.models.length,'CATALOG_ID_COLLISION');
 const publicRequest={...request,connections:request.connections.map(({key,...r})=>r)};
 return {request,catalog,allowlist:{...publicRequest,capacitySource:'explicit operator configured budgets; not measured official maxima',evidence:outcomes,tableInserts:{app_model_credentials:1,app_supplier_source_snapshots:1,app_supplier_model_metadata:accepted.length,app_supplier_model_metadata_versions:accepted.length}},outcomes};
}
