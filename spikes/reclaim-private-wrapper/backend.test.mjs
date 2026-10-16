import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBytes,checkVerificationInputs,canonicalKey,minimalEnv,sandboxProfile,pins} from './v2/backend/native.mjs';
test('native setup rejects corruption and length drift before launching tools',()=>{
 const b=Buffer.from('public');
 assert.throws(()=>checkBytes(b,'0'.repeat(64)),/PIN_MISMATCH/);
 assert.throws(()=>checkBytes(b,'0'.repeat(64),1),/PIN_MISMATCH/);
 assert.equal(pins.crs[0][2],(2**21+1)*64);
});
test('legacy native CLI receives no inherited home, credentials or networking proxy',()=>{
 assert.deepEqual(minimalEnv(),{PATH:'/usr/bin:/bin',HARDWARE_CONCURRENCY:'2'});
});
test('sandbox interpolation refuses special paths and denies network/outside writes',()=>{
 for(const p of ['relative','/tmp/"escape','/tmp/\\escape','/tmp/\nescape','/tmp/\0escape','/tmp/$(escape)','/tmp/`escape`','/tmp//run','/tmp/run/../run'])assert.throws(()=>sandboxProfile(p),/SANDBOX_PATH/);
 const p=sandboxProfile('/tmp/한글 space');assert.match(p,/deny network\*/);assert.match(p,/deny file-write\*/);
});
test('malformed lengths and unpinned verification keys never reach legacy verifier',()=>{
 for(const length of [0,2143,2145])assert.throws(()=>checkVerificationInputs(Buffer.alloc(length),Buffer.alloc(1779)),/PROOF_LENGTH/);
 assert.throws(()=>checkVerificationInputs(Buffer.alloc(2144),Buffer.alloc(1779)),/PIN_MISMATCH/);
});
test('key canonicalization only removes inactive accumulator indices; flags and remaining key stay checked',()=>{
 const raw=Buffer.alloc(1779);raw[100]=73;raw.fill(219,1714,1778);
 const canonical=canonicalKey(raw);assert.equal(canonical[100],73);assert(canonical.subarray(1714,1778).every(x=>x===0));assert.equal(raw[1714],219);
 for(const offset of [1713,1778]){const active=Buffer.from(raw);active[offset]=1;assert.throws(()=>canonicalKey(active),/VK_LAYOUT_OR_RECURSION/);}
 assert.throws(()=>canonicalKey(raw.subarray(0,-1)),/VK_LAYOUT_OR_RECURSION/);
 assert.throws(()=>checkVerificationInputs(Buffer.alloc(2144),raw),/PIN_MISMATCH/);
});
