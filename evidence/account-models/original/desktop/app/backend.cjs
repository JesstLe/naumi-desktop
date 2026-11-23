'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const profile=require('./profile.cjs');
const {currentWorkspace}=require('./workspaces.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function localURL(value){const u=new URL(value);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!u.port)throw Error('INVALID_LOCAL_BACKEND');return u.origin;}
function localSettings(app,{resourcesPath=process.resourcesPath,environment=process.env}={}){
 let root=environment.NAUMI_ROOT;const userData=app.getPath('userData'),link=path.join(userData,'backend-link.json');
 if(!root&&app.isPackaged&&fs.existsSync(link))root=JSON.parse(fs.readFileSync(link,'utf8')).root;
 if(!root&&!app.isPackaged)root=path.resolve(__dirname,'../..');
 if(root){
  root=path.resolve(root);const c=JSON.parse(fs.readFileSync(path.join(root,'config/local.json'),'utf8'));
  if(!['127.0.0.1','localhost'].includes(c.host)||!Number.isInteger(c.port)||c.port<1||c.port>65535)throw Error('INVALID_LOCAL_BACKEND');
  if(environment.NAUMI_ROOT&&environment.NAUMI_TEST!=='1'){fs.mkdirSync(path.dirname(link),{recursive:true});fs.writeFileSync(link,JSON.stringify({root},null,2)+'\n');}
  const settings={root,home:environment.NAUMI_DSH_HOME??c.home,url:environment.NAUMI_HOST_URL??`http://${c.host}:${c.port}`,node:environment.NAUMI_NODE??'node.exe',logDir:path.join(root,'logs'),isolated:false};
  if(app.isPackaged&&!environment.NAUMI_ROOT){const selected=require('./linked-service.cjs').readLink(userData);
   const releaseRoot=path.join(resourcesPath,'backend'),runtime=profile.runtimeReference(releaseRoot);if(runtime.version!==app.getVersion())throw Error('SERVICE_CLIENT_RELEASE_MISMATCH');
   if(selected?.serviceUpdates==='bundled'){
    if(!profile.samePath(settings.home,selected.home))throw Error('SERVICE_LINK_HOME_CHANGED');
    Object.assign(settings,{linkedService:true,releaseRoot,runtime,identity:profile.identity(settings.home),node:path.join(releaseRoot,'node.exe'),workspace:settings.root});
   }else Object.assign(settings,{linkedServiceCandidate:true,releaseRoot,runtime,linkFile:link});
  }
  return settings;
 }
 root=path.join(resourcesPath,'backend');const runtime=profile.runtimeReference(root),selected=currentWorkspace(userData),home=selected.home;
 const legacyAdoption=fs.existsSync(path.join(home,'profiles/web/package.json'))&&!profile.exists(path.join(home,'desktop-profile.json'));
 const identity=profile.identity(home),receipt=profile.runtimeReceipt(home,identity.id);
 return {root,home,workspaceId:selected.id,workspace:path.join(home,'workspace'),url:localURL(environment.NAUMI_HOST_URL??`http://127.0.0.1:${receipt?.port??3080}`),node:path.join(root,'node.exe'),logDir:path.join(home,'logs'),isolated:true,identity,runtime,legacyAdoption};
}
function launchFromLog(settings){
 for(const name of ['server.out.log','server.err.log']){let text='';try{text=fs.readFileSync(path.join(settings.logDir,name),'utf8');}catch{}const urls=text.match(/http:\/\/127\.0\.0\.1:\d+\/?\?token=[A-Za-z0-9_~.%-]+/g)??[];for(const url of urls.reverse())if(new URL(url).origin===settings.url)return url;}
 return settings.url;
}
async function waitBootstrap(settings,pid,{timeoutMs=90000,pollMs=350}={}){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){const url=launchFromLog(settings);if(new URL(url).searchParams.has('token'))return url;if(!alive(pid))throw Error('BACKEND_START_FAILED');await delay(pollMs);}
 throw Error('BACKEND_BOOTSTRAP_TIMEOUT');
}
async function probeIdentity(settings,{fetcher=fetch}={}){
 const nonce=randomBytes(32).toString('hex');
 try{
  const r=await fetcher(settings.url+'/naumi/desktop-instance',{redirect:'error',headers:{'x-naumi-desktop-challenge':nonce},signal:AbortSignal.timeout(1500)});if(!r.ok)return null;
  const reader=r.body.getReader();let bytes=0,text='';for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return null;}text+=Buffer.from(value).toString('utf8');}
  const v=JSON.parse(text);if(v.version!==2||v.id!==settings.identity.id||v.homeHash!==settings.identity.homeHash||v.enterpriseOrigin!==(settings.enterpriseOrigin??'')||v.port!==Number(new URL(settings.url).port)||!Number.isInteger(v.pid)||v.pid<1||!/^[a-f0-9]{64}$/.test(v.bundleId)||!/^[a-f0-9]{64}$/.test(v.proof))return null;
  const proof=createHmac('sha256',settings.identity.key).update([2,nonce,v.id,v.pid,v.bundleId,v.homeHash,v.port,v.enterpriseOrigin].join('|')).digest();
  return timingSafeEqual(proof,Buffer.from(v.proof,'hex'))?v:null;
 }catch{return null;}
}
async function maintenanceRequest(settings,action,ticket){
 const remote=await probeIdentity(settings);if(!remote)throw Error('INSTALL_BACKEND_IDENTITY_UNKNOWN');
 const nonce=randomBytes(32).toString('hex'),proof=createHmac('sha256',settings.identity.key).update([2,action,nonce,settings.identity.id,remote.pid,remote.bundleId,settings.identity.homeHash,Number(new URL(settings.url).port),settings.enterpriseOrigin??'',ticket].join('|')).digest('hex');
 const response=await fetch(settings.url+'/naumi/desktop-instance',{method:'POST',redirect:'error',headers:{'x-naumi-desktop-challenge':nonce,'x-naumi-desktop-action':action,'x-naumi-desktop-ticket':ticket,'x-naumi-desktop-stop':proof},signal:AbortSignal.timeout(3000)});
 const value=await response.json();if(!response.ok||value.maintenanceProtocol!==1)throw Error(/^INSTALL_[A-Z_]+$/.test(value.error??'')?value.error:'INSTALL_BACKEND_MAINTENANCE_UNKNOWN');return {pid:remote.pid,...value};
}
async function logoProbe(settings,{fetcher=fetch}={}){
 const expected=createHash('sha256').update(fs.readFileSync(path.join(settings.root,'plugins/naumi-enterprise/assets/symbol.svg'))).digest('hex');
 try{const r=await fetcher(settings.url+'/naumi/assets/symbol.svg',{signal:AbortSignal.timeout(1500),redirect:'error'});if(!r.ok)return false;return createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')===expected;}catch{return false;}
}
function portTaken(url){return new Promise(resolve=>{const u=new URL(url),s=net.connect({host:'127.0.0.1',port:Number(u.port)});let done=false;const end=value=>{if(done)return;done=true;s.destroy();resolve(value);};s.setTimeout(500,()=>end(true));s.once('connect',()=>end(true));s.once('error',e=>end(e.code!=='ECONNREFUSED'));});}
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(e=>e?reject(e):resolve(port));});});}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
function saveReceipt(settings,value){profile.atomic(path.join(settings.home,'desktop-backend.json'),{version:1,ownerId:settings.identity.id,...value});}
function clearReceipt(settings,runId){const file=path.join(settings.home,'desktop-backend.json');if(profile.runtimeReceipt(settings.home,settings.identity.id)?.runId===runId)fs.unlinkSync(file);}
async function stopInstance(settings,pid,bundleId,{timeoutMs=10000}={}){
 if(!alive(pid))return;
 const remote=await probeIdentity(settings);if(!remote){if(!alive(pid))return;throw Error('BACKEND_STOP_UNKNOWN');}
 if(remote.pid!==pid||remote.bundleId!==bundleId)throw Error('BACKEND_STOP_IDENTITY_CHANGED');
 const nonce=randomBytes(32).toString('hex'),proof=createHmac('sha256',settings.identity.key).update([2,'stop',nonce,settings.identity.id,pid,bundleId,settings.identity.homeHash,Number(new URL(settings.url).port),settings.enterpriseOrigin??''].join('|')).digest('hex');
 try{const r=await fetch(settings.url+'/naumi/desktop-instance',{method:'POST',redirect:'error',headers:{'x-naumi-desktop-challenge':nonce,'x-naumi-desktop-stop':proof},signal:AbortSignal.timeout(2000)});if(!r.ok)throw Error('STOP');await r.arrayBuffer();}catch{if(!alive(pid))return;throw Error('BACKEND_STOP_UNKNOWN');}
 const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){if(!alive(pid))return;await delay(50);}throw Error('BACKEND_STOP_UNKNOWN');
}
async function stopBackend(backend,{timeoutMs=10000}={}){
 if(!backend?.owned)return;if(backend.stop){await backend.stop({timeoutMs});return;}if(!backend.child)return;
 const child=backend.child;if(child.exitCode!==null||child.signalCode!==null)return;
 const closed=new Promise(resolve=>child.once('close',()=>resolve(true)));if(!child.kill())throw Error('BACKEND_STOP_UNKNOWN');
 let timer;const done=await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);clearTimeout(timer);if(!done)throw Error('BACKEND_STOP_UNKNOWN');
}
function createQuitGate({shutdown,onReady,onError}){
 let phase='idle',flight,quitting=false;
 const prepare=()=>{if(!flight){phase='stopping';flight=Promise.resolve().then(shutdown).then(()=>{phase='ready';},error=>{phase='failed';throw error;});}return flight;};
 return {prepare,reset(){if(phase==='stopping')throw Error('QUIT_PREPARATION_ACTIVE');phase='idle';flight=null;quitting=false;},beforeQuit(event){if(phase==='ready')return;event.preventDefault();if(quitting)return;quitting=true;prepare().then(onReady,onError);},settled:()=>flight??Promise.resolve(),get phase(){return phase;}};
}
async function ensureBackend(settings,{fetcher=fetch,startTimeoutMs=90000,pollMs=350,portRetries=2}={}){
 if(settings.linkedService&&!settings.serviceLease){const release=require('./linked-service.cjs').acquire(settings.root,'desktop-linked-update');settings.serviceLease=true;try{return await ensureBackend(settings,{fetcher,startTimeoutMs,pollMs,portRetries});}finally{delete settings.serviceLease;release();}}
 if(settings.isolated||settings.linkedService){
  settings.url=localURL(settings.url);profile.profileState(settings.home,settings.identity.id);const receipt=profile.runtimeReceipt(settings.home,settings.identity.id);
  const candidate={...settings,url:receipt?`http://127.0.0.1:${receipt.port}`:settings.url},remote=await probeIdentity(candidate,{fetcher});
  if(remote){
   if(remote.bundleId!==settings.runtime.bundleId){
    if(!settings.linkedService)throw Error('BACKEND_UPGRADE_REQUIRES_STOP');
    // Reuse the signed admission latch. Running/unknown work is deferred, never cancelled.
    const ticket=randomBytes(32).toString('hex');await maintenanceRequest(candidate,'quiesce',ticket);
    try{await stopInstance(candidate,remote.pid,remote.bundleId);}catch(e){await maintenanceRequest(candidate,'resume',ticket).catch(()=>{});throw e;}
    return ensureBackend(settings,{fetcher,startTimeoutMs,pollMs,portRetries});
   }
   if(settings.linkedService){const p=require('./linked-service.cjs').plan({root:settings.root,home:settings.home,releaseRoot:settings.releaseRoot,version:settings.runtime.version});if(p.changed)throw Error('SERVICE_ACTIVE_CODE_DRIFT');}
   settings.url=candidate.url;const launchURL=await waitBootstrap(settings,remote.pid,{timeoutMs:startTimeoutMs,pollMs});saveReceipt(settings,{pid:remote.pid,port:Number(new URL(settings.url).port),bundleId:remote.bundleId,phase:'ready',runId:receipt?.runId??randomUUID()});
   return {launchURL,owned:true,reattached:true,instanceVerified:true,stop:options=>stopInstance(settings,remote.pid,remote.bundleId,options)};
  }
  if(receipt&&(receipt.pid===null||alive(receipt.pid)))throw Error(receipt.pid===null?'PROFILE_BACKEND_START_UNKNOWN':'PROFILE_BACKEND_UNREACHABLE');
  if(await portTaken(settings.url)){
   if(settings.linkedService)throw Error('LINKED_SERVICE_REQUIRES_STOP');
   if(settings.legacyAdoption&&!receipt&&await logoProbe(settings,{fetcher}))throw Error('LEGACY_BACKEND_REQUIRES_STOP');
   settings.url='http://127.0.0.1:'+await freePort();
  }
  if(settings.linkedService)require('./linked-service.cjs').synchronize(settings);else profile.prepareProfile(settings);
  require('./embedded-models.cjs').apply(settings);
  settings.workspace??=path.join(settings.home,'workspace');
  if(profile.exists(settings.workspace)&&(!fs.lstatSync(settings.workspace).isDirectory()||fs.lstatSync(settings.workspace).isSymbolicLink()))throw Error('PROFILE_WORKSPACE_UNMANAGED');
  if(!settings.linkedService)await require(path.join(settings.root,'plugins/naumi-enterprise/managed-workspace.cjs')).createManagedWorkspace(settings.workspace,{parent:settings.home});
 }else{
  if(await logoProbe(settings,{fetcher}))return {launchURL:launchFromLog(settings),owned:false};
  if(await portTaken(settings.url))throw Error('LOCAL_PORT_OCCUPIED');
 }
 const entry=path.join(settings.root,'node_modules/@deepseek-ai/dsh/lib/bin.js');if(!fs.existsSync(entry))throw Error('BACKEND_RUNTIME_MISSING');
 fs.mkdirSync(settings.logDir,{recursive:true});
 const trial=require('./internal-trial.cjs').trialLaunch(settings);
 const target=new URL(settings.url),runId=randomUUID(),env={...process.env,PATH:path.join(settings.root,'bin')+path.delimiter+settings.root+path.delimiter+(process.env.PATH??''),DSH_HOME:settings.home,DSH_TELEMETRY_MODE:'DISABLED'};
 Object.assign(env,trial.env);
 // Only an explicitly staged rollout enables replacement. Ordinary/frozen bundles stay unchanged.
 delete env.NAUMI_MODEL_POLICY;
 if(settings.isolated||settings.linkedService){
  const manifestFile=path.join(settings.releaseRoot??settings.root,'runtime-manifest.json');
  const policy=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)).modelPolicy:undefined;
  if(policy!==undefined){if(policy!=='three-options-vision-20261120')throw Error('MODEL_POLICY_RESOURCE_INVALID');env.NAUMI_MODEL_POLICY=policy;}
 }
 delete env.ELECTRON_RUN_AS_NODE;delete env.NAUMI_DESKTOP_INSTANCE_ID;delete env.NAUMI_DESKTOP_BUNDLE_ID;delete env.NAUMI_ENTERPRISE_ORIGIN;
 const base={pid:null,port:Number(target.port),bundleId:settings.runtime?.bundleId,phase:'starting',runId};
 if(settings.isolated||settings.linkedService){env.NAUMI_DESKTOP_MAINTENANCE='1';env.NAUMI_DESKTOP_INSTANCE_ID=settings.identity.id;env.NAUMI_DESKTOP_BUNDLE_ID=settings.runtime.bundleId;if(settings.enterpriseOrigin)env.NAUMI_ENTERPRISE_ORIGIN=settings.enterpriseOrigin;}
 let out,err;try{out=fs.openSync(path.join(settings.logDir,'server.out.log'),'w');err=fs.openSync(path.join(settings.logDir,'server.err.log'),'w');}catch(e){if(out!==undefined)fs.closeSync(out);throw e;}
 let child;
 // Windows libuv's non-detached child job dies with the GUI. Standalone workers have an
 // independent lifetime, and are stopped only through their proven instance on normal quit.
 try{if(settings.isolated||settings.linkedService)saveReceipt(settings,base);child=spawn(settings.node,[entry,'web',...trial.args,'--host','127.0.0.1','--port',target.port,'--no-open'],{cwd:settings.isolated?settings.workspace:settings.root,env,detached:!!(settings.isolated||settings.linkedService),windowsHide:true,stdio:['ignore',out,err]});}
 catch(e){if(settings.isolated||settings.linkedService)clearReceipt(settings,runId);throw e;}
 finally{fs.closeSync(out);fs.closeSync(err);}
 let error;child.on('error',e=>error=e);const backend={owned:true,child,instanceVerified:!!(settings.isolated||settings.linkedService)};
 try{
  if((settings.isolated||settings.linkedService)&&child.pid)saveReceipt(settings,{...base,pid:child.pid});
  const deadline=Date.now()+startTimeoutMs;
  while(Date.now()<deadline){
   if(error||child.exitCode!==null||child.signalCode!==null)throw Error('BACKEND_START_FAILED');
   const remote=settings.isolated||settings.linkedService?await probeIdentity(settings,{fetcher}):await logoProbe(settings,{fetcher});
   if(remote){
    if((settings.isolated||settings.linkedService)&&(remote.pid!==child.pid||remote.bundleId!==settings.runtime.bundleId))throw Error('BACKEND_IDENTITY_CONFLICT');
    const launchURL=settings.isolated||settings.linkedService?await waitBootstrap(settings,child.pid,{timeoutMs:Math.max(1,deadline-Date.now()),pollMs}):launchFromLog(settings);
    if(settings.isolated||settings.linkedService)saveReceipt(settings,{...base,pid:child.pid,phase:'ready'});
    return {...backend,launchURL,...((settings.isolated||settings.linkedService)?{stop:options=>stopInstance(settings,child.pid,settings.runtime.bundleId,options)}:{})};
   }
   await delay(pollMs);
  }
  throw Error('BACKEND_START_TIMEOUT');
 }catch(e){
  if(child.pid)await stopBackend(backend);if(settings.isolated||settings.linkedService)clearReceipt(settings,runId);
  let occupied=false;try{occupied=/EADDRINUSE/.test(fs.readFileSync(path.join(settings.logDir,'server.err.log'),'utf8'));}catch{}
  if(settings.isolated&&e.message==='BACKEND_START_FAILED'&&occupied&&portRetries>0){settings.url='http://127.0.0.1:'+await freePort();return ensureBackend(settings,{fetcher,startTimeoutMs,pollMs,portRetries:portRetries-1});}
  throw e;
 }
}
module.exports={maintenanceRequest,localSettings,ensureBackend,launchFromLog,localURL,probeIdentity,stopBackend,portTaken,createQuitGate};
