import fs from 'node:fs';
import {installModelClient} from './account-models.js';
export class BundledModels{
 constructor(value){this.mode='bundled';this.revision=value.revision;this.keys=new Map();this.value={revision:1,routes:Object.entries(value.providers).map(([provider,p])=>{this.keys.set(provider,value.refs[p.apiKeyEnv]);return {id:p.models[0].id,provider,group:'Naumi',api:p.api,baseURL:p.baseURL,wireModel:value.wireModels[provider],model:p.models[0]};})};}
 async refresh(){return this.value;}
 allowed(v){return !!v&&this.value.routes.some(r=>r.provider===v.provider&&r.model.id===v.model);}
 select(agent){const v=agent.model.current();if(!this.allowed(v)){const r=this.value.routes.find(r=>r.model.id===v?.model)??this.value.routes[0];agent.model.select({provider:r.provider,model:r.model.id});}}
 resolveApiKey(provider){const key=this.keys.get(provider);if(!key)throw Error('BUNDLED_MODEL_CREDENTIAL_MISSING');return key;}
}
export function installBundledModels(ctx,{config=process.env.NAUMI_BUNDLED_MODELS_CONFIG}={}){
 if(!config)return;if(process.env.NAUMI_ACCOUNT_MODELS_CONFIG||process.env.NAUMI_ACCOUNT_MODELS_TOKEN||process.env.NAUMI_MODEL_POLICY)throw Error('BUNDLED_MODEL_CONTROL_CONFLICT');delete process.env.NAUMI_BUNDLED_MODELS_CONFIG;
 if(fs.lstatSync(config).isSymbolicLink()||fs.statSync(config).size>524288)throw Error('BUNDLED_MODEL_CONFIG_INVALID');const v=JSON.parse(fs.readFileSync(config));if(v.version!==2||v.mode!=='bundled-release'||!v.providers||!v.refs||!v.wireModels)throw Error('BUNDLED_MODEL_CONFIG_INVALID');
 return ctx.inject(['llm','agents','agentDefaultModel'],scope=>installModelClient(scope,new BundledModels(v),'naumiBundledModels'));
}
