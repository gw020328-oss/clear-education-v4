import test from 'node:test';
import assert from 'node:assert/strict';
import {createHackerRankCollector,readHackerRankCollectorLease} from '../../src/hackerrank-evidence/collector.mjs';
import {fixture,NOW,USERNAME,actors,mutateContext} from './fixture.mjs';
import {requestHash} from '../../src/hackerrank-evidence/request.mjs';

async function setup(clock=()=>NOW){
 const initial=await fixture(),collector=createHackerRankCollector({trustConfig:initial.config,commitmentKey:initial.key,clock});
 const f=await fixture({requestPatch:{expectedClaimOwner:collector.claimOwner}}),calls=[],submissions=[];
 const client={isOpen:true,isInitialised:true,metadata:{},async terminateConnection(){this.isOpen=false;calls.push('STOP');}};
 const options={envelope:f.input.envelope,expectedRequest:f.request,client,routeClient:client,
  async readCookies({role,url}){calls.push({role,url});return 'session=SYNTHETIC_COOKIE_ONLY';},
  async createClaim(input){
   assert.equal(input.client,client);assert.equal(input.maxRetries,1);assert.equal(input.zkEngine,'stwo');
   assert.equal(input.context.clearRequestHash,requestHash(f.request));assert.equal(Object.keys(input.context).length,4);
   assert.equal(input.context.extractedParameters,undefined);assert.match(input.ownerPrivateKey,/^0x[0-9a-f]{64}$/);
   const proof=f.input.proofs[input.context.clearSourceRole];
   return {claim:proof.claim,signatures:{claimSignature:Buffer.from(proof.signature.slice(2),'hex'),attestorAddress:proof.attestor}};
  },
  async submit(value){value.recheck();submissions.push(value.candidate);},
 };
 return {collector,f,options,calls,submissions};
}
test('pending trust cannot create owner or access any collector port',()=>{
 assert.deepEqual(createHackerRankCollector(),{status:'BLOCKED',code:'TRUST_NOT_CONFIGURED',claimOwner:null});
});
test('fresh bound proof pair derives URL from authenticated account and submits only candidate',async()=>{
 const x=await setup(),result=await x.collector.collect(x.options);
 assert.equal(result.status,'VERIFIED_CANDIDATE');assert.equal(result.dataMode,'SYNTHETIC_FIXTURE');
 assert.equal(result.gates.paymentAllowed,false);assert.equal(x.submissions.length,1);
 assert.equal(x.calls[1].url,'https://www.hackerrank.com/community/v1/test_results/hacker_certificate?username='+USERNAME);
 assert(!JSON.stringify(result).includes(USERNAME));assert(!JSON.stringify(result).includes('SYNTHETIC_COOKIE_ONLY'));
 await assert.rejects(x.collector.collect(x.options),/COLLECTOR_CLOSED/);
});
test('wrong expected request or approval/owner cannot read cookies',async()=>{
 for(const edit of [o=>o.expectedRequest.applicationId='another-application',o=>o.envelope.signature='0x'+'00'.repeat(65),o=>o.routeClient={}]){
  const x=await setup();edit(x.options);await assert.rejects(x.collector.collect(x.options));assert.equal(x.calls.length,0);assert.equal(x.submissions.length,0);
 }
});
test('untrusted account signature never chooses certificate URL or reaches submit',async()=>{
 const x=await setup();x.f.input.proofs.account.attestor=actors.other.address.toLowerCase();
 await assert.rejects(x.collector.collect(x.options),/UNTRUSTED_SIGNER/);assert.equal(x.calls.length,1);assert.equal(x.submissions.length,0);
});
test('even a trusted signature cannot use another request or injected extracted fields to choose a URL',async()=>{
 for(const mutate of [c=>c.clearRequestHash='0x'+'ff'.repeat(32),c=>c.clearSourceRole='certificate',c=>c.extractedParameters={username:'../other',records:'[]'}]){
  const x=await setup();x.f.input.proofs.account=await mutateContext(x.f.input.proofs.account,mutate);
  await assert.rejects(x.collector.collect(x.options));assert.equal(x.calls.length,1);assert.equal(x.submissions.length,0);
 }
});
test('certificate mismatch cannot produce a candidate or expose SDK error text',async()=>{
 const x=await setup();x.f.input.proofs.certificate.signature='0x'+'00'.repeat(65);
 await assert.rejects(x.collector.collect(x.options),/COLLECTOR_PAIR_REJECTED/);assert.equal(x.submissions.length,0);
 const y=await setup();y.options.createClaim=async()=>{throw new Error('SYNTHETIC_PRIVATE_DIAGNOSTIC');};
 await assert.rejects(y.collector.collect(y.options),e=>e.message==='COLLECTION_FAILED');
});
test('close during pending secret read cancels and never invokes claim or submission',async()=>{
 const x=await setup();let release;const pending=new Promise(r=>{release=r;});
 x.options.readCookies=async()=>{x.collector.close();await pending;return 'session=SYNTHETIC_COOKIE_ONLY';};
 x.options.createClaim=async()=>{assert.fail('claim after close');};
 const result=x.collector.collect(x.options);release();await assert.rejects(result,/COLLECTOR_CANCELLED/);
 assert.equal(x.options.client.isOpen,false);assert.equal(x.submissions.length,0);
});
test('candidate-only lease survives transport cleanup but expires at original request bound or dispose',async()=>{
 let now=NOW;const x=await setup(()=>now);let lease;
 x.options.submit=async value=>{lease=value.lease;value.recheck();};
 const result=await x.collector.collect(x.options);x.collector.close();await x.options.client.terminateConnection();
 assert.equal(lease.read(),result);assert.equal(lease.isCurrent(),true);assert.equal(lease.recheck().durableConsumptionPerformed,false);
 assert.equal(readHackerRankCollectorLease(lease).candidate,result);
 for(const forged of [{...lease},{read:()=>result,recheck:()=>lease.recheck()},result,null])assert.throws(()=>readHackerRankCollectorLease(forged),/UNTRUSTED_COLLECTOR_LEASE/);
 now=x.f.request.expiresAt;assert.equal(lease.isCurrent(),false);assert.throws(()=>lease.read(),/REQUEST_EXPIRED/);
 assert.throws(()=>readHackerRankCollectorLease(lease),/REQUEST_EXPIRED/);
 lease.dispose();assert.equal(lease.isCurrent(),false);assert.throws(()=>lease.recheck(),/COLLECTOR_LEASE_CLOSED/);
});
test('failed submit closes an exposed candidate-only lease',async()=>{
 const x=await setup();let lease;x.options.submit=async value=>{lease=value.lease;throw Error('SYNTHETIC_API_FAILURE');};
 await assert.rejects(x.collector.collect(x.options),/COLLECTION_FAILED/);assert.equal(lease.isCurrent(),false);
});
