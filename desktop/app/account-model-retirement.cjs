'use strict';
// Forward-only retirement: never create another backup containing distributed keys.
// Non-owned personal references and all business/session data remain untouched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto'),{createRequire}=require('node:module');
const {atomic:metadata}=require('./profile.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const owned=r=>/^NAUMI_EMBEDDED_TEST_[A-F0-9]{24}$/.test(r);
function plain(file){for(let p=file;;p=path.dirname(p)){assert(!fs.existsSync(p)||!fs.lstatSync(p).isSymbolicLink(),'ACCOUNT_MODEL_RETIREMENT_LINK');if(p===path.dirname(p))break;}return file;}
function write(file,bytes){plain(file);const temp=file+'.'+randomUUID()+'.tmp';try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function retireEmbedded(settings,{fault=()=>{}}={}){
 if(!settings.accountModels)throw Error('ACCOUNT_MODEL_RETIREMENT_REQUIRES_AUTHORITY');
 const home=path.resolve(settings.home),journal=plain(path.join(home,'account-models-retirement.json'));
 require('./embedded-models.cjs').recover(home);
 const yaml=createRequire(path.join(settings.releaseRoot??settings.root,'package.json'))('yaml');
 let j=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal)):null;
 if(j){assert(j.version===1&&j.home===home&&Array.isArray(j.files),'ACCOUNT_MODEL_RETIREMENT_INVALID');}
 if(!j||j.phase==='ready'){
  const files=[];
  const sanitize=(relative,kind)=>{
   const file=plain(path.join(home,relative));if(!fs.existsSync(file))return;
   const before=fs.readFileSync(file);assert(before.length<=8*1024*1024,'ACCOUNT_MODEL_RETIREMENT_TOO_LARGE');
   const doc=yaml.parseDocument(before.toString());assert(!doc.errors.length,'ACCOUNT_MODEL_RETIREMENT_YAML');let changed=false;
   if(kind==='credentials'){for(const ref of Object.keys(doc.toJS()?.refs??{}))if(owned(ref)){doc.deleteIn(['refs',ref]);changed=true;}}
   else {const rows=doc.toJS();assert(Array.isArray(rows),'ACCOUNT_MODEL_RETIREMENT_YAML');for(let i=0;i<rows.length;i++)if(rows[i].id==='llm-pi-ai')for(const[id,p]of Object.entries(rows[i].config?.providers??{}))if(owned(p.apiKeyEnv)){doc.deleteIn([i,'config','providers',id]);changed=true;}}
   if(changed){const content=doc.toString();files.push({relative,before:sha(before),after:sha(content),content});}
  };
  sanitize('.credentials.yaml','credentials');sanitize('profiles/web/cordis.patch.yml','config');
  const backups=plain(path.join(home,'embedded-model-backups'));
  if(fs.existsSync(backups))for(const entry of fs.readdirSync(backups,{withFileTypes:true})){
   assert(entry.isDirectory()&&!entry.isSymbolicLink()&&/^[a-f0-9-]{36}$/.test(entry.name),'ACCOUNT_MODEL_RETIREMENT_BACKUP_INVALID');
   sanitize('embedded-model-backups/'+entry.name+'/.credentials.yaml','credentials');
   sanitize('embedded-model-backups/'+entry.name+'/profiles/web/cordis.patch.yml','config');
  }
  if(!files.length&&j?.phase==='ready')return {changed:false,retired:true};
  j={version:1,home,phase:'applying',files};metadata(journal,j);fault('prepared');
 }
 // A durable sanitized candidate permits crash recovery without retaining old keys.
 for(const r of j.files){assert(/^(?:\.credentials\.yaml|profiles\/web\/cordis\.patch\.yml|embedded-model-backups\/[a-f0-9-]{36}\/(?:\.credentials\.yaml|profiles\/web\/cordis\.patch\.yml))$/.test(r.relative)&&sha(r.content)===r.after,'ACCOUNT_MODEL_RETIREMENT_INVALID');const file=plain(path.join(home,r.relative)),actual=sha(fs.readFileSync(file));assert(actual===r.before||actual===r.after,'ACCOUNT_MODEL_RETIREMENT_DRIFT');}
 for(const r of j.files){const file=path.join(home,r.relative);if(sha(fs.readFileSync(file))!==r.after)write(file,r.content);fault(r.relative);}
 const receipt=path.join(home,'desktop-embedded-models.json');if(fs.existsSync(receipt))metadata(receipt,{version:1,phase:'ready',revision:'retired-to-account-models',ownedRefs:[],providerIds:[],retired:true});
 metadata(journal,{...j,phase:'ready',files:j.files.map(({content,...r})=>r)});
 return {changed:true,retired:true,files:j.files.length};
}
module.exports={retireEmbedded};
