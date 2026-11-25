// Short-lived operator; never used as the serving process.
import fs from 'node:fs';import path from 'node:path';import pg from 'pg';import {randomUUID} from 'node:crypto';
import {provisionReadonly,readonlyPrivileges} from '../services/account-models/readonly-role.mjs';
import {ImportedRegistry,CatalogRegistry} from '../services/account-models/registry.mjs';
import {AccountModelStore} from '../services/account-models/store.mjs';
import {createCredentialReader} from 'naumi-credentials-owner';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
try{const action=process.argv[2];
 if(action==='role'){const chunks=[];for await(const b of process.stdin)chunks.push(b);const input=JSON.parse(Buffer.concat(chunks));console.log(JSON.stringify({status:'PASS',...await provisionReadonly(pool,input.password)}));}
 else if(action==='check-role')console.log(JSON.stringify({status:'PASS',...await readonlyPrivileges(pool)}));
 else if(action==='snapshot'){
  const tx=await pool.connect();try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const chunks=[];for await(const b of process.stdin)chunks.push(b);const {excludeProviders=[]}=JSON.parse(Buffer.concat(chunks));
   const state=(await tx.query(`SELECT 'sources' AS kind,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY provider_id,kind,content_hash)::text,'')) AS digest FROM app_supplier_source_snapshots t WHERE NOT(provider_id=ANY($1)) UNION ALL SELECT 'metadata',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM app_supplier_model_metadata t WHERE NOT(provider_id=ANY($1)) UNION ALL SELECT 'credentials',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM app_model_credentials t WHERE NOT(provider_id=ANY($1)) UNION ALL SELECT 'active',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY singleton)::text,'')) FROM app_model_config_state t UNION ALL SELECT 'billing',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY version)::text,'')) FROM app_billing_config_versions t`,[excludeProviders])).rows;await tx.query('ROLLBACK');console.log(JSON.stringify({status:'PASS',state,modelCalls:0}));
  }catch(e){await tx.query('ROLLBACK').catch(()=>{});throw e;}finally{tx.release();}
 }
 else if(action==='catalog'){
  const registry=new CatalogRegistry(new ImportedRegistry({pool,credentials:createCredentialReader(pool)}),JSON.parse(fs.readFileSync(process.env.NAUMI_ACCOUNT_MODEL_CATALOG))),routes=await registry.list();let credentials=0;for(const r of routes){if(!await registry.secret(r))throw Error('CREDENTIAL_UNAVAILABLE');credentials++;}
  console.log(JSON.stringify({status:'PASS',models:routes.map(r=>({id:r.id,name:r.model.name,contextWindow:r.model.contextWindow,maxTokens:r.model.maxTokens,input:r.model.input})),credentialsVerified:credentials,modelCalls:0}));
 }else if(action==='defaults'){
  // Bootstrap the authorized all-user default exactly once; never overwrite later admin edits.
  const catalog=JSON.parse(fs.readFileSync(process.env.NAUMI_ACCOUNT_MODEL_CATALOG)),store=new AccountModelStore(path.join(process.env.NAUMI_ACCOUNT_MODEL_DATA,'account-models.sqlite'));
  try{if(store.defaults().revision!==0)throw Error('ACCOUNT_MODEL_DEFAULTS_ALREADY_CONFIGURED');const result=store.save('operator:all-users-20261125',{expectedRevision:0,enabled:true,routes:catalog.models.map(m=>m.id),operationId:randomUUID()},catalog.models.map(m=>m.id),{defaults:true});console.log(JSON.stringify({status:'PASS',defaultPolicy:result,modelCalls:0}));}finally{store.close();}
 }else throw Error('ACCOUNT_MODEL_OPERATOR_ACTION_INVALID');
}catch(e){console.log(JSON.stringify({status:'FAIL',error:/^[A-Z_]+$/.test(e.message)?e.message:'ACCOUNT_MODEL_OPERATOR_FAILED',code:/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:undefined}));process.exitCode=1;}finally{await pool.end();}
