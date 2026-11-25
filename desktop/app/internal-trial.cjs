'use strict';
// Edition policy is an immutable installation resource, not a persisted user preference.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=b=>createHash('sha256').update(b).digest('hex');
function trialResources(root){
 const manifestFile=path.join(root,'runtime-manifest.json');
 if(!fs.existsSync(manifestFile))return null;
 const manifest=JSON.parse(fs.readFileSync(manifestFile));
 if(!manifest.edition)return null;
 if(['embedded-test','bundled-models'].includes(manifest.edition)){if(!(manifest.embeddedModels||manifest.bundledModels)||manifest.personalCredentials!==true)throw Error('EMBEDDED_MANIFEST_INVALID');return null;}
 if(manifest.edition!=='internal-trial'||manifest.trial?.version!==1)throw Error('TRIAL_EDITION_INVALID');
 const read=(name,expected)=>{const file=path.join(root,'defaults',name);if(fs.lstatSync(file).isSymbolicLink())throw Error('TRIAL_RESOURCE_LINK');const bytes=fs.readFileSync(file);if(hash(bytes)!==expected)throw Error('TRIAL_RESOURCE_CHANGED');return {file,bytes};};
 const overlay=read('internal-trial.patch.json',manifest.trial.overlaySHA256);
 const access=read('internal-trial-access.json',manifest.trial.accessSHA256);
 const initial=read('internal-trial-initial.json',manifest.trial.initialSHA256);
 const credentials=JSON.parse(access.bytes);
 if(Object.entries(credentials).some(([key,value])=>!/^NAUMI_TRIAL_ACTIVE_[A-F0-9]{24}$/.test(key)||typeof value!=='string'||!value||/[\r\n\x00]/.test(value)))throw Error('TRIAL_ACCESS_INVALID');
 return {overlay,credentials,initial,manifest};
}
function trialLaunch(settings){
 // Never turn an arbitrary external backend into a test distribution.
 if(!settings.isolated&&!settings.linkedService)return {args:[],env:{}};
 const r=trialResources(settings.releaseRoot??settings.root);
 return r?{args:['--patch',r.overlay.file],env:r.credentials}:{args:[],env:{}};
}
function seedTrialCredentials(settings){
 const r=trialResources(settings.runtime.root);if(!r)return {seeded:false};
 const receipt=path.join(settings.home,'desktop-trial-bootstrap.json');
 if(fs.existsSync(receipt))return {seeded:false};
 const config=path.join(settings.home,'profiles/web/cordis.patch.yml');
 // Only the exact fresh-install template is ours. Existing homes/config/credentials win.
 if(hash(fs.readFileSync(config))!==r.manifest.trial.profileSHA256)return {seeded:false};
 const file=path.join(settings.home,'.credentials.yaml'),bytes=r.initial.bytes;
 if(fs.existsSync(file)){
  if(fs.lstatSync(file).isSymbolicLink()||hash(fs.readFileSync(file))!==hash(bytes))return {seeded:false};
 }else fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
 require('./profile.cjs').atomic(receipt,{version:1,kind:'initial-model-connections',credentialsSHA256:hash(bytes)});
 return {seeded:true};
}
module.exports={trialResources,trialLaunch,seedTrialCredentials};
