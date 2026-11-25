import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {CatalogRegistry} from '../services/account-models/registry.mjs';
const file=process.argv[2],count=Number(process.argv[3]);assert(file&&Number.isSafeInteger(count),'EXACT_INPUT_REQUIRED');const raw=fs.readFileSync(file),catalog=JSON.parse(raw);new CatalogRegistry({},catalog);assert.equal(catalog.models.length,count);assert.equal(new Set(catalog.models.map(r=>r.name)).size,count);
console.log('CATALOG_VERIFIED models='+count+' sha256='+createHash('sha256').update(raw).digest('hex')+' productionWrites=0');
