import {canvasAuthentication} from '../../market/auth.mjs';
import {email,fault} from './registry.mjs';
export function accountAuthentication({origin,fetcher=fetch}){

 return async(req,{admin=false}={})=>{
 const cookie=req.headers.cookie;if(!cookie||cookie.length>16384)throw fault('ACCOUNT_MODEL_LOGIN_REQUIRED',401);
 if(admin){let r;try{r=await fetcher(origin+'/api/admin/login',{headers:{cookie},redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw fault('ACCOUNT_MODEL_IDENTITY_UNAVAILABLE',503);}if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw fault('ACCOUNT_MODEL_ADMIN_REQUIRED',403);let size=0,chunks=[];for await(const c of r.body){size+=c.length;if(size>65536)throw fault('ACCOUNT_MODEL_IDENTITY_INVALID',503);chunks.push(Buffer.from(c));}const text=Buffer.concat(chunks).toString('utf8');let v;try{v=JSON.parse(text);}catch{throw fault('ACCOUNT_MODEL_IDENTITY_INVALID',503);}if(v.localAuthed!==true&&!(v.passwordRequired===false&&v.nativeAdmin===true))throw fault('ACCOUNT_MODEL_ADMIN_REQUIRED',403);return {subject:'canvas-admin'};}
 const actor=await canvasAuthentication({origin,fetcher,includeSubject:true})(req);return {subject:email(actor.subject.value)};
 };}
