import {canvasAuthentication} from '../../market/auth.mjs';
import {email,fault} from './registry.mjs';
export function accountAuthentication({origin,fetcher=fetch,adminPolicy}){
 if(adminPolicy){if(adminPolicy.mode!=='native-owner'||!/^[a-f0-9-]{36}$/.test(adminPolicy.enterpriseId))throw fault('ACCOUNT_MODEL_ADMIN_POLICY_INVALID',503);adminPolicy={...adminPolicy,subject:email(adminPolicy.subject)};}
 const native=canvasAuthentication({origin,fetcher,includeSubject:true});
 async function owner(cookie){
  const actor=await native({headers:{cookie}});if(actor.subject.value!==adminPolicy.subject)throw fault('ACCOUNT_MODEL_ADMIN_REQUIRED',403);
  let response;try{response=await fetcher(origin+'/api/enterprise?enterpriseId='+adminPolicy.enterpriseId,{headers:{cookie},redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw fault('ACCOUNT_MODEL_IDENTITY_UNAVAILABLE',503);}
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw fault('ACCOUNT_MODEL_ADMIN_REQUIRED',403);
  let size=0,chunks=[];for await(const c of response.body){size+=c.length;if(size>524288)throw fault('ACCOUNT_MODEL_IDENTITY_INVALID',503);chunks.push(Buffer.from(c));}
  let v;try{v=JSON.parse(Buffer.concat(chunks));}catch{throw fault('ACCOUNT_MODEL_IDENTITY_INVALID',503);}
  if(v?.enterprise?.id!==adminPolicy.enterpriseId||v?.actor?.owner!==true)throw fault('ACCOUNT_MODEL_ADMIN_REQUIRED',403);
  return {subject:actor.subject.value};
 }

 return async(req,{admin=false}={})=>{
 const cookie=req.headers.cookie;if(!cookie||cookie.length>16384)throw fault('ACCOUNT_MODEL_LOGIN_REQUIRED',401);
 if(admin&&adminPolicy)return owner(cookie);
 if(admin){let r;try{r=await fetcher(origin+'/api/admin/login',{headers:{cookie},redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw fault('ACCOUNT_MODEL_IDENTITY_UNAVAILABLE',503);}if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw fault('ACCOUNT_MODEL_ADMIN_REQUIRED',403);let size=0,chunks=[];for await(const c of r.body){size+=c.length;if(size>65536)throw fault('ACCOUNT_MODEL_IDENTITY_INVALID',503);chunks.push(Buffer.from(c));}const text=Buffer.concat(chunks).toString('utf8');let v;try{v=JSON.parse(text);}catch{throw fault('ACCOUNT_MODEL_IDENTITY_INVALID',503);}if(v.localAuthed!==true&&!(v.passwordRequired===false&&v.nativeAdmin===true))throw fault('ACCOUNT_MODEL_ADMIN_REQUIRED',403);return {subject:'canvas-admin'};}
 const actor=await native(req);return {subject:email(actor.subject.value)};
 };}
