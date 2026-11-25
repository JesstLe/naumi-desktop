// Explicit operator provisioning, not imported by the serving process.
import assert from 'node:assert/strict';
export const ROLE='naumi_desktop_models_ro';
export async function provisionReadonly(pool,password){
 assert(/^[A-Za-z0-9_-]{43,100}$/.test(password),'ACCOUNT_MODEL_ROLE_PASSWORD_INVALID');
 const tx=await pool.connect();try{
  await tx.query('BEGIN');
  assert(!(await tx.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[ROLE])).rowCount,'ACCOUNT_MODEL_ROLE_EXISTS');
  const database=(await tx.query('SELECT current_database() AS name')).rows[0].name;
  assert(/^[A-Za-z0-9_-]{1,63}$/.test(database),'ACCOUNT_MODEL_DATABASE_INVALID');
  await tx.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 6`);
  await tx.query(`ALTER ROLE ${ROLE} SET default_transaction_read_only=on`);
  await tx.query(`ALTER ROLE ${ROLE} SET search_path=public,pg_catalog`);
  await tx.query(`GRANT CONNECT ON DATABASE "${database}" TO ${ROLE}`);
  await tx.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
  for(const [table,cols]of Object.entries({app_supplier_source_snapshots:'provider_id,source_data,kind',app_supplier_model_metadata:'provider_id,model_id,metadata',app_model_credentials:'id,provider_id,key_enc',app_users:'email'}))await tx.query(`GRANT SELECT (${cols}) ON public.${table} TO ${ROLE}`);
  const result=await readonlyPrivileges(tx,ROLE);assert(result.businessWrites===0&&result.memberships===0&&result.ownedObjects===0&&!result.publicSchemaCreate,'ACCOUNT_MODEL_ROLE_PRIVILEGE_DRIFT');
  await tx.query('COMMIT');return {role:ROLE,...result,created:true};
 }catch(e){await tx.query('ROLLBACK').catch(()=>{});throw e;}finally{tx.release();}
}
export async function readonlyPrivileges(pool,role=ROLE){
 const r=(await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege($1,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1,c.oid,'INSERT,UPDATE,REFERENCES'))`,[role])).rows[0];
 const memberships=(await pool.query('SELECT count(*)::int AS n FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1',[role])).rows[0].n;
 const ownedObjects=(await pool.query('SELECT count(*)::int AS n FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname=$1',[role])).rows[0].n;
 const publicSchemaCreate=(await pool.query("SELECT has_schema_privilege($1,'public','CREATE') AS yes",[role])).rows[0].yes;
 return {businessWrites:r.n,memberships,ownedObjects,publicSchemaCreate};
}
