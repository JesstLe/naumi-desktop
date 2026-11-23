import {installSessionImport} from './session-import.js';
import {installContextRecovery} from './context-recovery.js';
import {installCreation} from './creation.js';
import {installBusiness} from './business.js';
import {installBlender} from './blender.js';
import {installPluginMarket} from './plugin-market.js';
import {PRODUCT_VERSION} from './product-version.js';
import {installModelConnections} from './model-connections.js';
import {installModelPolicy} from './model-policy.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {businessCookie,projectWorkspace,validateOrigin} from './domain.js';
import {installCua} from './cua.js';
import {installEgoBrowser} from './browser.js';
import {installTeamProfile} from './team-profile.js';
import {installBots} from './bots.js';
import {installDingTalk} from './dingtalk.js';
import {installDesktopIdentity} from './desktop-identity.js';
import {desktopCollaborationOrigin,DesktopEnterpriseTransport} from './desktop-enterprise.js';
export const inject=['webServer','connection'];
/** Supported plugin routes, index branding and an authenticated read-only business adapter. */
export function apply(ctx,config) {
  installDesktopIdentity(ctx);
  installModelPolicy(ctx);
  installSessionImport(ctx);
  installContextRecovery(ctx);
  installModelConnections(ctx);
  installPluginMarket(ctx);
  installCua(ctx);
  installBlender(ctx);
  let creation;
  installCreation(ctx,{onReady:manager=>{creation=manager;}});
  installEgoBrowser(ctx);
  installDingTalk(ctx);
  installTeamProfile(ctx);
  const collaborationOrigin=validateOrigin(desktopCollaborationOrigin(config.collaborationOrigin));
  const enterpriseTransport=new DesktopEnterpriseTransport({origin:collaborationOrigin});
  installBusiness(ctx,{origin:collaborationOrigin,creation:()=>creation});
  installBots(ctx,{collaborationOrigin});
  const designOrigin=validateOrigin(config.designOrigin);
  const assets=new Map([['employee-enterprise-work.js','text/javascript; charset=utf-8'],['employee-memory-maintenance.js','text/javascript; charset=utf-8'],['employee-sync-panel.js','text/javascript; charset=utf-8'],['employee-center.js','text/javascript; charset=utf-8'],['employee-center-model.js','text/javascript; charset=utf-8'],['employee-center.css','text/css; charset=utf-8'],['style.css','text/css; charset=utf-8'],['symbol.svg','image/svg+xml'],['wordmark.svg','image/svg+xml'],['browser-client.js','text/javascript; charset=utf-8'],['browser-native-client.js','text/javascript; charset=utf-8'],['browser-native.css','text/css; charset=utf-8'],['browser-scheduler.js','text/javascript; charset=utf-8'],['browser.css','text/css; charset=utf-8'],['team-panel.css','text/css; charset=utf-8'],['team-panel.js','text/javascript; charset=utf-8'],['team-panel-model.js','text/javascript; charset=utf-8'],['bot-sidebar.js','text/javascript; charset=utf-8'],['bot-sidebar-model.js','text/javascript; charset=utf-8'],['bot-sidebar.css','text/css; charset=utf-8']]);
  assets.set('session-import.js','text/javascript; charset=utf-8');
  for(const name of ['weixin.js','weixin-qrcode.js'])assets.set(name,'text/javascript; charset=utf-8');
  assets.set('weixin.css','text/css; charset=utf-8');
  assets.set('session-import.css','text/css; charset=utf-8');
  assets.set('bot-overview.js','text/javascript; charset=utf-8');
  assets.set('bot-overview.css','text/css; charset=utf-8');
  assets.set('product-copy-keys.js','text/javascript; charset=utf-8');
  assets.set('product-identity.js','text/javascript; charset=utf-8');
  assets.set('delivery-center.css','text/css; charset=utf-8');
  assets.set('desktop-updates.js','text/javascript; charset=utf-8');
  assets.set('desktop-updates.css','text/css; charset=utf-8');
  assets.set('product-identity.css','text/css; charset=utf-8');
  assets.set('creation-settings.js','text/javascript; charset=utf-8');
  assets.set('blender-settings.js','text/javascript; charset=utf-8');
  assets.set('blender-settings.css','text/css; charset=utf-8');
  assets.set('model-connections.js','text/javascript; charset=utf-8');
  assets.set('im-settings.js','text/javascript; charset=utf-8');
  assets.set('im-settings.css','text/css; charset=utf-8');
  assets.set('model-connections.css','text/css; charset=utf-8');
  assets.set('employee-experience.js','text/javascript; charset=utf-8');
  for(const name of ['grok-ball.js','bot-appearance-model.js','bot-avatar-runtime.js','bot-avatar.js'])assets.set(name,'text/javascript; charset=utf-8');
  assets.set('bot-avatar.css','text/css; charset=utf-8');
  assets.set('bot-task-ui.js','text/javascript; charset=utf-8');
  assets.set('bot-task-model.js','text/javascript; charset=utf-8');
  assets.set('bot-task.css','text/css; charset=utf-8');
  assets.set('bot-mentions.js','text/javascript; charset=utf-8');
  assets.set('bot-chat-model.js','text/javascript; charset=utf-8');
  assets.set('bot-chat-markdown.js','text/javascript; charset=utf-8');
  assets.set('bot-groups.js','text/javascript; charset=utf-8');
  assets.set('bot-groups.css','text/css; charset=utf-8');
  assets.set('plugin-market.js','text/javascript; charset=utf-8');
  assets.set('plugin-market.css','text/css; charset=utf-8');
  assets.set('primary-bot.js','text/javascript; charset=utf-8');
  assets.set('primary-bot.css','text/css; charset=utf-8');
  assets.set('employee-experience-model.js','text/javascript; charset=utf-8');
  assets.set('employee-experience.css','text/css; charset=utf-8');
  assets.set('employee-runtime-panel.js','text/javascript; charset=utf-8');
  assets.set('employee-model-panel.js','text/javascript; charset=utf-8');
  assets.set('employee-activity-panel.js','text/javascript; charset=utf-8');
  ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:'/naumi/assets',handler:async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.split('/').at(-1);
    if(!['GET','HEAD'].includes(req.method)||!assets.has(name)){res.writeHead(404).end();return;}
    const content=await readFile(fileURLToPath(new URL('./assets/'+name,import.meta.url)));
    res.writeHead(200,{'Content-Type':assets.get(name),'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
  }}));
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/naumi/workspace',handler:async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
    const respond=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
    const admission=ctx.connection.admit(req);
    if('rejection' in admission){respond(admission.rejection,{error:'HARNESS_AUTH_REQUIRED'});return;}
    if(admission.peer.principal.kind!=='owner'){respond(403,{error:'HARNESS_OWNER_REQUIRED'});return;}
    if(req.method!=='GET'){res.setHeader('Allow','GET');respond(405,{error:'READ_ONLY'});return;}
    const cookie=businessCookie(req.headers.cookie);
    if(!cookie&&!enterpriseTransport.standalone){respond(401,{error:'COLLABORATION_LOGIN_REQUIRED',loginUrl:collaborationOrigin+'/login'});return;}
    const controller=new AbortController();
    const onClose=()=>{if(!res.writableEnded)controller.abort();};res.on('close',onClose);
    try {
      const options={redirect:'manual',headers:{cookie,accept:'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])};
      const upstream=enterpriseTransport.standalone?await enterpriseTransport.fetch('/api/workspace',options):await fetch(collaborationOrigin+'/api/workspace',options);
      if(!upstream.ok){respond([401,403].includes(upstream.status)?upstream.status:502,{error:upstream.status===401?'COLLABORATION_LOGIN_REQUIRED':upstream.status===403?'COLLABORATION_ACCESS_PENDING':'COLLABORATION_UNAVAILABLE',loginUrl:collaborationOrigin+'/login'});return;}
      const data=projectWorkspace(await upstream.json());respond(200,data);
    } catch(error){if(!res.destroyed)respond(502,{error:error?.name==='TimeoutError'?'COLLABORATION_TIMEOUT':'COLLABORATION_UNAVAILABLE'});}
    finally{res.off('close',onClose);}
  }}));
  ctx.on('webserver/index-inject',table=>{
    table.push({kind:'global',name:'__NAUMI__',value:{collaborationOrigin,designOrigin,version:'0.3.0',product:'Naumi',productVersion:PRODUCT_VERSION}});
    table.push({kind:'html',placement:'head',html:'<link rel="stylesheet" href="/naumi/assets/bot-groups.css"><link rel="stylesheet" href="/naumi/assets/primary-bot.css"><link rel="stylesheet" href="/naumi/assets/bot-overview.css"><link rel="stylesheet" href="/naumi/assets/session-import.css"><link rel="stylesheet" href="/naumi/assets/plugin-market.css"><link rel="stylesheet" href="/naumi/assets/desktop-updates.css"><link rel="stylesheet" href="/naumi/assets/delivery-center.css">'});
    table.push({kind:'html',placement:'head',html:'<link rel="stylesheet" href="/naumi/assets/style.css"><link rel="stylesheet" href="/naumi/assets/weixin.css"><link rel="stylesheet" href="/naumi/assets/product-identity.css"><link rel="stylesheet" href="/naumi/assets/model-connections.css"><link rel="stylesheet" href="/naumi/assets/im-settings.css"><link rel="stylesheet" href="/naumi/assets/blender-settings.css"><link rel="stylesheet" href="/naumi/assets/employee-center.css"><link rel="stylesheet" href="/naumi/assets/employee-experience.css"><link rel="stylesheet" href="/naumi/assets/browser.css"><link rel="stylesheet" href="/naumi/assets/browser-native.css"><link rel="stylesheet" href="/naumi/assets/team-panel.css"><link rel="stylesheet" href="/naumi/assets/bot-sidebar.css"><link rel="stylesheet" href="/naumi/assets/bot-task.css"><link rel="stylesheet" href="/naumi/assets/bot-avatar.css"><link rel="icon" type="image/svg+xml" href="/naumi/assets/symbol.svg">'});
  });
  ctx.effect(()=>ctx.webServer.tapIndex(html=>html.replace(/<title>[^<]*<\/title>/i,'<title>Naumi</title>').replace(/<link[^>]+rel="(?:shortcut )?icon"[^>]*href="(?!\/naumi\/)[^"]*"[^>]*>/g,'')));
}
