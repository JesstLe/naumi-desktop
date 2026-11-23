import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
// Execute the actual backend environment helper extracted from the shipped app.asar.
export function packagedDingTalkEnvironment(code,settings,source){const start=code.indexOf('function backendEnvironment('),end=code.indexOf('\nasync function ensureBackend(',start);assert(start>=0&&end>start,'DINGTALK_PACKAGED_ENVIRONMENT_REQUIRED');return new Function('path','return ('+code.slice(start,end)+');')(path)(settings,source);}
export function verifyDingTalkDistributionCase({backend,appBackendSource,settings}){
 const system=process.env.SystemRoot??'C:/Windows',env=packagedDingTalkEnvironment(appBackendSource,settings,{SystemRoot:system,WINDIR:system,TEMP:process.env.TEMP,TMP:process.env.TMP,PATHEXT:'.COM;.EXE;.BAT;.CMD',PATH:path.join(system,'System32')+path.delimiter+system});
 assert.equal(env.NAUMI_DINGTALK_MANIFEST,path.join(backend,'node_modules/dingtalk-workspace-cli/package.json'));
 const resources=path.join(backend,'node_modules/dingtalk-workspace-cli/vendor'),before=fs.readdirSync(resources).sort(),exe=fs.readFileSync(path.join(resources,'dws.exe')),sha=createHash('sha256').update(exe).digest('hex');
 const run=args=>{const r=spawnSync(path.join(system,'System32/cmd.exe'),['/d','/s','/c','"dws '+args+'"'],{env,cwd:settings.home,windowsVerbatimArguments:true,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:2e6});assert.equal(r.status,0,'DINGTALK_REAL_CLI_FAILED '+(r.error?.code??r.stderr));return r.stdout;};
 const version=run('--version');assert(version.includes('1.0.68'));const status=JSON.parse(run('auth status --readonly --format json'));assert.equal(status.success,true);assert.equal(status.authenticated,false);
 const schema=JSON.parse(run('schema --cli-path "contact user get-self" --compact -f json'));assert(schema&&typeof schema==='object');
 assert.deepEqual(fs.readdirSync(resources).sort(),before);assert.equal(createHash('sha256').update(fs.readFileSync(path.join(resources,'dws.exe'))).digest('hex'),sha);
 return {dingtalkCli:true,dingtalkVersion:'1.0.68',dingtalkAuthenticated:false,dingtalkResourcesUnchanged:true};
}
