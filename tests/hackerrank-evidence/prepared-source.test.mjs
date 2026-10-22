import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {prepareHackerRankSource} from '../../src/hackerrank-evidence/prepared-source.mjs';
import {readHackerRankCollectorLease} from '../../src/hackerrank-evidence/collector.mjs';
import {hash} from '../../src/hackerrank-evidence/values.mjs';
import {requestMessage,requestHash} from '../../src/hackerrank-evidence/request.mjs';
import {fixture,NOW,actors} from './fixture.mjs';

async function setup({selectedCertificateId=null}={}){
 const initial=await fixture();let now=NOW,authorized=true,f;
 const calls=[],client={isOpen:true,isInitialised:true,metadata:{},async terminateConnection(){this.isOpen=false;}};
 const input={trustConfig:initial.config,commitmentKey:initial.key,selectedCertificateId,client,routeClient:client,clock:()=>now,
  async readCookies({role}){calls.push(role);return 'session=SYNTHETIC_COOKIE_ONLY';},
  async createClaim(input){
   assert.equal(new Wallet(input.ownerPrivateKey).address.toLowerCase(),source.pins().expectedClaimOwner);
   const proof=f.input.proofs[input.context.clearSourceRole];
   return {claim:proof.claim,signatures:{claimSignature:Buffer.from(proof.signature.slice(2),'hex'),attestorAddress:proof.attestor}};
  },
 };
 const source=prepareHackerRankSource(input),pins=source.pins();
 f=await fixture({selectedCertificateId,requestPatch:{expectedClaimOwner:pins.expectedClaimOwner}});
 const options={isAuthorized:()=>authorized,async signRequest(message){calls.push('SIGN');assert.equal(message,requestMessage(f.request));return actors.participant.signMessage(message);}};
 return {source,pins,f,input,options,calls,setTime:v=>{now=v;},revoke:()=>{authorized=false;}};
}
test('pending trust exposes no owner/pins and touches no injected ports',async()=>{
 const fail=()=>assert.fail('blocked port called');
 const source=prepareHackerRankSource({readCookies:fail,createClaim:fail,clock:fail});
 assert.equal(source.status,'BLOCKED');assert.equal(source.pins(),null);
 await assert.rejects(source.collectLease({}, {isAuthorized:fail,signRequest:fail}),/TRUST_NOT_CONFIGURED/);source.close();
});
test('pins and both claims use the one prepared owner; only a branded candidate lease leaves',async()=>{
 const x=await setup();
 assert.deepEqual(Object.keys(x.pins).sort(),['audience','dataMode','expectedClaimOwner','recipeHash','selectedCertificateId','trustConfigHash']);
 assert.equal(x.pins.trustConfigHash,hash('TRUST',x.f.config));assert(Object.isFrozen(x.pins));
 // Caller mutations cannot change the already prepared trust/recipe.
 x.input.trustConfig.audience='changed-after-prepare';x.input.trustConfig.recipe.account.url='https://invalid.example';
 const lease=await x.source.collectLease(x.f.request,x.options),{candidate}=readHackerRankCollectorLease(lease);
 assert.equal(candidate.status,'VERIFIED_CANDIDATE');assert.equal(candidate.dataMode,'SYNTHETIC_FIXTURE');
 assert.equal(candidate.binding.expectedClaimOwnerHash,candidate.facts.claimOwnerHash);
 assert.equal(x.source.pins(),x.pins);assert.deepEqual(x.calls,['SIGN','account','certificate']);
 assert.throws(()=>readHackerRankCollectorLease({...lease}),/UNTRUSTED_COLLECTOR_LEASE/);
 await assert.rejects(x.source.collectLease(x.f.request,x.options),/COLLECTOR_CLOSED/);
 x.source.close();assert.equal(x.source.pins(),null);assert.throws(()=>readHackerRankCollectorLease(lease),/COLLECTOR_LEASE_CLOSED/);
});
test('request for another prepared instance or certificate is rejected before signing/cookies',async()=>{
 for(const field of ['expectedClaimOwner','selectedCertificateId','trustConfigHash','recipeHash','nonce']){
  const x=await setup(),other=await setup();
  const bad={...x.f.request,[field]:field==='expectedClaimOwner'?other.pins.expectedClaimOwner:field==='selectedCertificateId'?'other-record':'0x'+'00'.repeat(32)};
  await assert.rejects(x.source.collectLease(bad,x.options));assert.deepEqual(x.calls,[]);assert.equal(x.source.pins(),null);other.source.close();
 }
});
test('selected record and issued request stay fixed across pending participant signing',async()=>{
 const x=await setup({selectedCertificateId:'synthetic-python-rose'}),original=structuredClone(x.f.request);
 let release;const signing=new Promise(resolve=>{release=resolve;});
 const pending=x.source.collectLease(x.f.request,{...x.options,signRequest:message=>{assert.equal(message,requestMessage(original));return signing;}});
 x.f.request.nonce='0x'+'b2'.repeat(32);x.f.request.selectedCertificateId='other-record';
 release(await actors.participant.signMessage(requestMessage(original)));
 const lease=await pending;
 assert.equal(readHackerRankCollectorLease(lease).binding.requestHash,requestHash(original));
 assert.equal(x.source.pins().selectedCertificateId,original.selectedCertificateId);x.source.close();
});
test('authority loss during signing or cookie read never releases a candidate',async()=>{
 for(const step of ['SIGN','account']){
  const x=await setup();
  if(step==='SIGN'){const sign=x.options.signRequest;x.options.signRequest=async message=>{const result=await sign(message);x.revoke();return result;};}
  else{const read=x.input.readCookies;
   // Prepare a second source with a reader that revokes authorization while pending.
   x.source.close();
   const source=prepareHackerRankSource({...x.input,readCookies:async input=>{const cookie=await read(input);x.revoke();return cookie;}});
   const f=await fixture({requestPatch:{expectedClaimOwner:source.pins().expectedClaimOwner}});
   await assert.rejects(source.collectLease(f.request,{isAuthorized:x.options.isAuthorized,signRequest:message=>actors.participant.signMessage(message)}),/COLLECTOR_AUTHORITY/);
   assert.deepEqual(x.calls,['account']);assert.equal(source.pins(),null);continue;
  }
  await assert.rejects(x.source.collectLease(x.f.request,x.options),/COLLECTOR_AUTHORITY/);
  assert.deepEqual(x.calls,['SIGN']);assert.equal(x.source.pins(),null);
 }
});
test('close during pending signing and simultaneous collection preserve single-attempt ownership',async()=>{
 const x=await setup();let release;
 const signing=new Promise(resolve=>{release=resolve;});
 const pending=x.source.collectLease(x.f.request,{...x.options,signRequest:()=>signing});
 await assert.rejects(x.source.collectLease(x.f.request,x.options),/COLLECTOR_CLOSED/);
 x.source.close();release(await actors.participant.signMessage(requestMessage(x.f.request)));
 await assert.rejects(pending,/COLLECTOR_CLOSED/);assert.deepEqual(x.calls,[]);
});
test('abort, signature failure and private host exceptions close prepared source without cookies',async()=>{
 for(const mode of ['abort','signature','exception']){
  const x=await setup();
  if(mode==='abort')x.options.signal=AbortSignal.abort();
  else x.options.signRequest=async()=>{if(mode==='exception')throw Error('SYNTHETIC_PRIVATE_HOST_DETAIL');return '0x'+'00'.repeat(65);};
  await assert.rejects(x.source.collectLease(x.f.request,x.options),e=>/^(COLLECTOR_CANCELLED|PARTICIPANT_SIGNATURE|COLLECTION_FAILED)$/.test(e.message));
  assert.deepEqual(x.calls,[]);assert.equal(x.source.pins(),null);
 }
});
test('original request expiry invalidates lease; trust expiry invalidates pins and owner preparation',async()=>{
 const x=await setup(),lease=await x.source.collectLease(x.f.request,x.options);
 x.setTime(x.f.request.expiresAt);assert.throws(()=>readHackerRankCollectorLease(lease),/REQUEST_EXPIRED/);
 x.setTime(x.f.config.expiresAt);assert.equal(x.source.pins(),null);
 assert.throws(()=>readHackerRankCollectorLease(lease),/COLLECTOR_LEASE_CLOSED/);
 const y=await setup();y.setTime(y.f.config.expiresAt);
 assert.equal(y.source.pins(),null);await assert.rejects(y.source.collectLease(y.f.request,y.options),/COLLECTOR_CLOSED/);assert.deepEqual(y.calls,[]);
});
test('preparation rejects foreign client and live test driver before advertising pins',async()=>{
 const x=await setup();
 assert.throws(()=>prepareHackerRankSource({...x.input,routeClient:{}}),/COLLECTOR_SAME_CLIENT/);
 assert.throws(()=>prepareHackerRankSource({...x.input,trustConfig:{...x.f.config,dataMode:'RECLAIM_SIGNED_RECORD'}}),/COLLECTOR_TEST_DRIVER/);
 x.source.close();
});
test('already expired trust cannot advertise a prepared owner or invoke host ports',async()=>{
 const x=await setup();
 assert.throws(()=>prepareHackerRankSource({...x.input,clock:()=>x.f.config.expiresAt}),/TRUST_EXPIRED/);
 assert.deepEqual(x.calls,[]);x.source.close();
});
