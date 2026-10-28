import test from 'node:test';
import assert from 'node:assert/strict';
import {actors,NOW} from './fixture.mjs';
import {managedWorkerTrust,loadManagedHackerRankTrust,WORKER_REVIEW_REF} from '../../src/hackerrank-evidence/worker-trust.mjs';
import {createHackerRankVerifier} from '../../src/hackerrank-evidence/verifier.mjs';
const input=()=>({signers:[actors.attestor.address.toLowerCase()],audience:'synthetic-assembly-check',privacyKeyId:'synthetic-key.1',now:NOW});
test('reviewed worker profile fixes responsibility, recipe, epoch and short lifetime',()=>{
 const source=input(),config=managedWorkerTrust(source);source.signers.length=0;
 assert.equal(config.approvalRef,WORKER_REVIEW_REF);assert.equal(config.recipe.version,'hackerrank-two-proof.3');
 assert.equal(config.sourceReview,'TRUSTED_WORKER_TRANSCRIPT_REVIEWED');assert.equal(config.contextReview,'SIGNED_REQUEST_CONTEXT_REQUIRED');
 assert.deepEqual(config.epochs,[1]);assert.equal(config.notBefore,NOW-30);assert.equal(config.expiresAt,NOW+1800);
 assert.equal(config.signers.length,1);assert.ok(Object.isFrozen(config.recipe.account));
 assert.doesNotThrow(()=>createHackerRankVerifier({trustConfig:config,commitmentKey:Buffer.alloc(32,7)}));
 assert.throws(()=>createHackerRankVerifier({trustConfig:config,commitmentKey:Buffer.alloc(32,7),clock:()=>NOW}),/REAL_CLOCK_REQUIRED/);
});
test('missing, duplicate, zero, excessive signers and invalid host pins cannot form trust',()=>{
 for(const patch of [{signers:[]},{signers:['0x'+'0'.repeat(40)]},{signers:[...input().signers,...input().signers]},{signers:Array(17).fill(input().signers[0])},{audience:''},{privacyKeyId:'../other'},{now:NaN}])assert.throws(()=>managedWorkerTrust({...input(),...patch}));
});
test('live registry preparation requires locked host and respects cancellation before network',async()=>{
 const previous=process.env.CLEAR_LOCKED;
 try{delete process.env.CLEAR_LOCKED;await assert.rejects(loadManagedHackerRankTrust(input()),/LOCKED_LAUNCHER_REQUIRED/);
  process.env.CLEAR_LOCKED='1';await assert.rejects(loadManagedHackerRankTrust({...input(),signal:AbortSignal.abort()}),/COLLECTOR_CANCELLED/);
  await assert.rejects(loadManagedHackerRankTrust({...input(),audience:''}),/WORKER_TRUST_INPUT/);
 }finally{if(previous===undefined)delete process.env.CLEAR_LOCKED;else process.env.CLEAR_LOCKED=previous;}
});
