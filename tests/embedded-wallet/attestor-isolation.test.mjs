import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {plan,root,loopbackPatch} from '../../tools/local-attestor-review/prepare.mjs';
import {fixture,actors,resign} from '../hackerrank-evidence/fixture.mjs';
globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
test('isolated source preparation fails closed on changed archive or listener',()=>{
 assert.equal(plan.productFallback,false);assert.equal(plan.officialTrustChanged,false);
 assert.throws(()=>loopbackPatch('http.listen(port)'),/LOCAL_LISTENER_SOURCE/);
 const dir=mkdtempSync(join(tmpdir(),'clear-attestor-source-'));
 try{
  const archive=join(dir,'invalid.tgz');writeFileSync(archive,'not the reviewed upstream archive');
  assert.throws(()=>execFileSync(process.execPath,['tools/local-attestor-review/prepare.mjs','--archive',archive],{cwd:root,stdio:'pipe'}),e=>e.stderr.toString().includes('LOCAL_ARCHIVE_HASH'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('valid self-attestor signature never enrolls itself into the product trust list',async()=>{
 const f=await fixture();
 f.input.proofs.account=await resign(f.input.proofs.account,()=>{},actors.other);
 const result=await f.verifier.verify(f.input,f.request);
 assert.equal(result.code,'UNTRUSTED_SIGNER');assert.equal(result.gates.paymentAllowed,false);
 assert.deepEqual(f.config.signers,[actors.attestor.address.toLowerCase()]);
});
