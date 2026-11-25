import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';import{createRequire}from'node:module';
const {validate}=createRequire(import.meta.url)('../app/embedded-models.cjs');
export function stageEmbeddedModels(staged,input,{bundled=false}={}){
 const v=validate(JSON.parse(fs.readFileSync(input)));if(bundled&&v.mode!=='bundled-release')throw Error('BUNDLED_RELEASE_INPUT_REQUIRED');const bytes=Buffer.from(JSON.stringify(v)+'\n');
 fs.writeFileSync(path.join(staged,'defaults/'+(v.mode==='bundled-release'?'bundled-models.json':'embedded-models.json')),bytes,{mode:0o600});
 return {version:1,revision:v.revision,sha256:createHash('sha256').update(bytes).digest('hex'),models:Object.values(v.providers).reduce((n,p)=>n+p.models.length,0),distribution:v.mode==='bundled-release'?'release-bundled':'two-user-test',credentialBearing:true};
}
