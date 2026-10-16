import test from 'node:test';import assert from 'node:assert/strict';
import {Wallet,id} from 'ethers';
import {fixtureSigner,core} from '../model.mjs';
import {officialVerifier,syntheticVerifier,observedRegistry,assertRegistryUnchanged,makeContext,assessRegistryTime,requestFor} from './adapter.mjs';
import {record,proof,NOW,table,rows} from './fixture.mjs';
const make=(r=record(),now=NOW)=>syntheticVerifier({record:r,signer:fixtureSigner().address.toLowerCase(),clock:()=>now});
test('synthetic exact wire + private parser returns only safe public status',async()=>{
 const r=await make()(await proof());assert.equal(r.public.claimSignatureVerified,true);assert.equal(r.private.rows.length,3);assert.equal(r.public.zkParserIntegrated,false);assert.equal(r.public.paymentAllowed,false);
 assert.equal(JSON.stringify(r.public).includes('123456'),false);assert.equal(r.private.matching.length,1);
});
test('official adapter refuses synthetic signer; proof cannot replace registry',async()=>{
 const now=Math.floor(Date.now()/1000),r=record({createdAt:now-60,expiresAt:now+600});
 let fresh=true;try{assessRegistryTime(now);}catch{fresh=false;}
 // An expired snapshot tests expiry, never count it as a signer rejection.
 await assert.rejects(officialVerifier(r)(await proof({r,timestampS:now-10})),fresh?/SIGNER_EPOCH/:/REGISTRY_SNAPSHOT_EXPIRED/);
 assert.throws(()=>officialVerifier(record({registryDigest:'caller-registry'})),/REGISTRY_PIN/);
 assert.equal(observedRegistry.epochIsTimeWindow,false);
 assertRegistryUnchanged(JSON.stringify({data:observedRegistry.addresses.map(address=>({address}))}));
 assert.throws(()=>assertRegistryUnchanged(JSON.stringify({data:[{address:fixtureSigner().address}]})),/REGISTRY_CHANGED/);
});
for(const [name,opts] of [
 ['wrong epoch',{epoch:2}],['expired',{timestampS:NOW-1801}],['future',{timestampS:NOW+1}],
 ['wrong source',{params:'{}'}],['no qualifying row',{html:table(rows.slice(1))}],
 ['wrong signer',{signer:new Wallet(id('PUBLIC_SYNTHETIC_OTHER_SIGNER'))}],
 ['changed context',{context:makeContext(record({threshold:500}),table())}],
])test(name,async()=>await assert.rejects(make()(await proof(opts))));
test('recipient/owner/policy/scope/registration substitution rejected; current time owned by verifier',async()=>{
 const p=await proof();for(const delta of [{recipient:'0x3333333333333333333333333333333333333333'},{owner:'0x4444444444444444444444444444444444444444'},
 {threshold:900},{reuseScope:id('OTHER_PRODUCT')},{application:id('OTHER_APPLICATION')}])await assert.rejects(make(record(delta))(p));
 await assert.rejects(make(record(),NOW+601)(p));
 const changed=structuredClone(p);changed.claim.context=changed.claim.context.replace('850','950');changed.claim.identifier=core.getIdentifierFromClaimInfo({...changed.claim});await assert.rejects(make()(changed));
});

test('snapshot lifetime boundaries and caller-free SDK extraction request',()=>{
 const start=Math.floor(Date.parse(observedRegistry.retrievedAt)/1000);
 for(const now of [start,start+86399])assert.equal(assessRegistryTime(now).valid,true);
 for(const now of [start-1,start+86400,NaN])assert.throws(()=>assessRegistryTime(now),/SNAPSHOT_EXPIRED/);
 const req=requestFor(record());assert.deepEqual(Object.keys(req.context),['clearBinding']);assert.equal(req.owner,record().owner);
});
test('forged official label cannot turn a synthetic signature into an official signature',async()=>{
 const p=await proof();p.attestor=observedRegistry.addresses[0];
 const v=syntheticVerifier({record:record(),signer:p.attestor,clock:()=>NOW});
 await assert.rejects(v(p),/SIGNATURE/);
});
