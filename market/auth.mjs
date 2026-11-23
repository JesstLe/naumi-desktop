import {digest,fail} from '../plugins/naumi-enterprise/market-contract.js';
export function canvasAuthentication({origin,tenant='naumi',moderators=[],fetcher=fetch,includeSubject=false}){
 const issuer=new URL(origin);if(!(issuer.protocol==='https:'||issuer.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(issuer.hostname))||issuer.username||issuer.password||issuer.pathname!=='/'||issuer.search||issuer.hash)fail('MARKET_AUTH_ORIGIN_INVALID');
 const privileged=new Set(moderators.map(v=>v.trim().toLowerCase()).filter(Boolean));
 return async req=>{
  const cookie=req.headers.cookie;if(!cookie||cookie.length>16384)fail('MARKET_AUTH_REQUIRED',401);
  let r;try{r=await fetcher(issuer.origin+'/api/auth/session',{headers:{cookie},redirect:'error',signal:AbortSignal.timeout(8000)});}catch{fail('MARKET_IDENTITY_UNAVAILABLE',503);}
  if(!r.ok)fail([401,403].includes(r.status)?'MARKET_AUTH_REQUIRED':'MARKET_IDENTITY_UNAVAILABLE',[401,403].includes(r.status)?401:503);
  if(!r.headers.get('content-type')?.toLowerCase().includes('application/json'))fail('MARKET_IDENTITY_INVALID',503);
  const chunks=[];let size=0;try{for await(const chunk of r.body){size+=chunk.length;if(size>65536)fail('MARKET_IDENTITY_INVALID',503);chunks.push(Buffer.from(chunk));}}catch(e){if(e.status)throw e;fail('MARKET_IDENTITY_UNAVAILABLE',503);}
  let value;try{value=JSON.parse(Buffer.concat(chunks));}catch{fail('MARKET_IDENTITY_INVALID',503);}
  const user=value?.user;if(!user||typeof user.email!=='string'||user.email.length>254||/[\s\x00-\x1f]/.test(user.email)||!user.email.includes('@'))fail('MARKET_AUTH_REQUIRED',401);
  const subject=user.email.toLowerCase();return{id:digest([issuer.origin,tenant,subject]),tenant,name:typeof user.name==='string'&&user.name.trim()?user.name.slice(0,160):subject.split('@')[0],moderator:privileged.has(subject),...(includeSubject?{subject:{type:'naumi-email-v1',value:subject}}:{})};
 };
}
