// Shared allowlist projection. Managed settings never consume connection details.
export function modelSettingsView(data){
 if(!data?.managedPolicy&&data?.presentation!=='managed-models')return data;
 const policy=data.managedPolicy??{},ready=policy.ready===true,rows=data.presentation==='managed-models'?(data.models??[]):(policy.models??[]);
 return {revision:Number.isInteger(data.revision)?data.revision:0,writable:false,presentation:'managed-models',managedPolicy:{ready,missingCount:Number.isInteger(policy.missingCount)?policy.missingCount:Array.isArray(policy.missing)?policy.missing.length:0},models:ready?rows.filter(m=>typeof m.name==='string'&&m.name.trim()).map(m=>({name:m.name,configured:typeof m.configured==='boolean'?m.configured:data.groups?.find(g=>g.id===m.provider)?.configured===true})):[]};
}
