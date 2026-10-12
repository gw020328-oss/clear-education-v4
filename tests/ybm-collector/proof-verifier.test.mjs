import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,Wallet} from './proof-fixture.mjs';
import {verifyProofPair} from '../../src/ybm-collector/proof-verifier.mjs';
import {verifyIndependently} from '../../src/ybm-collector/independent-verifier.mjs';
import {canonical} from '../../src/ybm-collector/values.mjs';

test('official signature verification and child process accept a bound synthetic pair without secrets',async t=>{
 const f=await fixture();t.after(()=>f.diagnostic.close());
 const result=await verifyIndependently(f.input);assert.equal(result.proofVerified,true);assert.equal(result.independentProcess,true);assert.equal(result.paymentAllowed,false);
 const serialized=JSON.stringify(f.input);for(const word of ['privateKey','cookieStr','secretParams','postData','transcript'])assert.ok(!serialized.includes(word));
 assert.ok(!JSON.stringify(result).includes('123456'));assert.ok(!JSON.stringify(result).includes('850'));
});
for(const [name,mutate] of [
 ['unsigned field tamper',f=>{f.input.proofs[1].claim.context=f.input.proofs[1].claim.context.replace('850','990');}],
 ['untrusted signer',f=>{f.input.proofs[0].attestor=Wallet.createRandom().address;}],
 ['missing signature',f=>{f.input.proofs[0].signature='0x';}],
 ['identifier mismatch',f=>{f.input.proofs[0].claim.identifier='0x'+'00'.repeat(32);}],
 ['missing source',f=>{f.input.proofs.pop();}],
 ['duplicate source',f=>{f.input.proofs[1]=structuredClone(f.input.proofs[0]);}],
 ['unsigned extra field',f=>{f.input.proofs[0].extractedParameters={};}],
 ['missing claim',f=>{delete f.input.proofs[0].claim;}],
 ['oversized input',f=>{f.input.proofs[0].signature='x'.repeat(131072);}],
 ['changed runtime trust',f=>{f.input.trustedConfig.runtime.attestorTrust=[Wallet.createRandom().address];}],
 ['changed expected application',f=>{f.input.expectedRecord.binding.applicationId='0x'+'00'.repeat(32);}],
])test('verifier rejects '+name,async t=>{const f=await fixture();t.after(()=>f.diagnostic.close());mutate(f);await assert.rejects(verifyProofPair(f.input));});
for(const [name,change] of [
 ['wrong owner',p=>{p.claim.owner=Wallet.createRandom().address;}],
 ['old timestamp',p=>{p.claim.timestampS-=3600;}],
 ['future timestamp',p=>{p.claim.timestampS+=120;}],
 ['changed public headers',p=>{const v=JSON.parse(p.claim.parameters);v.headers.Authorization='SYNTHETIC';p.claim.parameters=canonical(v);}],
 ['disabled TLS validation',p=>{const v=JSON.parse(p.claim.parameters);v.additionalClientOptions={verifyServerCertificate:false};p.claim.parameters=canonical(v);}],
 ['wrong source role',p=>{const c=JSON.parse(p.claim.context);c.clearSourceRole='score';p.claim.context=canonical(c);}],
 ['different request nonce',p=>{const c=JSON.parse(p.claim.context);c.clearSourceRequestId='0x'+'00'.repeat(32);p.claim.context=canonical(c);}],
 ['different binding',p=>{const c=JSON.parse(p.claim.context);c.clearBindingHash='0x'+'00'.repeat(32);p.claim.context=canonical(c);}],
 ['extra identity field',p=>{const c=JSON.parse(p.claim.context);c.extractedParameters.name='SYNTHETIC';p.claim.context=canonical(c);}],
 ['different exam',p=>{const c=JSON.parse(p.claim.context);c.extractedParameters.registration_number='654321';p.claim.context=canonical(c);}],
 ['wrong provider hash',p=>{const c=JSON.parse(p.claim.context);c.providerHash='0x'+'00'.repeat(32);p.claim.context=canonical(c);}],
])test('valid attestor signature cannot bypass '+name,async t=>{const f=await fixture();t.after(()=>f.diagnostic.close());change(f.input.proofs[0]);await f.sign(f.input.proofs[0]);await assert.rejects(verifyProofPair(f.input));});
test('a new session cannot accept the previous session proofs',async t=>{
 const a=await fixture(),b=await fixture();t.after(()=>{a.diagnostic.close();b.diagnostic.close();});
 b.input.proofs=a.input.proofs;await assert.rejects(verifyProofPair(b.input));
});
test('expired verification and aborted child cannot return success',async t=>{
 const f=await fixture();t.after(()=>f.diagnostic.close());
 await assert.rejects(verifyProofPair(f.input,f.input.expectedRecord.binding.expiresAt));
 await assert.rejects(verifyIndependently(f.input,{signal:AbortSignal.abort()}));
 f.input.proofs[0].signature='0x'+'00'.repeat(65);await assert.rejects(verifyIndependently(f.input),/PROOF_VERIFICATION_FAILED/);
});
test('duplicate signed JSON keys are rejected even when the SDK canonicalizes context',async t=>{
 const f=await fixture();t.after(()=>f.diagnostic.close());const p=f.input.proofs[0];
 p.claim.context=p.claim.context.replace('"clearSchemaVersion":4','"clearSchemaVersion":3,"clearSchemaVersion":4');await f.sign(p);await assert.rejects(verifyProofPair(f.input),/SIGNED_JSON/);
});
