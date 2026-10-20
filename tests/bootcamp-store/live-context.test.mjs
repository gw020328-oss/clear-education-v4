import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {openLiveContext} from '../../tools/bootcamp/live-context.mjs';
test('unconfigured prepared mapping stops before TEST keys, chain start, source or AI access',async t=>{
 const root=fileURLToPath(new URL('../../private/bootcamp-normal-live/',import.meta.url));mkdirSync(root,{recursive:true,mode:0o700});
 const directory=mkdtempSync(join(root,'normal-live-test-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const mapping={hackerRank:{trustStatus:'UNCONFIGURED_BLOCKED'}},runtimeMappingHash=p0Hash('NORMAL-REGISTERED-MAPPING',mapping);
 writeFileSync(join(directory,'preparation.json'),JSON.stringify({version:'clear-bootcamp-normal-live-input.1',directory,runtimeMappingHash}),{mode:0o600});
 writeFileSync(join(directory,'mapping.json'),JSON.stringify({mapping,runtimeMappingHash}),{mode:0o600});
 let source=0,collect=0,ai=0;
 await assert.rejects(openLiveContext({preparationPath:join(directory,'preparation.json'),withReader(){source++;},hackerRank:{pins:()=>({dataMode:'RECLAIM_SIGNED_RECORD'}),collectLease(){collect++;}},reviewReflection(){ai++;}}),/BC_LIVE_HR_TRUST_REQUIRED/);
 assert.deepEqual({source,collect,ai},{source:0,collect:0,ai:0});assert.deepEqual(readdirSync(directory).sort(),['mapping.json','preparation.json']);
});
