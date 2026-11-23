'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {browserURL}=require('./policy.cjs');
const actions=new Set(['state','navigate','back','forward','reload','click','fill','press','text','wheel','snapshot','tabs','select','finish']);
const snapshotScript=`(()=>{
 const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const selector=e=>{if(e.id)return '#'+CSS.escape(e.id);const parts=[];for(let n=e;n&&n!==document.documentElement;n=n.parentElement){let i=1;for(let p=n.previousElementSibling;p;p=p.previousElementSibling)if(p.tagName===n.tagName)i++;parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+i+')');}return 'html>'+parts.join('>');};
 return {title:document.title,url:location.href,text:(document.body?.innerText??'').slice(0,16000),elements:[...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')].filter(visible).slice(0,160).map(e=>({selector:selector(e),role:e.getAttribute('role')||e.tagName.toLowerCase(),type:e.getAttribute('type'),name:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||'').slice(0,160)}))};
})()`;
async function elementPoint(guest,selector,{fill=false}={}){
 if(typeof selector!=='string'||selector.length>4096)throw Error('INVALID_BROWSER_SELECTOR');
 const result=await guest.executeJavaScript(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return {error:'BROWSER_ELEMENT_NOT_FOUND'};${fill?"if(!e.matches('input:not([type=password]):not([type=file]),textarea,[contenteditable=true]'))return {error:'BROWSER_FIELD_NOT_EDITABLE'};":""}e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();if(!r.width||!r.height||e.disabled)return {error:'BROWSER_ELEMENT_NOT_VISIBLE'};return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
 if(result.error)throw Error(result.error);return result;
}
function click(guest,p){guest.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});guest.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p});}
const info=e=>({label:e.label,tabId:e.tabId,title:e.guest.getTitle(),url:e.guest.getURL(),canGoBack:e.guest.navigationHistory.canGoBack(),canGoForward:e.guest.navigationHistory.canGoForward(),loading:e.guest.isLoading(),engine:'chromium',presentation:'native-webview',error:e.error??null});
class BrowserTools {
 constructor(guests,window){this.guests=guests;this.window=window;this.queues=new Map();}
 async perform(sessionId,input){
  if(typeof sessionId!=='string'||!sessionId||sessionId.length>200||!input||!actions.has(input.action))throw Error('INVALID_BROWSER_ACTION');
  const before=this.queues.get(sessionId)??Promise.resolve();
  const next=before.catch(()=>{}).then(()=>this.run(sessionId,input));this.queues.set(sessionId,next);
  try{return await next;}finally{if(this.queues.get(sessionId)===next)this.queues.delete(sessionId);}
 }
 async run(sessionId,args){
  let entry=this.guests.selected(sessionId);
  if(!entry&&args.action==='navigate'){
   const url=browserURL(args.url,this.guests.hostURL);this.window.webContents.send('naumi:browser-tool-request',{action:'open',sessionId,url});
   const deadline=Date.now()+8000;while(!entry&&Date.now()<deadline){await new Promise(r=>setTimeout(r,40));entry=this.guests.selected(sessionId);}
  }
  if(args.action==='tabs')return {tabs:this.guests.entries(sessionId).map(info),engine:'chromium'};
  if(!entry)throw Error('NATIVE_BROWSER_OPEN_CURRENT_SESSION');
  if(args.action==='select'){
   entry=this.guests.entries(sessionId).find(e=>e.label===args.label);if(!entry)throw Error('INVALID_BROWSER_PAGE');
   entry.selectedAt=Date.now();this.window.webContents.send('naumi:browser-tool-request',{action:'select',sessionId,tabId:entry.tabId});return info(entry);
  }
  const g=entry.guest;
  switch(args.action){
   case 'navigate':await g.loadURL(browserURL(args.url,this.guests.hostURL));break;
   case 'back':if(g.navigationHistory.canGoBack())g.navigationHistory.goBack();break;
   case 'forward':if(g.navigationHistory.canGoForward())g.navigationHistory.goForward();break;
   case 'reload':g.reload();break;
   case 'snapshot':return {...info(entry),snapshot:await g.executeJavaScript(snapshotScript)};
   case 'click':{let p;if(args.selector)p=await elementPoint(g,args.selector);else{if(!Number.isFinite(args.x)||!Number.isFinite(args.y)||args.x<0||args.y<0)throw Error('INVALID_BROWSER_POINT');p={x:Math.round(args.x),y:Math.round(args.y)};}click(g,p);break;}
   case 'fill':{if(typeof args.text!=='string'||args.text.length>16384)throw Error('INVALID_BROWSER_TEXT');click(g,await elementPoint(g,args.selector,{fill:true}));g.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});g.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await g.insertText(args.text);break;}
   case 'text':if(typeof args.text!=='string'||args.text.length>16384)throw Error('INVALID_BROWSER_TEXT');await g.insertText(args.text);break;
   case 'press':{if(typeof args.key!=='string'||args.key.length>64)throw Error('INVALID_BROWSER_KEY');const keys=args.key.split('+'),keyCode=keys.pop(),modifiers=keys.map(x=>({Control:'control',Ctrl:'control',Shift:'shift',Alt:'alt',Meta:'meta'})[x]);if(modifiers.some(x=>!x))throw Error('INVALID_BROWSER_KEY');g.sendInputEvent({type:'keyDown',keyCode,modifiers});g.sendInputEvent({type:'keyUp',keyCode,modifiers});break;}
   case 'wheel':{const p={x:Math.round(args.x??60),y:Math.round(args.y??60),deltaX:-(args.deltaX??0),deltaY:-(args.deltaY??0)};if(Object.values(p).some(x=>!Number.isFinite(x)))throw Error('INVALID_BROWSER_NUMBER');g.sendInputEvent({type:'mouseWheel',...p,canScroll:true});break;}
   case 'finish':return {...info(entry),retained:true};
  }
  return info(entry);
 }
}
async function startBridge({home,guests,window,enterprise,market,maintenance,browserConnections}){
 const token=randomBytes(32).toString('hex'),native=new BrowserTools(guests,window),runtime=browserConnections?await browserConnections.start(native):native;
 const file=path.join(home,'naumi-desktop-bridge.json');
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const send=(code,value)=>{if(!res.destroyed){res.writeHead(code);res.end(JSON.stringify(value));}};
  const received=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+token);
  if(req.headers.origin||received.length!==expected.length||!timingSafeEqual(received,expected)){send(403,{error:'NATIVE_BROWSER_AUTH_REQUIRED'});return;}
  if(req.method==='GET'&&req.url==='/health'){send(200,{ok:true,protocolVersion:1,pid:process.pid,engine:'chromium'});return;}
  if(req.method==='POST'&&req.url==='/maintenance'){
   try{const ticket=req.headers['x-naumi-maintenance-ticket'],action=req.headers['x-naumi-maintenance-action'];if(!maintenance||typeof ticket!=='string'||!/^[a-f0-9]{64}$/.test(ticket)||!['quiesce','resume','stop'].includes(action))throw Error('INSTALL_MAINTENANCE_UNSUPPORTED');await maintenance.perform(action,ticket);if(action==='stop')res.once('finish',()=>setImmediate(()=>maintenance.quit(ticket)));send(200,{ok:true,maintenanceProtocol:1,pid:process.pid});}
   catch(error){send(409,{error:/^INSTALL_[A-Z_]+$/.test(error.message)?error.message:'INSTALL_ACTIVITY_UNKNOWN'});}return;
  }
  if(maintenance?.blocked()){send(503,{error:'INSTALL_MAINTENANCE_ACTIVE'});return;}
  if(req.method==='POST'&&req.url==='/enterprise/business'){
   if(!enterprise?.business){send(503,{ok:false,error:'BUSINESS_DESKTOP_UPGRADE_REQUIRED'});return;}
   const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);
   try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>29*1024*1024)throw Error('BUSINESS_BODY_TOO_LARGE');chunks.push(chunk);}send(200,{ok:true,data:await enterprise.business.perform(JSON.parse(Buffer.concat(chunks)),{signal:controller.signal})});}
   catch(error){send(409,{ok:false,error:/^BUSINESS_[A-Z_]+$/.test(error.message)?error.message:'BUSINESS_RESULT_UNKNOWN'});}finally{res.off('close',abort);}return;
  }
  if(req.method==='POST'&&req.url==='/market/request'){
   if(!market){send(503,{error:'MARKET_LOGIN_REQUIRED'});return;}
   const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);
   try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>3*1024*1024+8192)throw Error('MARKET_BODY_INVALID');chunks.push(chunk);}send(200,{ok:true,data:await market.perform(JSON.parse(Buffer.concat(chunks)),{signal:controller.signal})});}
   catch(error){send(502,{ok:false,error:/^MARKET_[A-Z_]+$/.test(error.message)?error.message:'MARKET_UNAVAILABLE_NO_REPLAY'});}finally{res.off('close',abort);}return;
  }
  if(req.method==='POST'&&req.url==='/enterprise/request'){
   if(!enterprise){send(503,{error:'ENTERPRISE_SESSION_NOT_CONFIGURED'});return;}
   const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);
   try{let bytes=0;const chunks=[];for await(const data of req){bytes+=data.length;if(bytes>2*1024*1024+4096){send(413,{error:'ENTERPRISE_BODY_TOO_LARGE'});return;}chunks.push(data);}const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));send(200,{ok:true,data:await enterprise.perform(input,{signal:controller.signal})});}
   catch(error){send(502,{ok:false,error:/^ENTERPRISE_[A-Z_]+$/.test(error.message)?error.message:'ENTERPRISE_REQUEST_INVALID'});}
   finally{res.off('close',abort);}return;
  }
  if(req.method!=='POST'||req.url!=='/op'){send(404,{error:'NOT_FOUND'});return;}
  try{let body='',bytes=0;for await(const data of req){bytes+=data.length;if(bytes>65536){send(413,{error:'BODY_TOO_LARGE'});return;}body+=data.toString();}const {sessionId,input}=JSON.parse(body);send(200,{ok:true,data:await runtime.perform(sessionId,input)});}
  catch(error){send(400,{ok:false,error:/^[A-Z_0-9]{3,80}$/.test(error.message)?error.message:'NATIVE_BROWSER_OPERATION_FAILED_NO_REPLAY'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 fs.mkdirSync(home,{recursive:true});fs.writeFileSync(file,JSON.stringify({version:1,port:server.address().port,token,pid:process.pid,...(enterprise?{enterprise:enterprise.descriptor()}:{}),...(market?.descriptor()?{market:market.descriptor()}:{})}),{mode:0o600});
 return {runtime,close:async()=>{await browserConnections?.close();server.closeAllConnections();await new Promise(r=>server.close(r));try{if(JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);}catch{}}};
}
module.exports={BrowserTools,startBridge,snapshotScript};
