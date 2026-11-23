import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export const DINGTALK_VERSION='1.0.68';
export const DINGTALK_SHA256='3bb67f7a59d98ebf7ff75410f742eef498d66148dae2fb49a045e9534f255f4a';
const require=createRequire(import.meta.url);
// Resolve only the verified distributed package, never PATH, npx, or a user's global CLI.
export function resolveDingTalk({manifestPath,platform=process.platform,arch=process.arch,environment=process.env}={}){
  if(platform!=='win32'||arch!=='x64')throw Error('DINGTALK_PLATFORM_NOT_BUNDLED');
  manifestPath??=environment.NAUMI_DINGTALK_MANIFEST;
  if(manifestPath!==undefined&&(typeof manifestPath!=='string'||!path.isAbsolute(manifestPath)))throw Error('DINGTALK_BUNDLE_INVALID');
  try{manifestPath??=require.resolve('dingtalk-workspace-cli/package.json');}catch{throw Error('DINGTALK_BUNDLE_MISSING');}
  const root=path.dirname(manifestPath),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(manifest.name!=='dingtalk-workspace-cli'||manifest.version!==DINGTALK_VERSION||manifest.scripts)throw Error('DINGTALK_BUNDLE_INVALID');
  const command=path.join(root,'vendor/dws.exe');
  if(!fs.existsSync(command)||createHash('sha256').update(fs.readFileSync(command)).digest('hex')!==DINGTALK_SHA256)throw Error('DINGTALK_CHECKSUM_MISMATCH');
  for(const name of ['LICENSE','NOTICE'])if(!fs.statSync(path.join(root,name)).isFile())throw Error('DINGTALK_LICENSE_MISSING');
  return {command,version:DINGTALK_VERSION,sha256:DINGTALK_SHA256};
}

export function dingTalkEnvironment(home,source=process.env){
  if(typeof home!=='string'||!path.isAbsolute(home))throw Error('DINGTALK_PROFILE_REQUIRED');
  // No inherited tokens, app secrets, endpoint overrides, plugins or update configuration.
  const env={};
  for(const [key,value]of Object.entries(source))if(/^(?:systemroot|windir|comspec|pathext|path|temp|tmp|userprofile|localappdata|appdata|programdata|programfiles|programfiles\(x86\)|commonprogramfiles|allusersprofile|homedrive|homepath|systemdrive)$/i.test(key))env[key]=value;
  return {...env,DWS_CONFIG_DIR:path.join(home,'integrations/dingtalk'),DWS_NO_UPDATE_CHECK:'1',DWS_USAGE_TRACKING:'0',DWS_NO_SKILLS:'1'};
}

/** Upstream unpacks native payloads next to its executable. Keep that writable cache out of resources. */
export function materializeDingTalk(runtime,home){
  dingTalkEnvironment(home);
  const directory=path.join(home,'runtime/dingtalk',DINGTALK_VERSION,DINGTALK_SHA256),command=path.join(directory,'dws.exe');
  // Refuse reparse points in this app-owned subtree instead of following them to another profile.
  let current=home;
  for(const part of ['runtime','dingtalk',DINGTALK_VERSION,DINGTALK_SHA256]){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('DINGTALK_RUNTIME_LINK_INVALID');}
  fs.mkdirSync(directory,{recursive:true});
  const valid=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')===DINGTALK_SHA256;
  if(!fs.existsSync(command)){
    if(!valid(runtime.command))throw Error('DINGTALK_CHECKSUM_MISMATCH');
    const temporary=path.join(directory,randomUUID()+'.tmp');
    try{fs.copyFileSync(runtime.command,temporary,fs.constants.COPYFILE_EXCL);fs.renameSync(temporary,command);}
    catch(e){if(!fs.existsSync(command)||!valid(command))throw e;}
    finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  if(fs.lstatSync(command).isSymbolicLink()||!valid(command))throw Error('DINGTALK_RUNTIME_CHECKSUM_MISMATCH');
  return {...runtime,command};
}

export function runDingTalk(runtime,args,{home,signal,timeoutMs=5000,maxBytes=65536}={}){
  return new Promise((resolve,reject)=>{
    signal?.throwIfAborted();const env=dingTalkEnvironment(home);fs.mkdirSync(env.DWS_CONFIG_DIR,{recursive:true});
    const executable=materializeDingTalk(runtime,home);
    const child=spawn(executable.command,args,{env,cwd:env.DWS_CONFIG_DIR,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    let size=0,output='',settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
    const stop=code=>{child.kill();finish(Error(code));},abort=()=>stop('DINGTALK_PROBE_CANCELLED');
    const timer=setTimeout(()=>stop('DINGTALK_PROBE_TIMEOUT'),timeoutMs);timer.unref?.();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    child.stdout.on('data',b=>{size+=b.length;if(size>maxBytes)stop('DINGTALK_OUTPUT_TOO_LARGE');else output+=b.toString('utf8');});
    // Never relay a vendor diagnostic which could contain account information.
    child.stderr.on('data',b=>{size+=b.length;if(size>maxBytes)stop('DINGTALK_OUTPUT_TOO_LARGE');});
    child.on('error',()=>finish(Error('DINGTALK_EXEC_FAILED')));
    child.on('close',code=>finish(null,{code,output}));
  });
}

export async function dingTalkHealth({home,runtime,resolve=resolveDingTalk,run=runDingTalk,signal}={}){
  const base={installed:false,connected:null,authorized:null,healthy:null,version:null,inventoryScope:'naumi_bundle',authorizationScope:'local_dingtalk_account_readonly',networkVerified:false};
  try{runtime??=resolve();}catch(e){return {...base,reasonCode:/^DINGTALK_[A-Z_]+$/.test(e.message)?e.message:'DINGTALK_BUNDLE_INVALID'};}
  const installed={...base,installed:true,version:runtime.version};
  try{
    const result=await run(runtime,['auth','status','--readonly','--format','json'],{home,signal});
    if(result.code!==0)throw Error('DINGTALK_AUTH_STATUS_FAILED');
    const data=JSON.parse(result.output);
    if(data.success!==true||typeof data.authenticated!=='boolean')throw Error('DINGTALK_AUTH_STATUS_INVALID');
    return {...installed,healthy:true,authorized:data.authenticated,reasonCode:data.authenticated?'DINGTALK_ACCOUNT_PRESENT_NETWORK_UNVERIFIED':'DINGTALK_LOGIN_REQUIRED'};
  }catch(e){return {...installed,healthy:false,reasonCode:/^DINGTALK_[A-Z_]+$/.test(e.message)?e.message:'DINGTALK_AUTH_STATUS_INVALID'};}
}
