#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node - "$1" "$HERE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),target=fs.realpathSync(process.argv[2]),here=process.argv[3],m=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(path.join(target,'.naumi-account-models-copy'))||[m.sourceRoot,m.liveRoot].some(p=>path.resolve(p).toLowerCase()===target.toLowerCase()))throw Error('MARKED_COPY_REQUIRED');
for(const e of m.entries){const p=path.resolve(target,e.path);if(!p.startsWith(target+path.sep)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p||hash(fs.readFileSync(p))!==e.modified)throw Error('COPY_CHANGED');if(e.original&&hash(fs.readFileSync(path.join(here,'original',e.path)))!==e.original)throw Error('ORIGINAL_CHANGED');}
let restored=0,removed=0;for(const e of m.entries){const p=path.join(target,e.path);if(e.original){fs.copyFileSync(path.join(here,'original',e.path),p);if(hash(fs.readFileSync(p))!==e.original)throw Error('RESTORE_FAILED');restored++;}else{fs.unlinkSync(p);removed++;}}
console.log('ROLLBACK restored='+restored+' removed='+removed+' hashes=PASS source=MODIFIED live=UNTOUCHED exit=0');
NODE
