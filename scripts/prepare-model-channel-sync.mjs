import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {prepareChannelSync} from './lib/model-channel-sync.mjs';
const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
assert(arg('evidence-dir')&&arg('plan'),'EXPLICIT_PRIVATE_INPUT_PATHS_REQUIRED');
const dir=path.resolve(arg('evidence-dir')),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n))),plan=JSON.parse(fs.readFileSync(arg('plan')));
const keyFile=arg('secret-file');assert(keyFile,'SECRET_FILE_REQUIRED');
const first=read('REAL_MODEL_TESTS.json'),followup=read('FOLLOWUP_TESTS.json'),token=read('vision-expectation.json').token;
assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir,'vision-test.png'))).digest('hex'),first.syntheticImageSha256,'TEST_IMAGE_DRIFT');
const baseline=fs.readFileSync(plan.baselineCatalog);fs.writeFileSync(path.join(dir,'BASELINE_FILE.json'),baseline);
const v=prepareChannelSync({...plan,key:fs.readFileSync(keyFile,'utf8').trim(),first,followup,token,oldCatalog:JSON.parse(baseline)});
// The plaintext request is deliberately not persisted; a future approved import regenerates it in memory.
for(const [name,value] of [['MODIFIED_FILE.json',v.catalog],['IMPORT_ALLOWLIST.json',v.allowlist],['ACCEPTANCE.json',{status:'LOCAL_ACCEPTANCE_COMPLETE_REMOTE_PENDING',actualModelRequests:first.models.length+followup.models.length,automaticRetries:0,visionPassed:v.outcomes.filter(x=>x.input.includes('image')).length,textOnly:v.outcomes.filter(x=>x.state==='TEXT_ONLY_PASS').length,outcomes:v.outcomes,remoteWrites:0,blockedBy:'This preparation command does not execute deployment; remote activation requires separate verified receipts.'}]])fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
console.log('CHANNEL_SYNC_PREPARED models='+v.catalog.models.length+' vision='+v.outcomes.filter(r=>r.input.includes('image')).length+' textOnly='+v.outcomes.filter(r=>r.state==='TEXT_ONLY_PASS').length+' sqlInserts='+Object.values(v.allowlist.tableInserts).reduce((a,b)=>a+b,0)+' remoteWrites=0 secretsPersisted=0');
