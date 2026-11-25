import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source=path.resolve(process.argv[2]??'E:/Workspace/naumi-central-identity-20261118');
const require=createRequire(path.join(source,'package.json')),esbuild=require('esbuild');
const out=path.resolve('runtime/desktop-model-import47');fs.mkdirSync(out,{recursive:true});
const contractOnly=process.argv[3]==='contracts';
const result=await esbuild.build({...contractOnly?{stdin:{contents:"export * from 'naumi-admin-contracts';",resolveDir:process.cwd(),sourcefile:'import-contracts.mjs'}}:{entryPoints:['scripts/desktop-model-import47-cli.mjs']},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',treeShaking:true,tsconfig:path.join(source,'tsconfig.json'),plugins:[{
 name:'operator-public-contracts',setup(b){
  b.onResolve({filter:/^@\/lib\/model-config\/storage-schema$/},args=>args.importer.replaceAll('\\','/').endsWith('/src/lib/model-config/credentials.ts')?{path:'credential-readiness',namespace:'no-ddl-ready'}:undefined);
  b.onLoad({filter:/.*/,namespace:'no-ddl-ready'},()=>({contents:`import {ensureImportSchema} from ${JSON.stringify(path.resolve('scripts/lib/desktop-model-import-ready.mjs').replaceAll('\\','/'))};import {ensureModelSchema as original} from ${JSON.stringify(source+'/src/lib/model-config/storage-schema.ts')};export const ensureModelSchema=pool=>process.argv.includes('--existing-schema')?ensureImportSchema(pool):original(pool);`,resolveDir:source,loader:'js'}));
  b.onResolve({filter:/^(?:https-proxy-agent|agent-base|debug|ms|supports-color|has-flag|lucide-react|react(?:\/.*)?)$/},args=>({path:require.resolve(args.path),external:false}));
  b.onResolve({filter:/^naumi-admin-contracts$/},()=>({path:'contracts',namespace:'operator-contracts'}));
  b.onLoad({filter:/.*/,namespace:'operator-contracts'},()=>({contents:`export {ensureImportSchema} from ${JSON.stringify(path.resolve('scripts/lib/desktop-model-import-ready.mjs').replaceAll('\\','/'))};export {createCredentialStore} from ${JSON.stringify(source+'/src/lib/model-config/credentials.ts')};export {createCredentialReader} from ${JSON.stringify(source+'/src/lib/model-config/credential-reader.ts')};export {ensureModelSchema} from ${JSON.stringify(source+'/src/lib/model-config/storage-schema.ts')};export {supplierMetadataSchema,unknownSupplierMetadata} from ${JSON.stringify(source+'/src/lib/supplier-models/types.ts')};export {listSupplierModelsFrom} from ${JSON.stringify(source+'/src/lib/supplier-models/repository.ts')};`,resolveDir:source,loader:'ts'}));
  b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'operator-cli'}));
  b.onLoad({filter:/.*/,namespace:'operator-cli'},()=>({contents:'',loader:'js'}));
 }
}]});
const bytes=result.outputFiles[0].contents;fs.writeFileSync(path.join(out,contractOnly?'contracts.cjs':'operator.cjs'),bytes);
const files=['src/lib/model-config/credentials.ts','src/lib/model-config/credential-reader.ts','src/lib/model-config/storage-schema.ts','src/lib/settings.ts','src/lib/settings-secret.ts','src/lib/supplier-models/types.ts','src/lib/supplier-models/repository.ts'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin={sourceMain:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),bundleSHA256:sha(bytes),files:files.map(file=>({file,sha256:sha(fs.readFileSync(path.join(source,file)))}))};
assert(!bytes.toString().includes('E:/Workspace/naumi-desktop/.dsh'));
fs.writeFileSync(path.join(out,contractOnly?'CONTRACT_TEST_PIN.json':'CONTRACT_PIN.json'),JSON.stringify(pin,null,2)+'\n');console.log('DESKTOP_MODEL_IMPORT_BUNDLE '+JSON.stringify({sourceMain:pin.sourceMain,bundleSHA256:pin.bundleSHA256,bytes:bytes.length,credentialsIncluded:false}));
