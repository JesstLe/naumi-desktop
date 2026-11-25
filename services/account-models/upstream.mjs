import {Agent,fetch as upstreamFetch} from 'undici';

/** Dedicated upstream pool only. Never mutate the global dispatcher, disable TLS
 * verification, follow redirects, change source endpoints or retry a model POST. */
export function gatewayTransport({AgentClass=Agent,request=upstreamFetch}={}){
 const dispatcher=new AgentClass({connections:4,pipelining:1,connectTimeout:30000,autoSelectFamily:true,autoSelectFamilyAttemptTimeout:250,headersTimeout:300000,bodyTimeout:300000,allowH2:false});
 return {request:(url,options)=>request(url,{...options,dispatcher}),close:()=>dispatcher.close()};
}
const allowedCodes=new Set(['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ECONNRESET','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ENOTFOUND','EAI_AGAIN','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID','ABORT_ERR']);
export function gatewayFailure(error,{stage,requestId,elapsedMs,clientAborted=false}={}){
 const codes=new Set(),seen=new Set(),walk=e=>{if(!e||typeof e!=='object'||seen.has(e)||seen.size>=16)return;seen.add(e);if(allowedCodes.has(e.code))codes.add(e.code);if(e.name==='TimeoutError')codes.add('TIMEOUT');walk(e.cause);for(const v of Array.isArray(e.errors)?e.errors.slice(0,8):[])walk(v);};walk(error);
 const original=/^(?:ACCOUNT_MODEL|MARKET)_[A-Z_]{1,80}$/.test(error?.message??'')?error.message:null;
 const timeout=[...codes].some(v=>v.includes('TIMEOUT'));
 const tls=[...codes].some(v=>/CERT|TLS|SELF_SIGNED|VERIFY_LEAF/.test(v));
 const code=original??(clientAborted?'ACCOUNT_MODEL_CLIENT_DISCONNECTED':timeout?'ACCOUNT_MODEL_UPSTREAM_TIMEOUT':tls?'ACCOUNT_MODEL_UPSTREAM_TLS_FAILED':stage==='upstream-connect'?'ACCOUNT_MODEL_UPSTREAM_CONNECTION_FAILED':'ACCOUNT_MODEL_UNAVAILABLE');
 // Whitelist only. Never copy message/stack/URL/headers/body/subject/credential.
 const record={event:'ACCOUNT_MODEL_GATEWAY_FAILURE',stage,code,.../^[a-f0-9-]{36}$/.test(requestId??'')?{requestId}:{},elapsedMs:Math.max(0,Math.round(elapsedMs??0)),causeCodes:[...codes].sort(),receipt:'preserved',automaticRetry:false};
 return {code,status:Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:timeout?504:503,record};
}
