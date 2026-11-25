import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {prepareDesktopImport} from './desktop-model-import.mjs';
export function takeoverInput(file){
 const v=JSON.parse(fs.readFileSync(file));
 // Preserve the installed native adapter's effective configured budgets, not official limits.
 for(const p of Object.values(v.providers))for(const m of p.models){m.contextWindow??=p.defaultContextWindow??1000000;m.maxTokens??=p.defaultMaxTokens??128000;}
 return prepareDesktopImport({providers:v.providers,refs:v.refs,sourceId:'desktop-central-20261125',operationId:'8ad47265-5fbc-489d-b977-e1680dc84753'});
}
export function takeoverCatalog(request){
 const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),names=['claude fable5.2','gpt6.1sol','gpt6.1terra','claude opus5.5'];
 return {version:1,models:request.connections.map(c=>({id:'m-'+digest(c.models[0].name).slice(0,24),name:c.models[0].name,sourceRoute:'r-'+digest([c.providerId,c.models[0].id]).slice(0,32)})).sort((a,b)=>names.indexOf(a.name)-names.indexOf(b.name))};
}

export function validateTakeoverRequest(request,allow){
 assert.equal(request.schemaVersion,1);assert.equal(request.sourceId,allow.sourceId);assert.equal(request.operationId,allow.operationId);
 const normalized=prepareDesktopImport({providers:Object.fromEntries(request.connections.map(c=>[c.sourceProviderId,{...c.configuration,models:c.models,apiKeyEnv:c.sourceProviderId}])),refs:Object.fromEntries(request.connections.map(c=>[c.sourceProviderId,c.key])),sourceId:request.sourceId,operationId:request.operationId});
 assert.deepEqual(normalized,request);assert.equal(normalized.configDigest,allow.configDigest);assert.deepEqual(normalized.connections.map(({key,...c})=>c),allow.connections);return normalized;
}
