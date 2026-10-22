import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preparationArtifact} from './artifact.mjs';
test('published preparation ABI/source artifact matches compiled code and excludes payout functions',()=>{
 const saved=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/preparation-artifact.json',import.meta.url)));
 assert.deepEqual(saved,preparationArtifact());assert.equal(saved.runtimeTemplateIsDeployedCodePin,false);assert.equal(saved.payoutEnabled,false);
 assert(saved.abi.some(x=>x.type==='event'&&x.name==='TargetReplaced'));
 for(const forbidden of ['accept','claim','activate','withdraw','upgradeTo'])assert(!saved.abi.some(x=>x.name===forbidden));
});
