import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {serial,hash,prepareDesktopImport,sourceMetadata} from './desktop-model-import.mjs';

const kind='desktop-model-import-v1';
const fingerprint=request=>{assert(process.env.SETTINGS_SECRET?.trim().length>=32,'SETTINGS_SECRET_MISSING');return createHmac('sha256',process.env.SETTINGS_SECRET).update(serial(request)).digest('hex');};
async function protectedState(tx){
 const rows=await tx.query(`SELECT 'models' AS kind,md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY singleton)::text,'')) AS digest FROM app_model_config_state s UNION ALL SELECT 'billing',md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY version)::text,'')) FROM app_billing_config_versions s`);
 return rows.rows;
}
async function existing(tx,operationId){return (await tx.query('SELECT * FROM app_supplier_source_snapshots WHERE kind=$1 AND source_data->>\'operationId\'=$2 ORDER BY provider_id',[kind,operationId])).rows;}
async function checkStored(tx,rows,request,credentials,contracts){
 assert.equal(rows.length,request.connections.length,'IMPORT_PARTIAL_OR_MISSING');
 const fp=fingerprint(request);let models=0;
 for(const c of request.connections){
  const source=rows.find(r=>r.provider_id===c.providerId);assert(source&&source.content_hash===fp&&source.source_data.configDigest===request.configDigest,'IMPORT_CONTENT_CHANGED');
  const document=source.source_data;assert.equal(serial(document.configuration),serial(c.configuration),'SOURCE_CONFIG_DRIFT');assert.equal(document.models.length,c.models.length,'SOURCE_MODEL_DRIFT');
  assert.equal(await credentials.read(document.credentialRef,c.providerId),c.key,'CREDENTIAL_ROUNDTRIP_MISMATCH');
  for(const record of document.models){
   const expected=c.models.find(m=>m.id===record.modelId);assert(expected,'SOURCE_MODEL_DRIFT');assert.equal(record.metadataHash,hash(contracts.supplierMetadataSchema.parse(sourceMetadata(c,expected,contracts.unknownSupplierMetadata))),'SOURCE_MODEL_DRIFT');
   const r=(await tx.query('SELECT * FROM app_supplier_model_metadata WHERE id=$1 AND provider_id=$2',[record.id,c.providerId])).rows[0];
   assert(r&&r.model_id===record.modelId&&Number(r.revision)===1&&hash(r.metadata)===record.metadataHash,'IMPORTED_METADATA_CHANGED');models++;
  }
 }
 let adminReadModels=0;
 for(const c of request.connections){const view=await contracts.listSupplierModelsFrom(tx,{query:'',provider:c.providerId,family:'',brand:'',basis:'',state:'',page:1},true);assert.equal(view.total,c.models.length,'ADMIN_READ_MISMATCH');assert(view.facets.providers.some(p=>p.id===c.providerId),'ADMIN_SOURCE_MISSING');adminReadModels+=view.total;}
 return {providers:rows.length,models,credentialsVerified:rows.length,adminReadModels};
}
export async function importDesktopModels({pool,contracts,request,mode='apply',fault=()=>{}}){
 // Revalidate the finite transfer contract, including every original protocol/key.
 request=prepareDesktopImport({providers:Object.fromEntries(request.connections.map(c=>[c.sourceProviderId,{...c.configuration,models:c.models,apiKeyEnv:c.sourceProviderId}])),refs:Object.fromEntries(request.connections.map(c=>[c.sourceProviderId,c.key])),sourceId:request.sourceId,operationId:request.operationId});
 assert(['apply','verify'].includes(mode),'IMPORT_MODE_INVALID');
 let committed=false;const credentials=mode==='verify'?contracts.createCredentialReader(pool):contracts.createCredentialStore(pool),tx=await pool.connect();
 try{
  await tx.query(mode==='verify'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await tx.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s'");
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['desktop-model-import:'+request.sourceId]);
  const before=await protectedState(tx),prior=await existing(tx,request.operationId);
  if(prior.length){const receipt=await checkStored(tx,prior,request,credentials,contracts);await tx.query('COMMIT');return {status:'PASS',mode,replayed:mode==='apply',operationId:request.operationId,configDigest:request.configDigest,...receipt,activeModelsUnchanged:true,billingUnchanged:true,employeeGrants:0,modelCalls:0};}
  assert(mode==='apply','IMPORT_NOT_FOUND');
  for(const c of request.connections){
   assert(!(await tx.query('SELECT 1 FROM app_supplier_source_snapshots WHERE provider_id=$1 UNION ALL SELECT 1 FROM app_supplier_model_metadata WHERE provider_id=$1',[c.providerId])).rowCount,'SOURCE_ALREADY_EXISTS');
  }
  const actor='operator:desktop-import:'+request.operationId;
  for(const c of request.connections){
   // Use the existing server credential owner: original AES-GCM, validation and store.
   const saved=await credentials.importPlain({providerId:c.providerId,plain:c.key,actor},tx);fault('credential');
   const records=[];
   for(const model of c.models){
    const metadata=contracts.supplierMetadataSchema.parse(sourceMetadata(c,model,contracts.unknownSupplierMetadata));
    const id=randomUUID(),label=(model.name||model.id).slice(0,100);
    await tx.query(`INSERT INTO app_supplier_model_metadata(id,provider_id,provider_name,model_id,label,catalog_owner,family,brand,modality,capability_state,metadata,updated_by) VALUES($1,$2,$3,$4,$5,'Naumi Desktop','','','text','configured',$6::jsonb,$7)`,[id,c.providerId,c.configuration.displayName,model.id,label,serial(metadata),actor]);
    await tx.query('INSERT INTO app_supplier_model_metadata_versions(model_id,revision,actor,metadata) VALUES($1,1,$2,$3::jsonb)',[id,actor,serial(metadata)]);
    records.push({id,modelId:model.id,metadataHash:hash(metadata)});fault('model');
   }
   const data={schemaVersion:1,operationId:request.operationId,sourceId:request.sourceId,sourceProviderId:c.sourceProviderId,configDigest:request.configDigest,configuration:c.configuration,credentialRef:saved.id,models:records,employeeAvailability:'unassigned'};
   await tx.query('INSERT INTO app_supplier_source_snapshots(provider_id,kind,source_url,content_hash,source_data) VALUES($1,$2,$3,$4,$5::jsonb)',[c.providerId,kind,c.configuration.baseURL,fingerprint(request),serial(data)]);
  }
  assert.deepEqual(await protectedState(tx),before,'ACTIVE_REGISTRY_CHANGED');
  // Read keys through the same transaction; public credential reads use another connection.
  const rows=await existing(tx,request.operationId);assert.equal(rows.length,request.connections.length);
  await tx.query('COMMIT');
  committed=true;fault('committed');const verified=await importDesktopModels({pool,contracts,request,mode:'verify'});
  return {...verified,mode:'apply',replayed:false};
 }catch(e){if(committed){e.committed=true;e.operationId=request.operationId;}else await tx.query('ROLLBACK').catch(()=>{});throw e;}finally{tx.release();}
}
export async function rollbackDesktopModels({pool,operationId}){
 assert(/^[a-f0-9-]{36}$/i.test(operationId),'OPERATION_ID_INVALID');const tx=await pool.connect();
 try{
  await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s'");
  const sources=await existing(tx,operationId);assert(sources.length,'IMPORT_NOT_FOUND');
  const sourceIds=[...new Set(sources.map(x=>x.source_data.sourceId))];assert.equal(sourceIds.length,1);
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['desktop-model-import:'+sourceIds[0]]);
  const before=await protectedState(tx);let models=0;
  for(const source of sources){
   const data=source.source_data;
   assert(!(await tx.query(`SELECT 1 FROM app_model_providers WHERE credential_ref=$1 UNION ALL SELECT 1 FROM app_model_config_versions WHERE config->'providers' @> $2::jsonb`,[data.credentialRef,serial([{credentialRef:data.credentialRef}])])).rowCount,'CREDENTIAL_NOW_REFERENCED');
   assert(!(await tx.query("SELECT 1 FROM app_supplier_source_snapshots WHERE source_data->>'credentialRef'=$1 AND source_data->>'operationId' IS DISTINCT FROM $2",[data.credentialRef,operationId])).rowCount,'CREDENTIAL_NOW_REFERENCED');
   for(const item of data.models){
    const row=(await tx.query('SELECT * FROM app_supplier_model_metadata WHERE id=$1 FOR UPDATE',[item.id])).rows[0];
    assert(row&&row.provider_id===source.provider_id&&row.updated_by==='operator:desktop-import:'+operationId&&Number(row.revision)===1&&hash(row.metadata)===item.metadataHash,'ROLLBACK_DRIFT');
    assert(!(await tx.query('SELECT 1 FROM app_supplier_model_price_points WHERE model_id=$1',[item.id])).rowCount,'ROLLBACK_PRICE_DRIFT');
    assert.equal(Number((await tx.query('SELECT count(*) AS n FROM app_supplier_model_metadata_versions WHERE model_id=$1',[item.id])).rows[0].n),1,'ROLLBACK_HISTORY_DRIFT');
   }
  }
  for(const source of sources){
   for(const item of source.source_data.models){await tx.query('DELETE FROM app_supplier_model_metadata_versions WHERE model_id=$1',[item.id]);await tx.query('DELETE FROM app_supplier_model_metadata WHERE id=$1',[item.id]);models++;}
   await tx.query('DELETE FROM app_supplier_source_snapshots WHERE provider_id=$1 AND kind=$2 AND content_hash=$3',[source.provider_id,kind,source.content_hash]);
   await tx.query('DELETE FROM app_model_credentials WHERE id=$1 AND provider_id=$2 AND created_by=$3',[source.source_data.credentialRef,source.provider_id,'operator:desktop-import:'+operationId]);
  }
  assert.deepEqual(await protectedState(tx),before,'ACTIVE_REGISTRY_CHANGED');await tx.query('COMMIT');return {status:'PASS',providers:sources.length,models,credentials:sources.length,activeModelsUnchanged:true,billingUnchanged:true};
 }catch(e){await tx.query('ROLLBACK').catch(()=>{});throw e;}finally{tx.release();}
}
