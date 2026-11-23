 'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomic}=require('./profile.cjs');
const {randomBytes}=require('node:crypto');
class AccountModelsSession{
 constructor({identity,clock=Date.now}){Object.assign(this,{identity,clock});this.running=0;this.value=null;this.owner=null;this.flight=null;}
 async bootstrap({force=false}={}){
 const runtime=this.identity(),active=runtime?.active;if(!active||!runtime.client){this.value=null;throw Error('ACCOUNT_MODEL_LOGIN_REQUIRED');}
 if(this.owner!==active){this.owner=active;this.value=null;}
 if(!force&&this.value&&this.value.expiresAt>this.clock()+60000)return this.value;
 if(this.flight){if(this.flight.owner===active)return this.flight.promise;throw Error('ACCOUNT_MODEL_ACCOUNT_CHANGED');}
 const marker=path.join(active.root,'account-models-managed.json');let previous=null;
 if(fs.existsSync(marker)){if(fs.lstatSync(marker).isSymbolicLink()||fs.statSync(marker).size>16384)throw Error('ACCOUNT_MODEL_STATE_INVALID');previous=JSON.parse(fs.readFileSync(marker));if(previous.version!==1||previous.subject!==active.user.email||previous.origin!==active.origin||!Number.isSafeInteger(previous.revision)||!/^[a-f0-9]{64}$/.test(previous.deviceId))throw Error('ACCOUNT_MODEL_STATE_INVALID');}
 const deviceId=previous?.deviceId??randomBytes(32).toString('hex');
 const promise=(async()=>{this.running++;try{
 const response=await runtime.client.session.fetch(active.origin+'/api/desktop-models/v1/bootstrap',{method:'POST',credentials:'include',redirect:'error',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json','x-naumi-account-models':'1',Origin:active.origin},body:JSON.stringify({deviceId}),signal:AbortSignal.timeout(10000)});
 if(this.identity()!==runtime||runtime.active!==active)throw Error('ACCOUNT_MODEL_ACCOUNT_CHANGED');
 // Unprovisioned servers preserve the existing explicit test edition. After first enrollment,
 // 404/outage/revocation can NEVER silently reopen embedded or personally configured routes.
 if(response.status===404&&!fs.existsSync(marker)){await response.body?.cancel();this.value=null;return null;}
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error('ACCOUNT_MODEL_RESPONSE_INVALID');let n=0,chunks=[];for await(const c of response.body){n+=c.length;if(n>524288)throw Error('ACCOUNT_MODEL_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(c));}let v;try{v=JSON.parse(Buffer.concat(chunks));}catch{throw Error('ACCOUNT_MODEL_RESPONSE_INVALID');}
 if(!response.ok){this.value=null;throw Error(/^ACCOUNT_MODEL_[A-Z_]+$/.test(v.error)?v.error:'ACCOUNT_MODEL_UNAVAILABLE');}
 // Permit up to 60s of issuer/device clock skew; the gateway still enforces its exact 5m TTL.
 if(v.protocol!==1||v.subject!==active.user.email||v.deviceId!==deviceId||!Number.isSafeInteger(v.revision)||v.revision<1||!Number.isSafeInteger(v.expiresAt)||v.expiresAt<=this.clock()||v.expiresAt>this.clock()+360000||typeof v.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(v.token)||!Array.isArray(v.routes)||!v.routes.length||v.routes.length>100)throw Error('ACCOUNT_MODEL_RESPONSE_INVALID');
 for(const row of v.routes){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(row.id)||row.provider!=='naumi-account-'+row.id||row.baseURL!==active.origin+'/api/desktop-models/v1/gateway/'+row.id||!['openai-completions','openai-responses','anthropic-messages'].includes(row.api)||!row.model?.id)throw Error('ACCOUNT_MODEL_RESPONSE_INVALID');}
 if(new Set(v.routes.map(x=>x.id)).size!==v.routes.length)throw Error('ACCOUNT_MODEL_RESPONSE_INVALID');
 if(fs.existsSync(marker)){if(fs.lstatSync(marker).isSymbolicLink())throw Error('ACCOUNT_MODEL_STATE_INVALID');const old=JSON.parse(fs.readFileSync(marker));if(old.deviceId!==deviceId||old.subject!==v.subject||old.origin!==active.origin||old.revision>v.revision)throw Error('ACCOUNT_MODEL_REVISION_ROLLBACK');}
 if(this.identity()!==runtime||runtime.active!==active)throw Error('ACCOUNT_MODEL_ACCOUNT_CHANGED');atomic(marker,{version:1,subject:v.subject,origin:active.origin,deviceId,revision:v.revision});this.value=v;return v;
 }catch(e){if(this.owner===active)this.value=null;throw Error(/^ACCOUNT_MODEL_[A-Z_]+$/.test(e.message)?e.message:'ACCOUNT_MODEL_UNAVAILABLE');}finally{this.running--;}})();
 const flight={owner:active,promise};this.flight=flight;try{return await promise;}finally{if(this.flight===flight)this.flight=null;}
 }
}
module.exports={AccountModelsSession};
