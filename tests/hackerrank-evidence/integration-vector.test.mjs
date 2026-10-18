import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {integrationVector} from './integration-vector.mjs';
import {validateRequest} from '../../src/hackerrank-evidence/request.mjs';
import {createHackerRankVerifier} from '../../src/hackerrank-evidence/verifier.mjs';
test('published integration vector pins the exact P0/request/recipe/trust hashes without acceptance authority',async()=>{
 const v=integrationVector(),published=JSON.parse(readFileSync(new URL('../../docs/hackerrank/integration-vector.json',import.meta.url)));
 assert.deepEqual(v,published);assert.doesNotThrow(()=>validateRequest(v.request,v.trustConfig,1900000000));
 assert.notEqual(v.request.participantWallet,v.request.expectedClaimOwner);
 for(const ctx of Object.values(v.clientContexts))assert.equal(ctx.clearRequestHash,v.requestHash);
 const pending=JSON.parse(readFileSync(new URL('../../src/hackerrank-evidence/pending-trust.json',import.meta.url)));
 assert.equal((await createHackerRankVerifier({trustConfig:pending}).verify(v)).status,'BLOCKED');
 assert.equal(v.usableForClaim,false);assert.equal(v.ready,false);
});
