import http from 'node:http';import path from 'node:path';import {pathToFileURL} from 'node:url';import {MarketStore} from './store.mjs';import {digest,fail,MAX_PACKAGE_BYTES} from '../plugins/naumi-enterprise/market-contract.js';
const PREFIX='/api/plugin-market/v1';
export function canvasAuthentication({origin,tenant='naumi',moderators=[],fetcher=fetch}){
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
  const subject=user.email.toLowerCase();return{id:digest([issuer.origin,tenant,subject]),tenant,name:typeof user.name==='string'&&user.name.trim()?user.name.slice(0,160):subject.split('@')[0],moderator:privileged.has(subject)};
 };
}
export function marketServer({store,authenticate,publicOrigin}){return http.createServer(async(req,res)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');const send=(status,value)=>res.writeHead(status).end(JSON.stringify(value));try{
 const url=new URL(req.url,'http://localhost');if(url.pathname==='/health'||url.pathname==='/api/plugin-market/health'){send(200,{product:'Naumi Market',protocol:1});return;}if(!url.pathname.startsWith(PREFIX+'/')){send(404,{error:'NOT_FOUND'});return;}
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');send(405,{error:'MARKET_METHOD'});return;}
 if(req.method==='POST'&&(req.headers['x-naumi-market']!=='1'||req.headers.origin&&req.headers.origin!==(publicOrigin??'http://'+req.headers.host)))fail('MARKET_SAME_ORIGIN_REQUIRED',403);
 const actor=await authenticate(req);store.account(actor);const endpoint=url.pathname.slice(PREFIX.length);
 if(req.method==='GET'){
  if(endpoint==='/me'){send(200,{user:{id:actor.id,name:actor.name,moderator:!!actor.moderator}});return;}
  if(endpoint==='/packages'){send(200,store.list(actor,{mine:url.searchParams.get('view')==='mine',search:url.searchParams.get('q')??'',kind:url.searchParams.get('kind')??'',author:url.searchParams.get('author')??'',sort:url.searchParams.get('sort')??'popular'}));return;}
  const detail=endpoint.match(/^\/packages\/([a-f0-9-]{36})$/);if(detail){send(200,store.detail(actor,detail[1]));return;}
  const download=endpoint.match(/^\/downloads\/([a-f0-9-]{36})$/);if(download){const value=store.downloadBody(actor,download[1]);res.once('finish',()=>{try{store.served(actor,download[1]);}catch{}});send(200,value);return;}
  send(404,{error:'NOT_FOUND'});return;
 }
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_PACKAGE_BYTES+8192)fail('MARKET_PACKAGE_TOO_LARGE',413);chunks.push(chunk);}let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{fail('MARKET_INVALID_REQUEST');}
 const handlers={'/drafts':()=>store.saveDraft(actor,input),'/publish':()=>store.publish(actor,input),'/visibility':()=>store.visibility(actor,input),'/download':()=>store.download(actor,input),'/installed':()=>store.installed(actor,input),'/feedback':()=>store.feedback(actor,input)};if(!handlers[endpoint])fail('NOT_FOUND',404);send(200,handlers[endpoint]());
 }catch(error){if(!res.headersSent&&!res.destroyed)send(error.status??500,{error:/^MARKET_[A-Z_]+$/.test(error.message)?error.message:'MARKET_UNAVAILABLE'});else res.destroy();}});}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const origin=process.env.NAUMI_MARKET_AUTH_ORIGIN;if(!origin)throw Error('NAUMI_MARKET_AUTH_ORIGIN_REQUIRED');const store=new MarketStore(path.resolve(process.env.NAUMI_MARKET_DB??'market-data/market.sqlite')),server=marketServer({store,authenticate:canvasAuthentication({origin,tenant:process.env.NAUMI_MARKET_TENANT??'naumi',moderators:(process.env.NAUMI_MARKET_MODERATORS??'').split(',').filter(Boolean)}),publicOrigin:process.env.NAUMI_MARKET_PUBLIC_ORIGIN});server.requestTimeout=15000;server.headersTimeout=10000;server.listen(Number(process.env.PORT??3190),process.env.HOST??'127.0.0.1',()=>console.log('NAUMI_MARKET_READY port='+server.address().port));const stop=()=>{server.closeAllConnections();server.close(()=>{store.close();process.exit(0);});};process.on('SIGTERM',stop);process.on('SIGINT',stop);}
