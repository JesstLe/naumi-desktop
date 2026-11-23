import http from 'node:http';import path from 'node:path';import {pathToFileURL} from 'node:url';import {MarketStore} from './store.mjs';import {digest,fail,MAX_PACKAGE_BYTES} from '../plugins/naumi-enterprise/market-contract.js';
const PREFIX='/api/plugin-market/v1';
import {canvasAuthentication} from './auth.mjs';
export {canvasAuthentication} from './auth.mjs';
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
