import test from 'node:test';
import assert from 'node:assert/strict';
import {CLAIM_RETURN_REASON_HINTS,claimReturnDiagnostics} from '../../src/hackerrank-evidence/claim-return-diagnostics.mjs';

const secret='SYNTHETIC_REMOTE_PRIVATE_VALUE';
const returned=message=>({error:{code:5,message}});
const hint=message=>claimReturnDiagnostics(returned(message)).reasonHint;
const unknown=Object.freeze({reasonHint:'UNKNOWN',errorPresent:false,claimPresent:false,claimSignaturePresent:false,resultSignaturePresent:false});
const cases=[
 ['REQUEST_SIGNATURE','No signature provided on claim request'],
 ['REQUEST_SIGNATURE','Invalid signature on claim request'],
 ['TIMESTAMP_WINDOW','Timestamp provided 1800000000 is too far off. Current time is 1700000000'],
 ['TLS_HANDSHAKE','incomplete TLS record encountered'],
 ['TLS_HANDSHAKE','Could not find cipherSuite to use & got enc record'],
 ['TLS_HANDSHAKE','No provider certificates received'],
 ['TLS_HANDSHAKE','server finished message not found'],
 ['TLS_HANDSHAKE','TLS1.3 cert verify packet not received'],
 ['TLS_HANDSHAKE','change cipher spec message not found'],
 ['TLS_HANDSHAKE','client hello has no SNI'],
 ['TLS_HANDSHAKE','Receipt over but server finish: -1, client finish: 12'],
 ['TLS_HANDSHAKE','no direct reveal for handshake packet: 12'],
 ['TLS_HANDSHAKE','Missing follow up to incomplete packet at idx: 12'],
 ['ZK_PROOF','error in handling packet at idx 7: Error: invalid proof (ZK proof 2, startIdx 80, record 3)'],
 ['TRANSCRIPT_PACKET','error in handling packet at idx 7: Error: '+secret],
 ['TRANSCRIPT_PACKET','error in handling packet at idx 7: Error: redacted ciphertext not congruent (ZK proof 2, startIdx 80, record 3)'],
 ['HTTP_PROVIDER_RECEIPT','Response body start not found'],
 ['HTTP_PROVIDER_RECEIPT','request body mismatch'],
 ['HTTP_PROVIDER_RECEIPT','Method/Host mismatch, or first 2 headers were not Host and Connection'],
 ['HTTP_PROVIDER_RECEIPT','Expected protocol: https, found: http:'],
 ['HTTP_PROVIDER_RECEIPT','Invalid method: post'],
 ['HTTP_PROVIDER_RECEIPT','Expected path: /expected, found: /'+secret],
 ['HTTP_PROVIDER_RECEIPT','Expected host: expected.test, found: actual.test'],
 ['HTTP_PROVIDER_RECEIPT','Connection header must be "close", got "keep-alive"'],
 ['HTTP_PROVIDER_RECEIPT','Provider returned error 403'],
 ['HTTP_PROVIDER_RECEIPT','Response did not start with "HTTP/1.1 2XX" got "'+secret+'"'],
 ['HTTP_PROVIDER_RECEIPT','Invalid receipt. Regex "'+secret+'" didn\'t match'],
 ['HTTP_PROVIDER_RECEIPT','Invalid receipt. Response contains "'+secret+'"'],
 ['HTTP_PROVIDER_RECEIPT','Duplicate parameter username'],
 ['HTTP_PROVIDER_RECEIPT','Invalid response match type unknown'],
 ['HTTP_PROVIDER_RECEIPT','Too many redactions in URL path: 4'],
 ['HTTP_PROVIDER_RECEIPT','Unsupported response charset "synthetic-charset"'],
];
test('audited literals and complete templates produce fixed peer hints without retaining text',()=>{
 assert.equal(Object.isFrozen(CLAIM_RETURN_REASON_HINTS),true);
 for(const [expected,message]of cases){
  const result=returned(message);result.error.data=secret;result.error.stack=secret;
  const diagnostics=claimReturnDiagnostics(result);
  assert.equal(diagnostics.reasonHint,expected);assert.equal(diagnostics.errorPresent,true);
  assert.equal(Object.isFrozen(diagnostics),true);assert.equal(JSON.stringify(diagnostics).includes(secret),false);
  assert.equal(result.error.message,message);assert.equal(result.error.data,secret);
  assert.deepEqual(Object.keys(diagnostics),Object.keys(unknown));
 }
});
test('unknown, partial, oversized, multiline and different-code errors remain unknown',()=>{
 for(const message of [secret,'invalid proof','No info provided on claim request','Unsupported provider: synthetic',
  'prefix Invalid signature on claim request','Invalid signature on claim request suffix',
  'error in handling packet at idx 7:','error in handling packet at idx x: Error: invalid proof',
  'Invalid signature on claim request\n','Invalid signature on claim request\u2028',
  'Invalid receipt. Regex "'+ 'x'.repeat(2048)+'" didn\'t match',
  'Invalid receipt. Regex "x\n'+secret+'" didn\'t match',null,5,new String('Invalid signature on claim request')])assert.equal(hint(message),'UNKNOWN');
 for(const code of [0,4,6,12,'5','ERROR_INVALID_CLAIM',null,undefined])assert.equal(claimReturnDiagnostics({error:{code,message:'Invalid signature on claim request'}}).reasonHint,'UNKNOWN');
 assert.equal(claimReturnDiagnostics({error:Object.create({code:5,message:'Invalid signature on claim request'})}).reasonHint,'UNKNOWN');
});
test('presence fields inspect only own shape and nonempty byte lengths, never signature bytes',()=>{
 const claim=Object.freeze({value:secret}),signature=new Uint8Array(65);
 const result=Object.freeze({claim,signatures:Object.freeze({claimSignature:signature,resultSignature:new Uint8Array(1)})});
 assert.deepEqual(claimReturnDiagnostics(result),{...unknown,claimPresent:true,claimSignaturePresent:true,resultSignaturePresent:true});
 assert.deepEqual(claimReturnDiagnostics({error:{code:5,message:secret},signatures:{claimSignature:new Uint8Array(),resultSignature:new Uint8Array(65)}}),{...unknown,errorPresent:true,resultSignaturePresent:true});
 for(const signature of [secret,{},[],new Uint16Array(65),null])assert.equal(claimReturnDiagnostics({signatures:{claimSignature:signature}}).claimSignaturePresent,false);
 assert.deepEqual(claimReturnDiagnostics(Object.create(result)),unknown);
});
test('accessors, coercion and every proxy level are rejected without invoking user code',()=>{
 let calls=0;const trap=()=>{calls++;throw Error(secret);};
 const getters=keys=>Object.defineProperties({},Object.fromEntries(keys.map(k=>[k,{get:trap}])));
 const proxy=new Proxy({},{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap,ownKeys:trap});
 const revoked=Proxy.revocable({},{});revoked.revoke();
 const inputs=[undefined,null,[],5,secret,proxy,revoked.proxy,getters(['error','claim','signatures']),
  {error:proxy},{error:revoked.proxy},{error:getters(['code','message','data','stack'])},
  {error:{code:5,get message(){return trap();}}},{error:{get code(){return trap();},message:'Invalid signature on claim request'}},
  {error:{code:5,message:{toString:trap,valueOf:trap,[Symbol.toPrimitive]:trap}}},
  {signatures:proxy},{signatures:revoked.proxy},{signatures:getters(['claimSignature','resultSignature'])},
  {signatures:{claimSignature:proxy,resultSignature:revoked.proxy}},
  {error:{code:5,message:'Invalid signature on claim request',get data(){return trap();},get stack(){return trap();},get cause(){return trap();}}},
 ];
 for(const input of inputs){const result=claimReturnDiagnostics(input);assert.ok(CLAIM_RETURN_REASON_HINTS.includes(result.reasonHint));assert.equal(JSON.stringify(result).includes(secret),false);}
 assert.equal(calls,0);
});
test('nested error text cannot upgrade a packet hint to a ZK verifier result',()=>{
 for(const message of ['error in handling packet at idx 7: '+secret+' invalid proof',
  'error in handling packet at idx 7: Error: invalid proof (ZK proof 2, startIdx 80, record 3) suffix',
  'error in handling packet at idx 7: Error: invalid proof (TOPRF proof 2, from 80, record 3)'])assert.equal(hint(message),'TRANSCRIPT_PACKET');
});
test('pinned SDK protobuf error response preserves result and carries only a fixed hint',async()=>{
 const {proto}=await import('../../src/hackerrank-evidence/node_modules/@reclaimprotocol/attestor-core/lib/index.js');
 assert.equal(proto.ErrorCode.ERROR_INVALID_CLAIM,5);
 const wire=proto.ClaimTunnelResponse.encode(proto.ClaimTunnelResponse.create({
  error:{code:proto.ErrorCode.ERROR_INVALID_CLAIM,message:'Invalid signature on claim request',data:secret},
  // Invented bytes check presence only; no claim/result signature is verified.
  signatures:{claimSignature:new Uint8Array(),resultSignature:new Uint8Array([1]),attestorAddress:secret},
 })).finish();
 const result=proto.ClaimTunnelResponse.decode(wire);
 assert.deepEqual(claimReturnDiagnostics(result),{...unknown,reasonHint:'REQUEST_SIGNATURE',errorPresent:true,resultSignaturePresent:true});
 assert.deepEqual(proto.ClaimTunnelResponse.encode(result).finish(),wire);
 assert.equal(JSON.stringify(claimReturnDiagnostics(result)).includes(secret),false);
});
