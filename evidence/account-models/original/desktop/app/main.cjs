'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {app,BrowserWindow,ipcMain,Menu,nativeTheme,shell,session,dialog,safeStorage,clipboard}=require('electron');
const {EnterpriseSession}=require('./enterprise.cjs');
const {BusinessSession}=require('./business-session.cjs');
const {workspaceSummary,selectWorkspace,verifyConnection,assertWorkspaceIdle}=require('./workspaces.cjs');
const {Guests}=require('./guests.cjs');
const {startBridge}=require('./tools.cjs');
const {BrowserConnections}=require('./browser-connect.cjs');
const {localSettings,ensureBackend,stopBackend,createQuitGate,maintenanceRequest}=require('./backend.cjs');
const installerState=require('./installer-state.cjs');
const {createDesktopUpdates}=require('./updates.cjs');
const {admitUpdate}=require('./update-gate.cjs');
const {IdentityRuntime}=require('./identity-runtime.cjs');
const {MarketSession}=require('./market.cjs');
const {CloudSession,CloudBackup}=require('./cloud.cjs');
const {CreationVault}=require('./creation-vault.cjs');
const {identityOrigin}=require('./identity.cjs');
const {randomUUID}=require('node:crypto');
app.setName('Naumi');app.setAppUserModelId('com.naumi.desktop');
if(process.env.NAUMI_USER_DATA)app.setPath('userData',path.resolve(process.env.NAUMI_USER_DATA));
if(process.env.NAUMI_TEST_HIDDEN==='1'){app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');}
const locked=app.requestSingleInstanceLock();
let identityRuntime=null,identityUserData=null;
const market=new MarketSession({identity:()=>identityRuntime});
const cloud=new CloudSession({identity:()=>identityRuntime});
const creation=new CreationVault({identity:()=>identityRuntime,safeStorage});
const DEFAULT_IDENTITY_ORIGIN='https://47.105.59.142';
const {enterpriseConnection,allowedEnterpriseNavigation}=require('./enterprise-defaults.cjs');
let cloudBusy=0;
let browserManager=null,browserManagerConnection=null,browserManagerSession=null;
let window,primarySession,guests,bridge,backend,settings,enterprise,login,loginAfterBoot=false,booting=false,closing=false,connecting=false,editingConnection=false,connectionFlight,maintenanceTicket=null,maintenanceUntil=0,updates=null,quitGate;
if(!locked){app.quit();}else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.whenReady().then(async()=>{
 if(app.isPackaged){try{installerState.assertStartupAllowed(path.resolve(process.resourcesPath,'..'));}catch(error){if(error.message==='INSTALL_MAINTENANCE_ACTIVE'){app.exit(42);return;}throw error;}}
 nativeTheme.themeSource='light';Menu.setApplicationMenu(null);
 const icon=path.join(__dirname,'assets/naumi.ico');
 window=new BrowserWindow({width:1460,height:930,minWidth:1000,minHeight:640,show:false,title:'Naumi',backgroundColor:'#f7f9fc',icon,webPreferences:{preload:path.join(__dirname,'preload.cjs'),additionalArguments:['--naumi-desktop-version='+app.getVersion()],contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:true,partition:'persist:naumi-workbench',spellcheck:false,backgroundThrottling:false}});
 primarySession=window.webContents.session;
 if(app.isPackaged||process.env.NAUMI_UPDATE_DEV==='1'){
  try{
   const {autoUpdater}=require('electron-updater');
   autoUpdater.installDirectory=path.dirname(process.execPath);
   if(process.env.NAUMI_UPDATE_DEV==='1')autoUpdater.forceDevUpdateConfig=true;
   updates=createDesktopUpdates({app,updater:autoUpdater,notify:showUpdateNotice,canInstall:canInstallUpdate,prepareInstall:async()=>{closing=true;await quitGate.prepare();},broadcast:snapshot=>{if(window&&!window.isDestroyed())window.webContents.send('naumi:update-state',snapshot);},log:(...args)=>{if(process.env.NAUMI_UPDATE_DEV==='1')console.warn('[updates]',...args);}});
   const started=updates.start();if(!started.ok)console.warn('[updates] disabled:',started.error);
  }catch(error){console.warn('[updates] unavailable:',error.message);}
 }
 window.on('close',()=>{closing=true;});
 window.on('page-title-updated',e=>{e.preventDefault();window.setTitle('Naumi');});
 window.webContents.on('will-navigate',(event,url)=>{if(settings&&new URL(url).origin!==settings.url)event.preventDefault();});
 window.webContents.setWindowOpenHandler(({url})=>{
  try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return {action:'deny'};
   if((settings?.isolated||settings?.linkedService)&&u.origin===settings.enterpriseOrigin&&u.pathname==='/login'){openEnterpriseLogin();
   }else if(!settings?.isolated&&u.origin==='http://127.0.0.1:3112'&&u.pathname.startsWith('/login')){
    const login=new BrowserWindow({parent:window,width:1040,height:780,title:'Naumi · 登录',icon,backgroundColor:'#fff',webPreferences:{session:window.webContents.session,sandbox:true,contextIsolation:true,nodeIntegration:false}});
    login.webContents.setWindowOpenHandler(()=>({action:'deny'}));login.webContents.on('will-navigate',(e,next)=>{if(new URL(next).origin!==u.origin)e.preventDefault();});void login.loadURL(url);
    login.on('closed',()=>{if(!closing&&!window.isDestroyed())window.webContents.reload();});
   }else void shell.openExternal(u.href);
  }catch{}return {action:'deny'};
 });
 window.webContents.on('did-fail-load',(_e,code,description,_url,main)=>{if(main&&code!==-3&&!booting)void showStartup(description+' ('+code+')');});
 const ownFrame=event=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');};
 const localPage=(event,names)=>{ownFrame(event);const u=new URL(event.senderFrame.url);return u.protocol==='file:'&&names.some(name=>u.pathname===require('node:url').pathToFileURL(path.join(__dirname,name)).pathname);};
 const accountPage=event=>localPage(event,['identity.html']);
 const trusted=event=>{ownFrame(event);if(!settings||new URL(event.senderFrame.url).origin!==settings.url||connecting||maintenanceBlocked())throw Error('INVALID_DESKTOP_ORIGIN');};
 ipcMain.handle('naumi:browser-manager',async(e,input)=>{
  trusted(e);if(typeof input?.sessionId!=='string'||!input.sessionId||input.sessionId.length>200||!bridge?.runtime.external)throw Error('BROWSER_SESSION_REQUIRED');
  browserManager?.close();browserManagerConnection=bridge.runtime;browserManagerSession=input.sessionId;
  const manager=new BrowserWindow({parent:window,width:720,height:820,minWidth:480,minHeight:540,title:'浏览器连接 · Naumi',backgroundColor:'#f6f8fc',webPreferences:{preload:path.join(__dirname,'browser-manager-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});browserManager=manager;
  manager.webContents.setWindowOpenHandler(()=>({action:'deny'}));manager.webContents.on('will-navigate',event=>event.preventDefault());manager.on('closed',()=>{if(browserManager===manager){browserManager=null;browserManagerConnection=null;browserManagerSession=null;}});
  await manager.loadFile(path.join(__dirname,'browser-manager.html'));return {opened:true};
 });
 ipcMain.handle('naumi:browser-control',async(e,input)=>{
  const conn=browserManagerConnection,id=browserManagerSession;
  if(!browserManager||e.sender!==browserManager.webContents||e.senderFrame!==browserManager.webContents.mainFrame||e.senderFrame.url!==require('node:url').pathToFileURL(path.join(__dirname,'browser-manager.html')).href||bridge?.runtime!==conn||closing||connecting||maintenanceBlocked())throw Error('BROWSER_MANAGER_INACTIVE');
  try{
   let data;
   if(input?.action==='status')data=conn.status(id);
   else if(input?.action==='extension'){const error=await shell.openPath(conn.exportExtension());if(error)throw Error('BROWSER_EXTENSION_OPEN_FAILED');data={opened:true};}
   else if(input?.action==='pair'){clipboard.writeText(conn.external.pair(id));data={copied:true};}
   else if(input?.action==='disconnect')data=conn.disconnect(id);
   else if(input?.action==='save')data=conn.vault.save(input);
   else if(input?.action==='remove')data=conn.vault.remove(input.id);
   else throw Error('BROWSER_MANAGER_ACTION_INVALID');
   return {ok:true,data};
  }catch{return {ok:false,error:'操作未完成，请检查网站地址、系统加密存储或连接状态。'};}
 });
 ipcMain.handle('naumi:browser-acquire',(e,workspace)=>{trusted(e);return guests.acquire(e.sender,workspace);});
 ipcMain.handle('naumi:browser-release',(e,lease)=>{trusted(e);return guests.release(e.sender,lease);});
 ipcMain.handle('naumi:browser-bind',(e,value)=>{trusted(e);return guests.bind(e.sender,value);});
 ipcMain.handle('naumi:retry',e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');void boot();});
 ipcMain.handle('naumi:update-state',e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');return updates?updates.snapshot():{enabled:false,status:'disabled',currentVersion:app.getVersion(),version:null,notes:'',progress:null,error:null};});
 ipcMain.handle('naumi:runtime-info',e=>{ownFrame(e);return {clientVersion:app.getVersion(),backendMode:settings?.isolated||settings?.linkedService?'managed':'external',backendURL:settings?.url??null};});
 ipcMain.handle('naumi:update-check',async e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');return updates?updates.check():{ok:false,error:'UPDATE_FEED_UNCONFIGURED'};});
 ipcMain.handle('naumi:update-install',async e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');return updates?updates.install():{ok:false,error:'UPDATE_FEED_UNCONFIGURED'};});
 ipcMain.handle('naumi:connection-state',e=>{if(!localPage(e,['connect.html','startup.html']))trusted(e);if(!settings?.isolated)return {available:false};return {available:true,...workspaceSummary(identityUserData??app.getPath('userData'))};});
 ipcMain.handle('naumi:connection-settings',async e=>{
  if(!localPage(e,['startup.html']))trusted(e);if(!settings?.isolated||booting||connecting)return {ok:false,error:'WORKSPACE_SETTINGS_BUSY'};
  try{if((bridge?.runtime.queues.size??0)>0)throw Error('WORKSPACE_OPERATIONS_IN_FLIGHT');if(backend?.owned){const r=require('./profile.cjs').runtimeReceipt(settings.home,settings.identity.id);if(!r||r.pid===null||isAlive(r.pid))await assertWorkspaceIdle(settings,(url,options)=>primarySession.fetch(url,options));}}
  catch(error){const code=/^WORKSPACE_[A-Z_]+$/.test(error.message)?error.message:'WORKSPACE_ACTIVITY_UNKNOWN';if(process.env.NAUMI_TEST_HIDDEN!=='1')await dialog.showMessageBox(window,{type:'info',buttons:['返回工作台'],message:code==='WORKSPACE_RUNNING_TASKS'?'请先停止当前工作区的运行任务':'当前操作状态未确认，请稍后重试'});return {ok:false,error:code};}
  editingConnection=true;if(login&&!login.isDestroyed())login.destroy();await window.loadFile(path.join(__dirname,'connect.html'));return {ok:true};
 });
 ipcMain.handle('naumi:connection-cancel',e=>{if(!localPage(e,['connect.html']))throw Error('INVALID_DESKTOP_SENDER');connectionFlight?.abort();return {ok:true};});
 ipcMain.handle('naumi:connection-resume',e=>{if(!localPage(e,['connect.html'])||!settings?.isolated)throw Error('INVALID_DESKTOP_SENDER');if(connecting||booting)return {ok:false,error:'WORKSPACE_SETTINGS_BUSY'};void boot();return {ok:true};});
 ipcMain.handle('naumi:enterprise-connect',async(e,origin)=>{
  if(!localPage(e,['connect.html'])||!settings?.isolated)throw Error('INVALID_DESKTOP_SENDER');
  if(connecting||booting)return {ok:false,error:'WORKSPACE_SETTINGS_BUSY'};connecting=true;connectionFlight=new AbortController();
  try{
   const checked=await verifyConnection(origin,(url,options)=>primarySession.fetch(url,options),{signal:connectionFlight.signal});
   const state=workspaceSummary(identityUserData??app.getPath('userData')),changed=state.configured&&state.origin!==checked.origin;
   if(changed){
    if((enterprise?.running??0)>0||market.running>0||cloud.running>0||cloudBusy>0||(bridge?.runtime.queues.size??0)>0)throw Error('WORKSPACE_OPERATIONS_IN_FLIGHT');
    if(backend?.owned){const r=require('./profile.cjs').runtimeReceipt(settings.home,settings.identity.id);if(!r||r.pid===null||isAlive(r.pid))await assertWorkspaceIdle(settings,(url,options)=>primarySession.fetch(url,options));connectionFlight.signal.throwIfAborted();await stopBackend(backend);backend=null;}
    else {const r=require('./profile.cjs').runtimeReceipt(settings.home,settings.identity.id);if(r&&(r.pid===null||isAlive(r.pid)))throw Error('WORKSPACE_BACKEND_STOP_REQUIRED');}
    await bridge?.close();bridge=null;
   }
   connectionFlight.signal.throwIfAborted();selectWorkspace(identityUserData??app.getPath('userData'),checked.origin);
   if(changed){settings=localSettings(accountApp());enterprise=null;}
   loginAfterBoot=true;void showStartup().then(()=>boot());return {ok:true};
  }catch(error){return {ok:false,error:connectionFlight.signal.aborted?'ENTERPRISE_CONNECTION_CANCELLED':/^(ENTERPRISE|WORKSPACE)_[A-Z_]+$/.test(error.message)?error.message:'ENTERPRISE_CONNECTION_UNAVAILABLE'};}
  finally{connecting=false;connectionFlight=null;}
 });
 ipcMain.handle('naumi:identity-state',e=>{if(!accountPage(e))trusted(e);return identityRuntime?.status()??{available:false};});
 ipcMain.handle('naumi:cloud',async(e,input)=>{
  if(!accountPage(e))throw Error('INVALID_DESKTOP_SENDER');
  if(!identityRuntime?.active)return{ok:false,error:'CLOUD_LOGIN_REQUIRED'};
  if(!input||Object.keys(input).some(k=>!['action','id'].includes(k))||!['list','backup','download'].includes(input.action)||cloudBusy)return{ok:false,error:'CLOUD_BUSY'};
  const active=identityRuntime.active;cloudBusy++;
  try{
   const backup=new CloudBackup({root:active.root,cloud,identity:()=>identityRuntime?.active,readLocal:async endpoint=>{if(!settings)throw Error('CLOUD_WORKSPACE_REQUIRED');const response=await primarySession.fetch(settings.url+endpoint,{credentials:'include',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('CLOUD_LOCAL_RESPONSE_INVALID');const raw=await response.text();if(Buffer.byteLength(raw)>2*1024*1024)throw Error('CLOUD_LOCAL_RESPONSE_TOO_LARGE');return JSON.parse(raw);}});
   if(input.action==='list')return{ok:true,result:await backup.list()};
   if(input.action==='backup'){if(!settings)throw Error('CLOUD_WORKSPACE_REQUIRED');await assertWorkspaceIdle(settings,(url,options)=>primarySession.fetch(url,options));return{ok:true,result:await backup.backup()};}
   const value=await backup.download(input.id);const chosen=await dialog.showSaveDialog(window,{defaultPath:'Naumi-backup-'+input.id+'.json',filters:[{name:'Naumi 数据副本',extensions:['json']}]});if(chosen.canceled)return{ok:true,canceled:true};if(identityRuntime.active!==active)throw Error('CLOUD_ACCOUNT_CHANGED');fs.writeFileSync(chosen.filePath,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});return{ok:true,saved:true};
  }catch(error){return{ok:false,error:/^(CLOUD|MARKET|WORKSPACE)_[A-Z_]+$/.test(error.message)?error.message:'CLOUD_UNAVAILABLE'};}finally{cloudBusy--;}
 });
 ipcMain.handle('naumi:creation',async(e,input)=>{
  if(!accountPage(e)){if(input?.action==='state')trusted(e);else throw Error('INVALID_DESKTOP_SENDER');}if(!identityRuntime?.active)return {ok:false,error:'CREATION_LOGIN_REQUIRED'};
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['action','token','workspace'].includes(k))||!['state','save','disconnect','open'].includes(input.action))return {ok:false,error:'CREATION_INPUT_INVALID'};
  let ticket=null,acquired=false,previous=null,changed=false;
  try{
   if(input.action==='state')return {ok:true,...creation.state()};
   if(input.action==='open'){await shell.openExternal(identityRuntime.active.origin+'/account/agent');return {ok:true};}
   if(connecting||closing||booting)throw Error('CREATION_BUSY');
   connecting=true;acquired=true;await assertAccountIdle();
   if(backend?.owned){ticket=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await performMaintenance('quiesce',ticket,{accountTransition:true});}
   previous=creation.snapshot();
   if(backend)await creationControl('disconnect');
   changed=true;
   await creation.release();
   if(input.action==='save')await creation.save({token:input.token,workspace:input.workspace});else await creation.disconnect();
   if(settings&&settings.isolated){await creation.activate(settings.home);if(backend)await creationControl('refresh');}
   return {ok:true,...creation.state()};
  }catch(error){if(changed&&previous){try{await creation.restore(previous);if(settings?.isolated){await creation.activate(settings.home);if(backend)await creationControl('refresh');}}catch{return {ok:false,error:'CREATION_RECOVERY_REQUIRED'};}}return {ok:false,error:/^CREATION_[A-Z_]+$/.test(error.message)?error.message:'CREATION_TRANSITION_FAILED'};}
  finally{if(ticket)await performMaintenance('resume',ticket).catch(()=>{});if(acquired)connecting=false;}
 });
 ipcMain.handle('naumi:identity-register',async(e,value)=>{
  if(!accountPage(e)||!identityRuntime)throw Error('INVALID_DESKTOP_SENDER');
  try{const origin=identityOrigin(value||identityRuntime.origin());if(identityRuntime.managedOrigin&&origin!==identityRuntime.managedOrigin)throw Error('IDENTITY_MANAGED_ORIGIN');await shell.openExternal(origin+'/');return {ok:true};}
  catch(error){return {ok:false,error:/^IDENTITY_[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_UNAVAILABLE'};}
 });
 ipcMain.handle('naumi:identity-login',async(e,input)=>{
  if(!accountPage(e)||!identityRuntime)throw Error('INVALID_DESKTOP_SENDER');
  if(booting||connecting||closing)return {ok:false,error:'IDENTITY_BUSY'};
  connecting=true;
  try{await identityRuntime.login(input);settings=null;identityUserData=identityRuntime.active.root;void showStartup().then(()=>boot());return {ok:true};}
  catch(error){return {ok:false,error:/^IDENTITY_[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_UNAVAILABLE'};}
  finally{connecting=false;}
 });
 ipcMain.handle('naumi:identity-open',async e=>{
  trusted(e);if(!identityRuntime)return {ok:false,error:'IDENTITY_UNAVAILABLE'};
  try{await assertAccountIdle();editingConnection=true;if(login&&!login.isDestroyed())login.destroy();await window.loadFile(path.join(__dirname,'identity.html'));return {ok:true};}
  catch(error){const code=/^(WORKSPACE|INSTALL)_[A-Z_]+$/.test(error.message)?error.message:'WORKSPACE_ACTIVITY_UNKNOWN';if(process.env.NAUMI_TEST_HIDDEN!=='1')await dialog.showMessageBox(window,{type:'info',buttons:['返回工作台'],message:'请先结束当前运行任务和操作，再管理账号'});return {ok:false,error:code};}
 });
 ipcMain.handle('naumi:identity-resume',e=>{if(!accountPage(e)||!identityRuntime?.active)throw Error('INVALID_DESKTOP_SENDER');void showStartup().then(()=>boot());return {ok:true};});
 ipcMain.handle('naumi:identity-logout',async e=>{
  if(!accountPage(e)||!identityRuntime)throw Error('INVALID_DESKTOP_SENDER');if(connecting||booting||closing)return {ok:false,error:'IDENTITY_BUSY'};
  connecting=true;let ticket=null;
  try{
   await assertAccountIdle();
   if(backend?.owned){ticket=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await performMaintenance('quiesce',ticket,{accountTransition:true});await stopBackend(backend);backend=null;}
   await guests?.reset({hostURL:settings?.url??'http://127.0.0.1:3080',account:'signed-out-'+randomUUID()});await bridge?.close();bridge=null;
   await creation.release();await primarySession.clearStorageData();await primarySession.clearCache();const result=await identityRuntime.logout();
   enterprise=null;settings=null;identityUserData=null;maintenanceTicket=null;maintenanceUntil=0;return {ok:true,...result};
  }catch(error){if(ticket&&backend?.owned)await performMaintenance('resume',ticket).catch(()=>{});return {ok:false,error:/^(IDENTITY|WORKSPACE|INSTALL|BACKEND)_[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_UNAVAILABLE'};}
  finally{connecting=false;}
 });
 ipcMain.handle('naumi:enterprise-login',e=>{trusted(e);openEnterpriseLogin();return {ok:true};});
 await showStartup();
 if(process.env.NAUMI_TEST_HIDDEN!=='1')window.show();
 await boot();
}).catch(error=>{console.error('NAUMI_DESKTOP_START_FAILED',error.message);app.quit();});
quitGate=createQuitGate({shutdown:async()=>{try{connectionFlight?.abort();if(login&&!login.isDestroyed()){login.webContents.stop();login.destroy();}await guests?.flush();await primarySession?.cookies.flushStore();await enterprise?.session.cookies.flushStore();await identityRuntime?.client?.session.cookies.flushStore();}finally{await bridge?.close();await stopBackend(backend);await creation.release();}},onReady:()=>app.quit(),onError:()=>app.exit(1)});
app.on('before-quit',event=>{closing=true;quitGate.beforeQuit(event);});
app.on('window-all-closed',()=>app.quit());
}
async function showStartup(error=''){
 if(closing||!window||window.isDestroyed())return;
 await window.loadFile(path.join(__dirname,'startup.html'),{query:error?{error}:{}});
}
async function boot(){
 if(booting||closing||connecting||maintenanceBlocked())return;booting=true;
 try{
  if(!settings){
   const candidate=localSettings(app);
   if(candidate.isolated||app.isPackaged||process.env.NAUMI_IDENTITY_ORIGIN){
    identityRuntime??=new IdentityRuntime({userData:app.getPath('userData'),sessionFor:name=>session.fromPartition(name),managedOrigin:process.env.NAUMI_IDENTITY_ORIGIN??(app.isPackaged?DEFAULT_IDENTITY_ORIGIN:''),legacyHome:candidate.isolated?undefined:candidate.home});
    const active=await identityRuntime.restore();
    if(!active){await window.loadFile(path.join(__dirname,'identity.html'));return;}
    identityUserData=active.root;
    if(candidate.isolated)settings=localSettings(accountApp());else settings=candidate;
   }else settings=candidate;
  }
  if(settings.isolated||settings.linkedService||settings.linkedServiceCandidate){
   if(settings.isolated)installerState.registerProfile(path.resolve(process.resourcesPath,'..'),identityUserData??app.getPath('userData'));
   const connection=enterpriseConnection({home:settings.home,packaged:app.isPackaged,identityOrigin:identityRuntime?.active?.origin??'',configuredOrigin:process.env.NAUMI_ENTERPRISE_ORIGIN});
   if(!connection&&!identityRuntime?.active){await window.loadFile(path.join(__dirname,'connect.html'));return;}
   settings.enterpriseOrigin=connection?.origin??'';
   if(connection&&!enterprise){const enterpriseBrowser=session.fromPartition('persist:naumi-enterprise-'+(identityRuntime?.active?.profileId??'legacy')+'-'+require('node:crypto').createHash('sha256').update(connection.origin).digest('hex'));const contract=require(path.join(settings.releaseRoot??settings.root,'plugins/naumi-enterprise/business-contract.cjs'));enterprise=new EnterpriseSession({origin:connection.origin,session:enterpriseBrowser,business:new BusinessSession({origin:connection.origin,session:enterpriseBrowser,root:path.join(settings.home,'naumi/business-private'),safeStorage,contract})});}
  }
  if(identityRuntime?.active&&settings.isolated)await creation.activate(settings.home);
  if(settings.linkedService)installerState.registerProfile(path.resolve(process.resourcesPath,'..'),app.getPath('userData'));
  const nextBackend=settings.linkedServiceCandidate?await require('./linked-service-migration.cjs').adopt(settings,{ensureBackend,stopBackend,launchFromLog:require('./backend.cjs').launchFromLog}):await ensureBackend(settings);
  if(settings.linkedService)installerState.registerProfile(path.resolve(process.resourcesPath,'..'),app.getPath('userData'));
  backend=backend?.owned&&!nextBackend.owned&&backend.child.exitCode===null&&backend.child.signalCode===null?{...nextBackend,owned:true,child:backend.child}:nextBackend;
  const account=identityRuntime?.active?'identity-'+identityRuntime.active.profileId+'-'+settings.workspaceId:!settings.isolated||settings.workspaceId==='default'?'local':'enterprise-'+settings.workspaceId;
  if(!guests){guests=new Guests({hostURL:settings.url,account,timeout:process.env.NAUMI_TEST==='1'?Number(process.env.NAUMI_TEST_TIMEOUT??30000):30000});guests.attach(window);}
  else if(guests.hostURL!==settings.url||guests.account!==account)await guests.reset({hostURL:settings.url,account});
  if(!bridge)bridge=await startBridge({home:settings.home,guests,window,enterprise,market,browserConnections:new BrowserConnections({root:path.join(identityRuntime?.active?.root??identityUserData??app.getPath('userData'),'browser-private'),hostURL:settings.url,safeStorage}),maintenance:{blocked:maintenanceBlocked,perform:performMaintenance,quit:ticket=>{if(maintenanceBlocked()&&ticket===maintenanceTicket)app.quit();}}});
  editingConnection=false;await window.loadURL(backend.launchURL);
  const serviceVersion=await verifyServiceVersion();
  require('./profile.cjs').atomic(path.join(app.getPath('userData'),'desktop-runtime.json'),{version:1,pid:process.pid,clientVersion:app.getVersion(),executable:process.execPath,backendMode:settings.isolated||settings.linkedService?'managed':'external',backendURL:settings.url,serviceVersion,serviceBundleId:settings.runtime?.bundleId??null,readyAt:new Date().toISOString()});
  if(loginAfterBoot){loginAfterBoot=false;openEnterpriseLogin();}
 }catch(error){await showStartup(error.message);}
 finally{booting=false;if(process.env.NAUMI_TEST==='1')globalThis.__naumiTest={window,guests,bridge,settings,backend,enterprise,get login(){return login;}};}
}
async function verifyServiceVersion(){
 const response=await primarySession.fetch(settings.url+'/',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('SERVICE_VERSION_UNKNOWN');
 const html=await response.text(),version=html.match(/"productVersion"\s*:\s*"(\d+\.\d+\.\d+)"/)?.[1];if(!version)throw Error('SERVICE_VERSION_UNKNOWN');
 if((settings.isolated||settings.linkedService)&&version!==app.getVersion())throw Error('SERVICE_VERSION_MISMATCH');return version;
}
function accountApp(){return {isPackaged:app.isPackaged,getPath:name=>name==='userData'&&identityUserData?identityUserData:app.getPath(name)};}
async function assertAccountIdle(){
 if((enterprise?.running??0)>0||market.running>0||cloud.running>0||cloudBusy>0||(bridge?.runtime.queues.size??0)>0)throw Error('WORKSPACE_OPERATIONS_IN_FLIGHT');
 if(backend&&!backend.owned&&settings?.isolated)throw Error('WORKSPACE_BACKEND_STOP_REQUIRED');
 if(backend)await assertWorkspaceIdle(settings,(url,options)=>primarySession.fetch(url,options));
}
function maintenanceBlocked(){if(maintenanceTicket&&Date.now()>=maintenanceUntil){maintenanceTicket=null;}return !!maintenanceTicket;}
async function canInstallUpdate(){
 const ticket=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
 const gate=await admitUpdate({settings,backend,prepared:quitGate?.phase==='ready',busy:closing||booting||connecting||(bridge?.runtime.queues.size??0)>0||(enterprise?.running??0)>0||market.running>0||cloud.running>0||cloudBusy>0,maintenance:maintenanceBlocked(),request:(...args)=>primarySession.fetch(...args),quiesce:()=>performMaintenance('quiesce',ticket),resume:()=>performMaintenance('resume',ticket)});
 if(gate.ok){if(gate.mode==='external'){maintenanceTicket=ticket;maintenanceUntil=Date.now()+30000;}const release=gate.release;gate.release=async()=>{if(quitGate?.phase==='ready'||quitGate?.phase==='failed'){quitGate.reset();closing=false;maintenanceTicket=null;backend=null;bridge=null;await boot();}else if(gate.mode==='external')maintenanceTicket=null;else await release?.();};}return gate;
}
async function showUpdateNotice(snapshot){
 if(!window||window.isDestroyed())return 1;
 const detail=(snapshot.notes||'（本次更新未提供更新日志）')+'\n\n当前版本 '+snapshot.currentVersion+' → 新版本 '+snapshot.version;
 const {response}=await dialog.showMessageBox(window,{type:'info',buttons:['立即重启更新','稍后'],defaultId:1,cancelId:1,noLink:true,title:'Naumi 更新',message:'新版本 '+snapshot.version+' 已下载完成',detail});
 return response;
}
async function performMaintenance(action,ticket,{accountTransition=false}={}){
 if(maintenanceBlocked()&&maintenanceTicket!==ticket)throw Error('INSTALL_MAINTENANCE_BUSY');
 if(action==='resume'){if(backend&&settings)await maintenanceRequest(settings,'resume',ticket);maintenanceTicket=null;return;}
 if(booting||(connecting&&!accountTransition)||closing||!(settings?.isolated||settings?.linkedService)||!backend?.owned)throw Error('INSTALL_ACTIVITY_UNKNOWN');
 maintenanceTicket=ticket;maintenanceUntil=Date.now()+30000;
 try{if((bridge?.runtime.queues.size??0)>0||(enterprise?.running??0)>0||market.running>0||cloud.running>0||cloudBusy>0)throw Error('INSTALL_OPERATIONS_IN_FLIGHT');await maintenanceRequest(settings,'quiesce',ticket);}
 catch(error){maintenanceTicket=null;throw error;}
}
function isAlive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
function openEnterpriseLogin(){
 if(closing||!enterprise||!settings?.enterpriseOrigin)return;
 if(login&&!login.isDestroyed()){if(process.env.NAUMI_TEST_HIDDEN!=='1')login.focus();return;}
 login=new BrowserWindow({parent:window,width:1040,height:780,show:process.env.NAUMI_TEST_HIDDEN!=='1',title:'Naumi · 登录',icon:path.join(__dirname,'assets/naumi.ico'),backgroundColor:'#fff',webPreferences:{session:enterprise.session,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const origin=settings.enterpriseOrigin,allowed=url=>allowedEnterpriseNavigation(origin,url);
 login.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 for(const event of ['will-navigate','will-redirect'])login.webContents.on(event,(e,url)=>{if(!allowed(url))e.preventDefault();});
 void login.loadURL(origin+'/login').catch(()=>{});
 login.on('closed',()=>{login=null;if(!closing&&!editingConnection&&window&&!window.isDestroyed()&&new URL(window.webContents.getURL()).origin===settings.url)window.webContents.reload();});
}

async function creationControl(action){
 const response=await primarySession.fetch(settings.url+'/naumi/creation',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','x-naumi-creation':'1'},body:JSON.stringify({action}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('CREATION_HOST_NOT_READY');const value=await response.json();if(!value.ok)throw Error('CREATION_HOST_NOT_READY');return value;
}
