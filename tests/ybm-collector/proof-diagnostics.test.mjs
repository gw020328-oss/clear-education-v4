import test from 'node:test';
import assert from 'node:assert/strict';
import {proofErrorDiagnostic} from '../../src/ybm-collector/proof-diagnostics.mjs';
test('SDK diagnostics retain only fixed labels and pinned package line, never error text or stack paths',()=>{
 const e=new TypeError('SYNTHETIC_SECRET_COOKIE');e.stack='TypeError: SYNTHETIC_SECRET_COOKIE\n at method (/SYNTHETIC_PRIVATE_PATH/node_modules/@reclaimprotocol/attestor-core/lib/index.js:123:4)';
 assert.deepEqual(proofErrorDiagnostic(e),{reason:'PROOF_GENERATION_FAILED',kind:'TypeError',pinnedCoreLine:123});
 for(const [message,reason] of [['ATTESTOR_BACKPRESSURE_LIMIT','ATTESTOR_BACKPRESSURE_LIMIT'],['Failed to find XPath SYNTHETIC_SECRET','RESPONSE_SELECTION'],['certificate SYNTHETIC_SECRET','TLS_VALIDATION'],['request body mismatch SYNTHETIC_SECRET','REQUEST_BODY_MISMATCH']])assert.equal(proofErrorDiagnostic(new Error(message)).reason,reason);
});
test('independent verifier failure codes are allowlisted and cannot serialize arbitrary response data',async()=>{
 const {verificationFailureCode}=await import('../../src/ybm-collector/proof-diagnostics.mjs');
 assert.equal(verificationFailureCode(new Error('SOURCE_POLICY')),'SOURCE_POLICY');
 assert.equal(verificationFailureCode(new Error('SYNTHETIC_PRIVATE')),'VERIFIER_REJECTED');
 assert.equal(proofErrorDiagnostic({name:'Error',message:'PROOF_VERIFICATION_FAILED',verificationCode:'SYNTHETIC_PRIVATE'}).verificationCode,'VERIFIER_REJECTED');
});
