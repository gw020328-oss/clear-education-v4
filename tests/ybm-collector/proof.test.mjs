import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,core} from './proof-fixture.mjs';
import {generateAndVerify} from '../../src/ybm-collector/proof.mjs';
import {quiet} from '../../src/ybm-collector/client.mjs';
import {canonical} from '../../src/ybm-collector/values.mjs';
async function harness(t){
 const f=await fixture();t.after(()=>f.diagnostic.close());let calls=0,closed=false;
 const client={isOpen:true,isInitialised:true,metadata:{}},seen=[];
 const secrets={take:role=>({cookieStr:'SYNTHETIC_COOKIE_'+role}),close(){closed=true;}};
 const createClaim=async options=>{
  calls++;assert.equal(options.client,client);assert.ok(options.ownerPrivateKey);assert.equal(options.zkEngine,'stwo');assert.equal(options.maxRetries,1);assert.equal(options.params.headers['Accept-Encoding'],'identity');seen.push(options.context.clearSourceRole);
  core.providers.http.createRequest({...options.secretParams,paramValues:{encExamData:'SYNTHETIC'}},options.params,quiet);
  const p=structuredClone(f.input.proofs[calls-1]);p.claim.parameters=canonical(options.params);p.claim.context=canonical({...options.context,extractedParameters:JSON.parse(p.claim.context).extractedParameters,providerHash:core.hashProviderParams(options.params)});await f.sign(p);
  return {claim:p.claim,signatures:{claimSignature:Buffer.from(p.signature.slice(2),'hex'),attestorAddress:p.attestor},request:{secret:'SYNTHETIC_NEVER_IPC'}};
 };
 return {f,client,seen,createClaim,options:{client,routeClient:client,diagnostic:f.diagnostic,secrets,scoreIndex:0,createClaim},state:()=>({calls,closed})};
}
test('same client generation verifies two fresh signed synthetic claims independently and consumes session',async t=>{
 const h=await harness(t),result=await generateAndVerify(h.options);assert.equal(result.proofVerified,true);assert.equal(result.paymentAllowed,false);assert.deepEqual(h.seen,['registration','score']);assert.deepEqual(h.state(),{calls:2,closed:true});assert.throws(()=>h.f.diagnostic.collection.assertActive());
 await assert.rejects(generateAndVerify(h.options));assert.equal(h.state().calls,2);
});
test('replacement client is rejected before generation',async t=>{const h=await harness(t);await assert.rejects(generateAndVerify({...h.options,routeClient:{...h.client}}),/PROOF_GENERATION_OR_VERIFICATION_FAILED/);assert.equal(h.state().calls,0);});
test('disconnect between sources cancels session with no second generation',async t=>{
 const h=await harness(t);await assert.rejects(generateAndVerify({...h.options,createClaim:async options=>{const r=await h.createClaim(options);h.client.isOpen=false;return r;}}));assert.deepEqual(h.state(),{calls:1,closed:true});assert.throws(()=>h.f.diagnostic.collection.assertActive());
});
test('cancellation while generation awaits cannot produce accepted success',async t=>{
 const h=await harness(t),c=new AbortController();await assert.rejects(generateAndVerify({...h.options,signal:c.signal,createClaim:async opts=>{const r=await h.createClaim(opts);c.abort();return r;}}));assert.deepEqual(h.state(),{calls:1,closed:true});
});
test('SDK errors and unsigned responses never leak arbitrary details or complete',async t=>{
 const h=await harness(t);await assert.rejects(generateAndVerify({...h.options,createClaim:async()=>{throw new Error('SYNTHETIC_COOKIE_PRIVATE');}}),error=>error.message==='PROOF_GENERATION_OR_VERIFICATION_FAILED');assert.equal(h.state().closed,true);
});
test('failure of second source cannot yield partial acceptance',async t=>{
 const h=await harness(t);await assert.rejects(generateAndVerify({...h.options,createClaim:async opts=>opts.context.clearSourceRole==='score'?{error:{message:'SYNTHETIC_PRIVATE'}}:h.createClaim(opts)}));assert.equal(h.state().closed,true);
});
