// Bounded no-DDL readiness port for the original credential importer.
// Never marks the broader Canvas model-schema owner's cache as ready.
import assert from 'node:assert/strict';
const columns={
 app_model_credentials:{id:['uuid'],provider_id:['text'],key_enc:['text'],created_by:['text']},
 app_supplier_source_snapshots:{provider_id:['text'],kind:['text'],source_url:['text'],content_hash:['text'],source_data:['jsonb']},
 app_supplier_model_metadata:{id:['uuid'],provider_id:['text'],provider_name:['text'],model_id:['text'],label:['text'],catalog_owner:['text'],family:['text'],brand:['text'],modality:['text'],capability_state:['text'],metadata:['jsonb'],revision:['int4','int8'],updated_by:['text']},
 app_supplier_model_metadata_versions:{model_id:['uuid'],revision:['int4','int8'],actor:['text'],metadata:['jsonb']},
 app_model_config_state:{singleton:['bool']},app_model_config_versions:{version:['int4','int8'],config:['jsonb']},
 app_billing_config_versions:{version:['int4','int8']},app_model_providers:{credential_ref:['uuid']},app_supplier_model_price_points:{model_id:['uuid']}
};
const constraints={app_model_credentials:['id'],app_supplier_source_snapshots:['provider_id','kind','content_hash'],app_supplier_model_metadata:['id'],app_supplier_model_metadata_versions:['model_id','revision']};
export async function ensureImportSchema(pool){
 const tx=await pool.connect();try{
  await tx.query('BEGIN READ ONLY');await tx.query("SET LOCAL search_path=public,pg_catalog");
  const rows=(await tx.query(`SELECT c.relname,a.attname,t.typname,a.attnotnull FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid JOIN pg_type t ON t.oid=a.atttypid WHERE n.nspname='public' AND c.relname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped`,[Object.keys(columns)])).rows;
  for(const[table,fields]of Object.entries(columns))for(const[name,types]of Object.entries(fields)){const r=rows.find(x=>x.relname===table&&x.attname===name);assert(r&&types.includes(r.typname),'IMPORT_SCHEMA_COLUMN_MISMATCH');}
  const keys=(await tx.query(`SELECT c.relname,k.contype,array_agg(a.attname::text ORDER BY u.ord) AS columns FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.num WHERE n.nspname='public' AND c.relname=ANY($1) AND k.contype IN ('p','u') GROUP BY c.relname,k.oid,k.contype`,[Object.keys(constraints)])).rows;
  for(const[table,key]of Object.entries(constraints))assert(keys.some(x=>x.relname===table&&x.contype==='p'&&JSON.stringify(x.columns)===JSON.stringify(key)),'IMPORT_SCHEMA_CONSTRAINT_MISMATCH');
  assert(keys.some(x=>x.relname==='app_supplier_model_metadata'&&['u','p'].includes(x.contype)&&JSON.stringify(x.columns)===JSON.stringify(['provider_id','model_id'])),'IMPORT_SCHEMA_CONSTRAINT_MISMATCH');
  await tx.query('ROLLBACK');
 }catch(e){await tx.query('ROLLBACK').catch(()=>{});throw e;}finally{tx.release();}
}
export const ensureModelSchema=ensureImportSchema;

