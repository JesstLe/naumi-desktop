import {stageEmbeddedModels} from './stage-embedded-models.mjs';
import {stageCuaDriver} from './stage-cua.mjs';
import {installNativeModelPicker,MODEL_PICKER_POLICY} from '../../scripts/native-model-picker-extension.mjs';
import {stageTrialModels} from './internal-trial-models.mjs';
import {installSidebarVisibility} from '../../scripts/native-sidebar-visibility-extension.mjs';
import fs from 'node:fs';
import {installNativeDeliveryExtensions} from '../../scripts/native-delivery-extension.mjs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {stageDingTalk} from './stage-dingtalk.mjs';
import {auditPackage} from '../../scripts/audit-enterprise-package.mjs';
import {installReasoningDefaults} from '../../scripts/native-reasoning-extension.mjs';
import {installAgentTriggers} from '../../scripts/native-agent-mentions-extension.mjs';
import {installNativeComposer} from '../../scripts/native-composer-extension.mjs';
import {installNativeSettings} from '../../scripts/native-settings-extension.mjs';
const project=fileURLToPath(new URL('../..',import.meta.url));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// Match normal production packaging: declarations and external source maps are development
// artifacts. Keep all executable JS/native files, schemas, skills, licenses and font .map data.
export function isRuntimeDevelopmentArtifact(file){return /\.d\.(?:ts|mts|cts)$|\.(?:js|mjs|cjs|css|ts|mts|cts)\.map$/i.test(file);}
export function verifyStagedImports(staged){
  const script=`import{registerHooks}from'node:module';import{pathToFileURL}from'node:url';import path from'node:path';const base=pathToFileURL(process.cwd()+path.sep).href;registerHooks({resolve(specifier,context,next){const result=next(specifier,context);if(result.url.startsWith('file:')&&!result.url.startsWith(base))throw Error('STAGED_IMPORT_OUTSIDE_BUNDLE');return result;}});await import('./node_modules/@naumi/dsh-enterprise/host.js');console.log('STAGED_HOST_IMPORT_OK no_ancestor_dependencies=1');`;
  const result=execFileSync(path.join(staged,'node.exe'),['--input-type=module','-e',script],{cwd:staged,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,PATH:path.dirname(process.execPath)}});
  if(!result.includes('STAGED_HOST_IMPORT_OK no_ancestor_dependencies=1'))throw Error('RUNTIME_IMPORT_PROBE_FAILED');return result.trim();
}
export function runtimeInventory(target){
  const files=[];
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('RUNTIME_SYMLINK_REMAINING');if(entry.isDirectory())walk(file);else files.push({path:path.relative(target,file).replaceAll('\\','/'),size:fs.statSync(file).size,sha256:sha(file)});}};
  walk(target);return files;
}
export function scanRuntimeInventory(files){
  const forbidden=/(?:^|\/)(?:\.env(?:\..*)?|\.credentials[^/]*|cookies(?:\.sqlite)?|login data|local state|web data|employee[^/]*\.sqlite(?:-wal|-shm)?|sessions|logs|\.git|\.dsh|browser-profiles|enterprise-workspaces|naumi-desktop-bridge\.json|backend-link\.json|naumi-identity\.json|identity-owner\.json|identity-profiles|desktop-(?:instance|profile|profile-journal|backend|enterprise|workspaces|maintenance)\.json|creation-private|business-private|[^/]*\.vault|runtime-[^/]*\.token|device-private-key[^/]*|.*\.(?:pem|pfx|key))$/i;
  // SDK source directories named sessions are code, not a copied employee session store.
  for(const file of files)if(forbidden.test(file.path)||/^(?:sessions|logs|browser-profiles)\//i.test(file.path)||/(?:^|\/)(?:\.git|\.dsh|browser-profiles|identity-profiles|business-private|creation-private)\//i.test(file.path))throw Error('RUNTIME_PRIVATE_FILE '+file.path);
  return {files:files.length,forbiddenPaths:0};
}
export async function prepareRuntime({root=project,target=path.join(root,'runtime/desktop-backend'),archive=process.env.NAUMI_DINGTALK_ARCHIVE,trialInput,modelPolicy=process.env.NAUMI_BUILD_MODEL_POLICY,embeddedInput=process.env.NAUMI_EMBEDDED_MODELS_FILE}={}){
  if(embeddedInput&&(trialInput||process.env.NAUMI_EMBEDDED_TEST_ACK!=='two-users-accepted-20261120'||modelPolicy!=='three-options-vision-20261120'))throw Error('EMBEDDED_TEST_BUILD_ACK_REQUIRED');
  if(modelPolicy!==undefined&&modelPolicy!=='three-options-vision-20261120')throw Error('MODEL_POLICY_RESOURCE_INVALID');
  root=path.resolve(root);target=path.resolve(target);
  const runtime=path.join(root,'runtime');
  if(!target.startsWith(runtime+path.sep)||fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('RUNTIME_TARGET_INVALID');
  if(fs.existsSync(target)&&!fs.existsSync(path.join(target,'runtime-manifest.json')))throw Error('RUNTIME_TARGET_NOT_OWNED');
  if(process.versions.node!=='24.19.0'||process.platform!=='win32'||process.arch!=='x64')throw Error('RUNTIME_BUILD_PLATFORM_VERSION');
  auditPackage(path.join(root,'plugins/naumi-enterprise'),{checkInstalled:true});
  fs.mkdirSync(runtime,{recursive:true});const staged=path.join(runtime,'desktop-stage-'+randomUUID());fs.mkdirSync(staged);
  try{
    // Only runtime dependencies and source plugins are input. No user home/profile/config is copied.
    fs.cpSync(path.join(root,'node_modules'),path.join(staged,'node_modules'),{recursive:true,dereference:true,filter:source=>!source.split(path.sep).some(x=>['.cache','.bin','dingtalk-workspace-cli','agent-desktop'].includes(x))&&!isRuntimeDevelopmentArtifact(source)});
    installReasoningDefaults(path.join(staged,'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'));
    installNativeDeliveryExtensions(path.join(staged,'node_modules'));
    installNativeComposer(path.join(staged,'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'));
    installAgentTriggers(path.join(staged,'node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js'));
    installNativeSettings(path.join(staged,'node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'));
    installNativeModelPicker(path.join(staged,'node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js'));
    installSidebarVisibility(path.join(staged,'node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js'));
    fs.cpSync(path.join(root,'plugins'),path.join(staged,'plugins'),{recursive:true});
    for(const [source,name]of [['naumi-enterprise','dsh-enterprise'],['naumi-ui-layout','dsh-ui-layout'],['naumi-sidebar-browser','dsh-sidebar-browser']])fs.cpSync(path.join(root,'plugins',source),path.join(staged,'node_modules/@naumi',name),{recursive:true});
    await stageCuaDriver(path.join(staged,'node_modules/@naumi/dsh-enterprise'));
    await stageCuaDriver(path.join(staged,'plugins/naumi-enterprise'));
    fs.copyFileSync(process.execPath,path.join(staged,'node.exe'));
    const defaults=path.join(staged,'defaults');fs.mkdirSync(defaults);
    fs.writeFileSync(path.join(defaults,'profile.json'),JSON.stringify({name:'naumi-profile-web',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@deepseek-ai/dsh-experimental-agent-team-profile','@naumi/dsh-enterprise']}}},null,2));
    fs.writeFileSync(path.join(defaults,'profile.yml'),'- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: 2026-09-28.1\n');
    fs.writeFileSync(path.join(defaults,'home.yml'),'- id: ui-theme\n  config:\n    preference: light\n- id: session-log-deepseek\n  config:\n    enabled: false\n');
    fs.cpSync(path.join(root,'desktop/upstream'),path.join(staged,'licenses/harness-browser'),{recursive:true});
    const dingtalk=await stageDingTalk(staged,{archive});
    const closure=auditPackage(path.join(staged,'node_modules/@naumi/dsh-enterprise'),{checkInstalled:true,dependencyRoot:path.join(staged,'node_modules')});
    verifyStagedImports(staged);
    const trial=trialInput?stageTrialModels(staged,trialInput):null;
    const embeddedModels=embeddedInput?stageEmbeddedModels(staged,embeddedInput):null;
    const inventory=runtimeInventory(staged),scan=scanRuntimeInventory(inventory);
    fs.writeFileSync(path.join(staged,'runtime-files.json'),JSON.stringify(inventory,null,2)+'\n');
    const manifest={product:'Naumi',...trial?{edition:'internal-trial',trial}:{},...embeddedModels?{edition:'embedded-test',embeddedModels}:{},schemaVersion:2,desktop:{profileVersion:1,identityProtocol:2,maintenanceProtocol:1,workspaceProtocol:1},version:JSON.parse(fs.readFileSync(path.join(root,'desktop/package.json'))).version,node:process.versions.node,harness:'0.2.2-rc.1',desktopEngine:'cua',cuaDriver:'0.54.0',dingtalk,personalCredentials:!!trial||!!embeddedModels,browserProfiles:false,bootstrap:'offline',nodeSHA256:sha(path.join(staged,'node.exe')),inventorySHA256:sha(path.join(staged,'runtime-files.json')),closure,scan};
    if(modelPolicy)manifest.modelPolicy=modelPolicy;
    manifest.modelPicker=MODEL_PICKER_POLICY;
    fs.writeFileSync(path.join(staged,'runtime-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    // Publish only after import/closure/content checks. Preserve the preceding bundle for rollback.
    let previous=null;if(fs.existsSync(target)){previous=target+'.previous-'+randomUUID();fs.renameSync(target,previous);}
    try{fs.renameSync(staged,target);}catch(e){if(previous)fs.renameSync(previous,target);throw e;}
    return {target,previous,...manifest};
  }catch(e){
    if(path.resolve(staged).startsWith(runtime+path.sep))fs.rmSync(staged,{recursive:true,force:true});
    throw e;
  }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const result=await prepareRuntime();console.log('DESKTOP_RUNTIME_READY '+JSON.stringify({node:result.node,harness:result.harness,dingtalk:result.dingtalk.version,files:result.scan.files,closure:result.closure.status,forbiddenPaths:result.scan.forbiddenPaths,previous:result.previous}));
}
