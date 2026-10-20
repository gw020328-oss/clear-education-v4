import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveReclaimConsumer,translateLiveReclaimRequest} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {createHackerRankCollector} from '../../src/hackerrank-evidence/collector.mjs';
import {fixture as hrFixture,NOW} from '../hackerrank-evidence/fixture.mjs';
import {BRIDGE_VERSION} from '../../src/bootcamp/reclaim-consumer.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
const H=v=>p0Hash('LIVE-HR-TEST',v);
const pins={audience:'live-test-only',trustConfigHash:H('trust'),recipeHash:H('recipe'),expectedClaimOwner:'0x'+'11'.repeat(20),selectedCertificateId:null,dataMode:'RECLAIM_SIGNED_RECORD'};
const request={version:'clear-bootcamp-bound-request.2',producerVersion:BRIDGE_VERSION,dataMode:'RECLAIM_SIGNED_RECORD',producerTrustHash:pins.trustConfigHash,
 participantId:'participant-test',participantWallet:'0x'+'22'.repeat(20),applicationId:'application-test',criterionId:'python-basic-certificate',policyHash:H('policy'),runtimeMappingHash:H('mapping'),requestHash:H('request'),nonceHash:H('nonce'),issuedAt:NOW-10,expiresAt:NOW+100};
const state={available:true,authExpiresAt:NOW+100,rawExpiresAt:NOW+100,queryExpiresAt:NOW+100};
test('unconfigured live trust cannot call collector or resolve a source',async()=>{
 let calls=0;const p=createLiveReclaimConsumer({collectLease(){calls++;},resolveLease:()=>state,now:()=>NOW});assert.equal(p.status(),'UNCONFIGURED_BLOCKED');assert.equal(p.resolveSource(request),null);await assert.rejects(p.verify(request,{isAuthorized:()=>true}),/BC_LIVE_HR_AUTHORITY/);assert.equal(calls,0);
});
test('live .2 translation preserves exact issued nonce and binding, and refuses synthetic data mode',()=>{
 const r=translateLiveReclaimRequest(request,pins);assert.equal(r.nonce,request.nonceHash);assert.equal(r.participantWallet,request.participantWallet);assert.equal(r.runtimeMappingHash,request.runtimeMappingHash);
 assert.throws(()=>translateLiveReclaimRequest({...request,dataMode:'SYNTHETIC_FIXTURE'},pins),/BC_LIVE_HR_REQUEST/);
 assert.throws(()=>translateLiveReclaimRequest(request,{...pins,dataMode:'SYNTHETIC_FIXTURE'}),/BC_LIVE_HR_TRUST/);
});
test('lookalike collector lease is refused through the private helper without executing copied read/recheck',async()=>{
 let reads=0,disposed=0;const lease={read(){reads++;},recheck(){reads++;},dispose(){disposed++;}};
 const p=createLiveReclaimConsumer({pins:()=>pins,collectLease:async()=>lease,resolveLease:()=>state,now:()=>NOW});
 await assert.rejects(p.verify(request,{signal:new AbortController().signal,isAuthorized:()=>true}),/UNTRUSTED_COLLECTOR_LEASE/);assert.equal(reads,0);assert.equal(disposed,1);
});
test('genuine private collector lease with synthetic source cannot be promoted to live (offline signed fixtures)',async()=>{
 const base=await hrFixture(),collector=createHackerRankCollector({trustConfig:base.config,commitmentKey:base.key,clock:()=>NOW}),f=await hrFixture({requestPatch:{expectedClaimOwner:collector.claimOwner}});
 const client={isOpen:true,isInitialised:true,metadata:{}};let lease;
 await collector.collect({expectedRequest:f.request,envelope:f.input.envelope,client,routeClient:client,readCookies:async()=> 'session=INVENTED',createClaim:async input=>{const p=f.input.proofs[input.context.clearSourceRole];return {claim:p.claim,signatures:{claimSignature:Buffer.from(p.signature.slice(2),'hex'),attestorAddress:p.attestor}};},submit:async r=>{lease=r.lease;}});
 const p=createLiveReclaimConsumer({pins:()=>pins,collectLease:async()=>lease,resolveLease:()=>state,now:()=>NOW});await assert.rejects(p.verify(request,{signal:new AbortController().signal,isAuthorized:()=>true}),/BC_LIVE_HR_SOURCE_REJECTED/);assert.equal(lease.isCurrent(),false);
});
