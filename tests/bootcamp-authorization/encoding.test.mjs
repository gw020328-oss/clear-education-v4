import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TypedDataEncoder} from 'ethers';
import {fixture,mutations,b32} from './fixture.mjs';
import {manualHashes,typeText} from './manual-hash.mjs';
import {DOMAIN_FIELDS,MESSAGE_FIELDS,PROPOSAL,TYPES,PRIMARY_TYPE} from '../../src/bootcamp-authorization/schema.mjs';
import {hashUnsignedPayload,validateUnsignedPayload,createUnsignedDraftInspector,unsignedInteger,v1RevisionToUint64} from '../../src/bootcamp-authorization/encoding.mjs';
import {grantTypes,vaultDomain} from '../../src/vault/encoding.mjs';
import {bootcampP0Example} from '../../specs/bootcamp/p0-example.mjs';
const payload=f=>({domain:f.input.domain,message:f.input.message});
test('explicit type order matches independent ABI literal and primary EIP712 encoding',()=>{
 assert.equal(TypedDataEncoder.from(TYPES).encodeType(PRIMARY_TYPE),typeText);
 const f=fixture(),r=hashUnsignedPayload(payload(f));for(const [k,v] of Object.entries(manualHashes(payload(f))))assert.equal(r[k],v);
 assert.equal(r.signatureVerified,false);assert.equal(r.sourceVerified,false);assert.equal(r.gates.usableForIssuance,false);
});
for(const row of mutations())test('unsigned mutation bound and hash-distinct: '+row.label,()=>{
 const f=fixture(),base=hashUnsignedPayload(payload(f)).digest,p={domain:row.input.domain,message:row.input.message};
 const raw=TypedDataEncoder.hash(p.domain,TYPES,p.message);assert.equal(raw,manualHashes(p).digest);assert.notEqual(raw,base);
 assert.equal(createUnsignedDraftInspector(f.snapshot).inspect(row.input).status,'REJECTED');
});
test('exact server target still remains blocked and consumes no nonce on retries',()=>{
 const f=fixture(),inspect=createUnsignedDraftInspector(f.snapshot).inspect,a=inspect(f.input),b=inspect(f.input);
 assert.deepEqual(a,b);assert.equal(a.status,'UNSIGNED_DRAFT_BLOCKED');assert.equal(a.gates.usableForIssuance,false);
 for(const field of ['currentStateVerified','consentVerified','clockFreshnessVerified','nonceConsumed','acceptedRightCreated','onchainDeadlineBindingVerified'])assert.equal(a[field],false);
 assert.equal(a.deadlineRecordConsistencyChecked,true);assert(a.blockers.includes('G6_ACTUAL_SOURCE_AND_P3_ACCEPTANCE'));
 assert(Object.isFrozen(a)&&Object.isFrozen(a.blockers));
});
test('undefined snapshot remains UNCONFIGURED regardless of claimed browser approval',()=>{
 assert.equal(createUnsignedDraftInspector().inspect({approved:true}).status,'UNCONFIGURED');
 const f=fixture();f.input.approved=true;assert.equal(createUnsignedDraftInspector(f.snapshot).inspect(f.input).code,'DRAFT_SHAPE');
});
for(const bits of [8,64,256])test('strict unsigned decimal uint'+bits+' boundaries without unsafe JS conversion',()=>{
 const max=((1n<<BigInt(bits))-1n).toString();assert.equal(unsignedInteger(max,bits),max);
 for(const x of ['0','00','01','+1','-1','1.0','1e2',' 1','1 ',1,Number.MAX_SAFE_INTEGER+1,1n,null,undefined,((1n<<BigInt(bits))).toString()])assert.throws(()=>unsignedInteger(x,bits));
});
test('safe v1 numeric revisions convert explicitly; unsafe numbers never round into uint64',()=>{
 assert.equal(v1RevisionToUint64(1),'1');assert.equal(v1RevisionToUint64(Number.MAX_SAFE_INTEGER),String(Number.MAX_SAFE_INTEGER));
 for(const x of [0,-1,1.2,'1',null,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>v1RevisionToUint64(x));
});
test('every numeric message/domain field rejects non-string zero and overflow',()=>{
 const f=fixture();
 for(const [part,fields] of [['domain',DOMAIN_FIELDS],['message',MESSAGE_FIELDS]])for(const {name,type} of fields.filter(x=>x.type.startsWith('uint'))){
  for(const value of [0,'0',null,Number.MAX_SAFE_INTEGER+1,(1n<<BigInt(type.slice(4))).toString()]){const p=structuredClone(payload(f));p[part][name]=value;assert.throws(()=>validateUnsignedPayload(p),name);}
 }
});
test('unknown fields, missing/null values, zero hashes/addresses and unknown routes reject',()=>{
 for(const part of ['domain','message']){
  const spec=part==='domain'?DOMAIN_FIELDS:MESSAGE_FIELDS;
  for(const {name,type} of spec){for(const action of ['missing','null','zero']){
   if(action==='zero'&&!['bytes32','address'].includes(type))continue;
   const p=structuredClone(payload(fixture()));if(action==='missing')delete p[part][name];else p[part][name]=action==='null'?null:'0x'+'00'.repeat(type==='address'?20:32);
   assert.throws(()=>validateUnsignedPayload(p),part+'.'+name+'.'+action);
  }}
  const p=structuredClone(payload(fixture()));p[part].unknown=true;assert.throws(()=>validateUnsignedPayload(p));
 }
 for(const route of ['0','3','255',null,1]){const p=payload(fixture());p.message.eligibilityRoute=route;assert.throws(()=>validateUnsignedPayload(p));}
});
test('fixed amount decimals and recipient constraints cannot be reinterpreted by snapshot',()=>{
 for(const patch of [{tokenDecimals:'18'},{tokenDecimals:6}])assert.throws(()=>createUnsignedDraftInspector({...fixture().snapshot,...patch}),/TOKEN_DECIMALS/);
 for(const amount of ['100','100000001']){const f=fixture();f.snapshot.message.amountAtoms=amount;assert.throws(()=>createUnsignedDraftInspector(f.snapshot),/FIXED_AMOUNT/);}
 for(const field of ['token','verifyingContract']){const p=payload(fixture());p.message.recipient=field==='token'?p.message.token:p.domain.verifyingContract;assert.throws(()=>hashUnsignedPayload(p),/RECIPIENT/);}
});
test('registered one-to-one opaque IDs reject aliasing, rebinding and browser logical target changes',()=>{
 for(const mutate of [s=>s.registrations.push({...s.registrations[0]}),s=>s.registrations[1].opaqueId=s.registrations[0].opaqueId,s=>s.registrations[0].opaqueId=b32('ee'),s=>s.registrations[0].logicalId='other-app']){
  const f=fixture();mutate(f.snapshot);assert.throws(()=>createUnsignedDraftInspector(f.snapshot));
 }
 const f=fixture(),i=createUnsignedDraftInspector(f.snapshot);f.input.logicalTarget.applicationId='other-app';assert.equal(i.inspect(f.input).code,'REGISTERED_TARGET');
});
test('factory snapshots resist registry, deadline, target and input changes after construction',()=>{
 const f=fixture(),i=createUnsignedDraftInspector(f.snapshot),a=i.inspect(f.input);
 f.snapshot.registrations[0].opaqueId=b32('ee');f.snapshot.message.recipient='0x'+'ee'.repeat(20);f.snapshot.deadlineRecord.claimUntil='1';
 assert.deepEqual(i.inspect(f.input),a);f.input.message.decisionHash=b32('ee');assert.equal(i.inspect(f.input).status,'REJECTED');assert.equal(a.hashes.digest,hashUnsignedPayload(payload(fixture())).digest);
});
test('route2 without immutable absolute deadline record is explicitly blocked, never defaulted',()=>{
 const f=fixture({route:'2',deadline:false}),r=createUnsignedDraftInspector(f.snapshot).inspect(f.input);
 assert.equal(r.status,'UNSIGNED_DRAFT_BLOCKED');assert(r.blockers.includes('ROUTE2_ABSOLUTE_DEADLINE_RECORD_REQUIRED'));assert.equal(r.deadlineRecordHash,null);
});
test('deadline target, relative substitutes, expiry, max TTL and route2 lower bound reject',()=>{
 const changes=[s=>s.deadlineRecord.decisionHash=b32('ee'),s=>s.deadlineRecord.eligibleAfter=null,s=>s.deadlineRecord.eligibleAfter='72h',s=>s.deadlineRecord.authorizeUntil='2000000159',s=>s.deadlineRecord.maximumAuthorizationTtlSeconds='59',s=>s.deadlineRecord.eligibleAfter='2000000101',s=>s.deadlineRecord.claimUntil='2000000200'];
 for(const change of changes){const f=fixture({route:'2'});change(f.snapshot);assert.throws(()=>createUnsignedDraftInspector(f.snapshot));}
 const f=fixture({route:'2'}),r=createUnsignedDraftInspector(f.snapshot).inspect(f.input);assert.equal(r.deadlineRecordConsistencyChecked,true);assert.equal(r.onchainDeadlineBindingVerified,false);assert.equal(r.gates.usableForIssuance,false);
});
test('unsafe errors never copy caller values or claim real source verification',()=>{
 const f=fixture(),bad={secret:'PRIVATE_DRAFT_CANARY'};const r=createUnsignedDraftInspector(f.snapshot).inspect(bad);
 assert.equal(r.status,'REJECTED');assert(!JSON.stringify(r).includes('PRIVATE_DRAFT_CANARY'));
});
test('existing V4 grant primary type/domain and examNullifier cannot replace v2 fields',()=>{
 const f=fixture(),g={grantId:b32('20'),applicationId:f.input.message.applicationId,learner:f.input.message.recipient,policyHash:f.input.message.policyHash,runtimeConfigHash:b32('21'),examNullifier:b32('22'),amount:'100000000',verifiedAt:'2000000100',issueBy:'2000000160',claimUntil:'2000000500'};
 const oldDomain=vaultDomain({deployment:{chainId:31338,vaultAddress:f.input.domain.verifyingContract},config:{instanceId:f.input.domain.salt}});
 assert.notEqual(TypedDataEncoder.hash(oldDomain,grantTypes,g),hashUnsignedPayload(payload(f)).digest);
 assert.throws(()=>hashUnsignedPayload({domain:oldDomain,message:g}));
 const p=payload(f);p.message.examNullifier=b32('22');assert.throws(()=>hashUnsignedPayload(p),/MESSAGE_SHAPE/);
});
test('R3 B selection is preserved as semantics, without implementing an epoch registry or challenge period',()=>{
 const d=JSON.parse(readFileSync(new URL('../../specs/bootcamp/p4-right-finality-decision.json',import.meta.url)));
 assert.equal(d.selectedOption,'B_CANONICAL_ACCEPT_REVOKE_ORDER_PRESERVES_ACCEPTED_RIGHT');
 assert.equal(d.beforeAccept.databaseStaleAloneRevokesEscapedSignature,false);assert.equal(d.afterAccept.claimRechecksCurrentSignerOrAppEpoch,false);
 assert.equal(d.newChallengePeriodApproved,false);assert.equal(d.paymentAllowed,false);
});
test('existing P0 policy and decision SHA256 values are carried as bytes32 without rehashing',()=>{
 const example=bootcampP0Example(),f=fixture();
 f.snapshot.message.decisionHash=example.decision.decisionHash;f.snapshot.deadlineRecord.decisionHash=example.decision.decisionHash;
 f.input.message=structuredClone(f.snapshot.message);
 const r=createUnsignedDraftInspector(f.snapshot).inspect(f.input);
 assert.equal(r.status,'UNSIGNED_DRAFT_BLOCKED');assert.equal(r.decisionHashSemantics,'UNCHANGED_P0_V1_BYTES32');
 assert.equal(r.hashes.digest,manualHashes(payload(f)).digest);
 assert.equal(f.input.message.policyHash,example.decision.policyHash);assert.equal(f.input.message.decisionHash,example.decision.decisionHash);
});
test('published proposed encoding and unsigned example are byte-for-byte reproducible without signing',()=>{
 const proposed=JSON.parse(readFileSync(new URL('../../docs/bootcamp-authorization/encoding-proposal.json',import.meta.url)));
 assert.deepEqual(proposed,PROPOSAL);
 const saved=JSON.parse(readFileSync(new URL('../../docs/bootcamp-authorization/unsigned-example.json',import.meta.url))),f=fixture();
 assert.deepEqual(saved,{provenance:'SYNTHETIC_EXAMPLE_NOT_AN_AUTHORIZATION',snapshot:f.snapshot,input:f.input,result:createUnsignedDraftInspector(f.snapshot).inspect(f.input)});
});
