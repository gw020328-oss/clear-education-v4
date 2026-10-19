import test from 'node:test';
import assert from 'node:assert/strict';
import {childDiagnostic} from './child-diagnostics.mjs';
test('child diagnostic rejects arbitrary error, phase, cut and extra secret fields',()=>{
 const secret='PRIVATE_SENTINEL_DO_NOT_EMIT';
 const d=childDiagnostic({code:secret,nativeCode:secret,phase:secret,cut:secret,metrics:{keyAccesses:secret,raw:secret},buildMs:secret,elapsedMs:secret,leaseRemainingSeconds:secret,error:secret,request:secret});
 assert(!JSON.stringify(d).includes(secret));assert.equal(d.code,'E5_CHILD_UNCLASSIFIED');assert.equal(d.phase,'INIT');assert.equal(d.leaseRemainingSeconds,null);
 for(const code of ['E5_CHECKPOINT_CAS_RETRY_REQUIRED','E5_ROLE_NONCE_BUSY','E5_CAPABILITY_EXPIRED','E5_LEASE_EXPIRED','E5_TEST_GATE_TIMEOUT'])assert.equal(childDiagnostic({code}).code,code);
 for(const nativeCode of ['ERR_SQLITE_ERROR','SQLITE_BUSY','SQLITE_LOCKED','ETIMEDOUT'])assert.equal(childDiagnostic({nativeCode}).nativeCode,nativeCode);
});
