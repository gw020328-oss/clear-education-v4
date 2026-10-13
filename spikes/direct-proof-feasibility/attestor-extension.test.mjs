// Offline boundary tests. The receipt below is FABRICATED, not TLS evidence.
// The optional attestor-extension-check runner verifies the real TLS hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {scoreHtml} from '../../tests/ybm-collector/source-fixture.mjs';
import {quiet} from '../../src/ybm-collector/client.mjs';
import {PROVIDER,extensionConfiguration,makeExtension,preflightExtension,projectPublicProof,verifyPublicProof} from './attestor-extension.mjs';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
const sdk=await import(require.resolve('@reclaimprotocol/attestor-core'));
const {Wallet}=require('ethers');
const witness=Wallet.createRandom(),owner=Wallet.createRandom().address.toLowerCase();
const binding={application:'1'.repeat(64),recipient:owner,chainId:431798,consumer:Wallet.createRandom().address.toLowerCase()};
const config=extensionConfiguration({sourceUrl:'https://example.invalid/score',businessScope:'a'.repeat(64),keyFingerprint:'b'.repeat(64),evaluateOprf:async()=>({keyFingerprint:'b'.repeat(64),output:Buffer.alloc(32,7)})});
const now=1800000000;
const expected={config,witness:witness.address,owner,binding,now};
function input(rows=[{}]){
 const body=Buffer.from(scoreHtml(rows));
 const req=sdk.providers.http.createRequest({cookieStr:'SYNTHETIC_COOKIE'},structuredClone(config.params),quiet),request=Buffer.from(req.data);
 for(const r of req.redactions)request.fill('*',r.fromIndex,r.toIndex);
 return {request:{data:{provider:PROVIDER},request:{host:'example.invalid',port:443},transcript:[]},metadata:{clientVersion:sdk.proto.AttestorVersion.ATTESTOR_VERSION_3_2_0},receipt:{hostname:'example.invalid',transcript:[{sender:'server',redacted:false}]},applData:[{sender:'client',message:request},{sender:'server',message:Buffer.concat([Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\n\r\n`),body])}],data:{provider:PROVIDER,parameters:config.parameters,context:sdk.canonicalStringify(binding),owner,timestampS:now}};
}
async function signed(claim){
 claim={...claim,epoch:1,identifier:sdk.getIdentifierFromClaimInfo({...claim})};
 return projectPublicProof({claim,request:{private:'DO_NOT_PROJECT'},signatures:{attestorAddress:witness.address,claimSignature:Buffer.from((await witness.signMessage(sdk.createSignDataForClaim({...claim}))).slice(2),'hex')}});
}
test('candidate computes allowlisted facts, real ephemeral signature verifies, raw fields excluded',async()=>{
 const proof=await signed(await makeExtension(config)(input()));
 assert.equal((await verifyPublicProof(proof,expected)).nullifier,'07'.repeat(32));
 for(const raw of ['SYNTHETIC','2026.09.20','123456','Total 850','DO_NOT_PROJECT'])assert(!JSON.stringify(proof).includes(raw));
});
test('TLS origin, port and unredacted request path pinned before OPRF evaluation',async()=>{
 let calls=0;const complete=makeExtension({...config,evaluateOprf:async()=>{calls++;throw Error('UNREACHABLE');}});
 for(const mutate of [i=>i.receipt.hostname='attacker.invalid',i=>i.request.request.host='attacker.invalid',i=>i.request.request.port=444,i=>i.applData[0].message=Buffer.from('GET /***** HTTP/1.1\r\nHost: example.invalid\r\nConnection: close\r\n')]){
  const i=input();mutate(i);await assert.rejects(complete(i),/SOURCE_BOUND_EXTENSION_REJECTED/);
 }
 assert.equal(calls,0);
});
test('all server transformations, missing reveal and obsolete client versions rejected',async()=>{
 for(const mutate of [i=>i.request.transcript=[{sender:0,reveal:{zkReveal:{}}}],i=>i.request.transcript=[{sender:2,reveal:{zkReveal:{}}}],i=>i.receipt.transcript[0].redacted=true,i=>i.receipt.oprfRawReplacements=[{}],i=>i.metadata.clientVersion=sdk.proto.AttestorVersion.ATTESTOR_VERSION_3_1_0]){
  const i=input();mutate(i);await assert.rejects(makeExtension(config)(i));
 }
 assert.throws(()=>preflightExtension({data:{provider:PROVIDER},transcript:[{sender:2,reveal:{zkReveal:{}}}]}));
});
test('cross-row qualification, arbitrary context and source parameters cannot be signed',async()=>{
 await assert.rejects(makeExtension(config)(input([{score:'795'},{date:'2026.08.20',score:'850'}])));
 for(const mutate of [i=>i.data.context=JSON.stringify({...binding,qualified:true}),i=>i.data.parameters=JSON.stringify({...config.params,url:'https://attacker.invalid/score'}),i=>i.applData[1].message=i.applData[1].message.subarray(0,-10)]){
  const i=input();mutate(i);await assert.rejects(makeExtension(config)(i));
 }
});
test('native result must match deployment key and full canonical output',async()=>{
 for(const result of [{keyFingerprint:'c'.repeat(64),output:Buffer.alloc(32,7)},{keyFingerprint:config.keyFingerprint,output:Buffer.alloc(6,7)},{keyFingerprint:config.keyFingerprint,output:Buffer.alloc(32)}])await assert.rejects(makeExtension({...config,evaluateOprf:async()=>result})(input()));
 assert.throws(()=>{config.params.responseMatches.push({type:'contains',value:'bypass'});});
});
test('trusted public binding, witness, time, policy and scope required despite valid signature',async()=>{
 const proof=await signed(await makeExtension(config)(input()));
 for(const patch of [{owner:witness.address.toLowerCase()},{witness:owner},{binding:{...binding,application:'2'.repeat(64)}},{binding:{...binding,chainId:1}},{binding:{...binding,consumer:owner}},{config:{...config,businessScope:'c'.repeat(64)}},{config:{...config,keyFingerprint:'c'.repeat(64)}},{config:{...config,extensionPolicy:'c'.repeat(64)}},{now:now+301},{now:now-31},{maxAge:-1}])await assert.rejects(verifyPublicProof(proof,{...expected,...patch}));
});
test('stock provider, private extras and noncanonical contexts rejected even when signed',async()=>{
 const claim=await makeExtension(config)(input());
 for(const c of [{...claim,provider:'http'},{...claim,context:JSON.stringify(JSON.parse(claim.context),null,2)},{...claim,context:sdk.canonicalStringify({...JSON.parse(claim.context),private:'SYNTHETIC'})}])await assert.rejects(verifyPublicProof(await signed(c),expected));
 const proof=await signed(claim);await assert.rejects(verifyPublicProof({...proof,request:{}},expected));
 assert.throws(()=>projectPublicProof({claim,error:{},signatures:{claimSignature:Buffer.alloc(65)}}));
});
test('modified nullifier and recomputed identifier cannot reuse an earlier signature',async()=>{
 const proof=await signed(await makeExtension(config)(input())),ctx=JSON.parse(proof.claim.context);
 ctx.sourceBound.nullifier='e'.repeat(64);proof.claim.context=sdk.canonicalStringify(ctx);proof.claim.identifier=sdk.getIdentifierFromClaimInfo(proof.claim);
 await assert.rejects(verifyPublicProof(proof,expected));
});
