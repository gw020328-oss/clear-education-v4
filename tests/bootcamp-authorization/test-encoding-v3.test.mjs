import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TypedDataEncoder} from 'ethers';
import {fixtureV3,mutationsV3,rebind,b32} from './test-fixture-v3.mjs';
import {fixture as oldFixture} from './fixture.mjs';
import {createTestDraftInspector,validateTestUnsignedPayload,hashTestUnsignedPayload,sourceCutoff,testDeadlineHash} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';
import {TYPES,PROFILE_HASH,PROFILE_COMMIT,PRIMARY_TYPE} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
import {grantTypes,vaultDomain} from '../../src/vault/encoding.mjs';
import {bootcampP0Example} from '../../specs/bootcamp/p0-example.mjs';
import {manualHashes} from './test-manual-hash-v3.mjs';
import {testOperationsHash} from '../../specs/bootcamp/hackathon-test-contract.mjs';
const inspect=(f,at=f.now)=>createTestDraftInspector(f.snapshot,{clock:()=>at}).inspect(f.input,f.state);
const payload=f=>({domain:f.input.domain,message:f.input.message});
const rejects=f=>assert.equal(inspect(f).status,'REJECTED');
test('E0 exact content hash and unsigned default; no activation from profile approval',()=>{
 assert.equal(testOperationsHash(),PROFILE_HASH);assert.equal(PROFILE_COMMIT,'67b6a0731f97df98fda7820ab24ed85a57796a83');
 assert.equal(createTestDraftInspector().inspect({anything:true}).status,'UNCONFIGURED');
 const r=inspect(fixtureV3());assert.equal(r.status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(r.profilePinMatchesE0,true);
 for(const k of ['sourceSignatureVerified','consentAuthenticityVerified','onchainStateVerified','nonceConsumed'])assert.equal(r[k],false);
 assert.equal(r.gates.paymentAllowed,false);assert.equal(r.gates.usableForIssuance,false);assert(Object.isFrozen(r));
});
for(const row of mutationsV3())test('v3 rejects caller mutation and binds digest '+row.label,()=>{
 const f=fixtureV3(),base=TypedDataEncoder.hash(f.input.domain,TYPES,f.input.message);f.input=row.input;
 assert.notEqual(TypedDataEncoder.hash(f.input.domain,TYPES,f.input.message),base);rejects(f);
});
for(const [label,edit] of [
 ['null',f=>f.input.message=null],['unknown field',f=>f.input.message.claimUntil='2000000500'],
 ['unknown route',f=>f.input.message.eligibilityRoute='3'],['route zero',f=>f.input.message.eligibilityRoute='0'],
 ['number',f=>f.input.message.amountAtoms=100000000],['unsafe number',f=>f.input.domain.chainId=9007199254740992],
 ['leading zero',f=>f.input.message.decisionRevision='01'],['negative',f=>f.input.message.issuedAt='-1'],
 ['uint64 overflow',f=>f.input.message.decisionRevision=(1n<<64n).toString()],
 ['uint256 overflow',f=>f.input.domain.chainId=(1n<<256n).toString()],
 ['zero nonce',f=>f.input.message.nonce=b32('00')],['zero recipient',f=>f.input.message.recipient='0x'+'00'.repeat(20)],
 ['unknown domain field',f=>f.input.domain.extra=true],['revision zero',f=>f.input.message.decisionRevision='0'],
 ['revalidation two',f=>f.input.message.revalidationCount='2'],['revalidation numeric zero',f=>f.input.message.revalidationCount=0],
 ['zero chain',f=>f.input.domain.chainId='0'],['case-folded hash',f=>f.input.message.decisionHash='0x'+'AA'.repeat(32)],
 ['recipient is vault',f=>f.input.message.recipient=f.input.domain.verifyingContract],
 ['recipient is token',f=>f.input.message.recipient=f.input.message.token],
 ])test('strict wire: '+label,()=>{const f=fixtureV3();edit(f);assert.throws(()=>validateTestUnsignedPayload(payload(f)));});
test('uint64/uint256 maxima accepted only as canonical strings where semantically allowed',()=>{
 const f=fixtureV3();f.input.domain.chainId=((1n<<256n)-1n).toString();f.input.message.decisionRevision=((1n<<64n)-1n).toString();
 assert.doesNotThrow(()=>hashTestUnsignedPayload(payload(f)));
 f.input.message.firstReviewStartedAt=((1n<<64n)-600n).toString();f.input.message.decisionPublishedAt=f.input.message.firstReviewStartedAt;f.input.message.issuedAt=f.input.message.firstReviewStartedAt;f.input.message.expiresAt=((1n<<64n)-1n).toString();f.input.message.sourceValidUntilExclusive=f.input.message.expiresAt;
 assert.throws(()=>validateTestUnsignedPayload(payload(f)),/REVIEW_TIME_OVERFLOW/);
});
test('v2 and existing V4 messages are incompatible with v3',()=>{
 const old=oldFixture();assert.throws(()=>hashTestUnsignedPayload({domain:old.input.domain,message:old.input.message}));
 const f=fixtureV3(),g={grantId:b32('20'),applicationId:f.input.message.applicationId,learner:f.input.message.recipient,policyHash:f.input.message.policyHash,runtimeConfigHash:b32('21'),examNullifier:b32('22'),amount:'100000000',verifiedAt:'2000000100',issueBy:'2000000160',claimUntil:'2000000500'};
 const oldDomain=vaultDomain({deployment:{chainId:31338,vaultAddress:f.input.domain.verifyingContract},config:{instanceId:f.input.domain.salt}});
 assert.notEqual(TypedDataEncoder.hash(oldDomain,grantTypes,g),hashTestUnsignedPayload(payload(f)).digest);
 assert.throws(()=>hashTestUnsignedPayload({domain:oldDomain,message:g}));
});
for(const [label,edit] of [
 ['wrong pin commit',f=>f.snapshot.profilePin.sourceCommit='a'.repeat(40)],
 ['self asserted profile hash',f=>{f.snapshot.profilePin.profileHash=b32('aa');f.snapshot.message.operationsPolicyHash=b32('aa');}],
 ['decimals',f=>f.snapshot.tokenDecimals='18'],['changed P0 hash',f=>f.snapshot.message.policyHash=b32('aa')],
 ['duplicate logical mapping',f=>f.snapshot.registrations.push(f.snapshot.registrations[0])],
 ['opaque ID reused across kinds',f=>f.snapshot.registrations[3].opaqueId=f.snapshot.registrations[0].opaqueId],
 ['missing procedure mapping',f=>f.snapshot.registrations.pop()],
 ['unregistered logical target',f=>f.snapshot.logicalTarget.procedureId='procedure-unknown'],
 ['legacy deadline claimUntil',f=>f.snapshot.deadlineRecord.claimUntil='2000000900'],
 ['arbitrary deadline commitment',f=>f.snapshot.message.deadlinePolicyHash=b32('ff')],
 ['deadline target swap',f=>f.snapshot.deadlineRecord.decisionId=b32('ff')],
 ])test('server snapshot rejects '+label,()=>{const f=fixtureV3();edit(f);assert.throws(()=>createTestDraftInspector(f.snapshot));});
test('snapshot is deep copied; input and state are not mutated; result contains no raw claim',()=>{
 const f=fixtureV3(),inspector=createTestDraftInspector(f.snapshot,{clock:()=>f.now}),before=JSON.stringify([f.input,f.state]);
 f.snapshot.message.recipient='0x'+'55'.repeat(20);f.snapshot.registrations.length=0;
 const r=inspector.inspect(f.input,f.state);assert.equal(r.status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(JSON.stringify([f.input,f.state]),before);
 f.input.message.recipient='0x'+'55'.repeat(20);assert.equal(inspector.inspect(f.input,f.state).status,'REJECTED');
 assert.equal(r.signature,undefined);assert.equal(r.sourceWindow,undefined);
});
test('clock overrides restricted to synthetic fixture provenance',()=>{const f=fixtureV3();f.snapshot.provenance='SERVER_OWNED_UNCONFIGURED';assert.throws(()=>createTestDraftInspector(f.snapshot,{clock:()=>f.now}),/REAL_CLOCK_REQUIRED/);});
for(const [field,value] of [
 ['decisionId',b32('ee')],['decisionRevision','2'],['decisionHash',b32('ee')],['firstReviewStartedAt','2000000010'],
 ['decisionPublishedAt','2000000021'],['procedureId',b32('ee')],['runtimeMappingHash',b32('ee')],['allocationId',b32('ee')],
 ['consentSetHash',b32('ee')],['deadlinePolicyHash',b32('ee')],['nonce',b32('ee')],['policyHash',b32('ee')],['operationsPolicyHash',b32('ee')],
 ['authorizationEpoch','2'],['signerKeyId',b32('ee')],['signerActive',false],['nonceAvailable',false],
 ['reservedBalanceAtoms','99999999'],['fullAllocation',false],['currentDecision',false],['currentDecisionStatus','NOT_MET'],
 ['bothPartiesConsent',false],['unresolvedValidObjection',true],['unassessedSubstantiveObjection',true],['newValidError',true],
 ['status','TERMINATED'],['revalidationCount','1'],
 ])test('current server state fails closed: '+field,()=>{const f=fixtureV3();f.state[field]=value;rejects(f);});
test('current domain changed rejects old deployment target',()=>{const f=fixtureV3();f.state.domain.salt=b32('ee');rejects(f);});
test('freshness is read each inspection, never cached as authorization',()=>{
 const f=fixtureV3(),i=createTestDraftInspector(f.snapshot,{clock:()=>f.now});assert.equal(i.inspect(f.input,f.state).status,'UNSIGNED_PREFLIGHT_ONLY');
 f.state.nonceAvailable=false;assert.equal(i.inspect(f.input,f.state).code,'NONCE_UNAVAILABLE');
});
test('approval time is exclusive; signed earlier does not excuse late first accept',()=>{const f=fixtureV3();assert.equal(inspect(f,2000000249).status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(inspect(f,2000000250).code,'FIRST_ACCEPT_TIME');assert.equal(inspect(f,2000000149).code,'FIRST_ACCEPT_TIME');});
test('source cutoff can precede approval expiry and caps it, no inherited 900 second approval TTL',()=>{
 const f=fixtureV3();f.input.message.expiresAt='2000000301';assert.throws(()=>validateTestUnsignedPayload(payload(f)),/FIRST_ACCEPT_EXPIRY_BOUND/);
 f.input.message.expiresAt='2000000151';assert.doesNotThrow(()=>validateTestUnsignedPayload(payload(f)));
});
test('timeout route is at publication +120 exactly; early route requires current consent',()=>{
 const f=fixtureV3({route:'2'});f.snapshot.message.issuedAt='2000000140';rebind(f);f.state.bothPartiesConsent=false;
 assert.equal(inspect(f,2000000140).status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(inspect(f,2000000139).status,'REJECTED');
 f.snapshot.message.issuedAt='2000000139';rebind(f);assert.throws(()=>createTestDraftInspector(f.snapshot),/CONFIRMATION_WINDOW/);
});
test('correction needs new target consent or full new 120 within the original 600',()=>{
 const f=fixtureV3({route:'2'});Object.assign(f.snapshot.message,{decisionRevision:'2',decisionId:b32('31'),decisionHash:b32('32'),decisionPublishedAt:'2000000480',issuedAt:'2000000600',expiresAt:'2000000601',sourceValidUntilExclusive:'2000000900',revalidationCount:'1'});rebind(f);
 assert.throws(()=>validateTestUnsignedPayload(payload(f)),/FIRST_ACCEPT_EXPIRY_BOUND/);
 Object.assign(f.input.message,{decisionPublishedAt:'2000000479',issuedAt:'2000000599',expiresAt:'2000000600'});assert.doesNotThrow(()=>validateTestUnsignedPayload(payload(f)));
});
test('overall 600 cutoff is exclusive and cannot reset from current server procedure',()=>{
 const f=fixtureV3();Object.assign(f.snapshot.message,{issuedAt:'2000000598',expiresAt:'2000000600',sourceValidUntilExclusive:'2000000700'});rebind(f);
 f.state.sourceWindow.moodleObservedAt=['2000000400','2000000400','2000000400'];
 assert.equal(inspect(f,2000000599).status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(inspect(f,2000000600).status,'REJECTED');
 f.state.firstReviewStartedAt='2000000100';rejects(f);
});
test('revalidation one permits valid snapshot, new valid error blocks even after budget used',()=>{const f=fixtureV3();f.snapshot.message.revalidationCount='1';rebind(f);assert.equal(inspect(f).status,'UNSIGNED_PREFLIGHT_ONLY');f.state.newValidError=true;rejects(f);});
for(const [name,edit,expected] of [
 ['Moodle oldest',s=>s.moodleObservedAt[2]='1999999390',2000000290n],
 ['Reclaim first',s=>s.reclaimIssuedAt[0]='1999999300',2000000200n],
 ['Reclaim second',s=>s.reclaimIssuedAt[1]='1999999301',2000000201n],
 ['raw maximum',s=>s.rawAcquiredAt='1999998400',2000000200n],
 ...['authLeaseExpiresAt','rawLeaseExpiresAt','queryLeaseExpiresAt','verifiedValidUntilExclusive'].map(k=>[k,s=>s[k]='2000000200',2000000200n]),
 ])test('source cutoff takes minimum: '+name,()=>{const f=fixtureV3();edit(f.state.sourceWindow);assert.equal(sourceCutoff(f.state.sourceWindow,BigInt(f.now)),expected);rejects(f);});
test('source exclusive expiry/future times/missing evidence are rejected',()=>{
 const f=fixtureV3();f.snapshot.message.expiresAt='2000000300';rebind(f);assert.equal(inspect(f,2000000299).status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(inspect(f,2000000300).status,'REJECTED');
 f.state.sourceWindow.moodleObservedAt[0]='2000000161';rejects(f);f.state.sourceWindow.moodleObservedAt.pop();rejects(f);
});
test('raw acquiredAt cannot refresh old observed source and all uint64 additions checked',()=>{
 const f=fixtureV3();f.state.sourceWindow.rawAcquiredAt='2000000160';assert.equal(sourceCutoff(f.state.sourceWindow,BigInt(f.now)),2000000800n);
 f.state.sourceWindow.moodleObservedAt[0]=((1n<<64n)-1n).toString();assert.throws(()=>sourceCutoff(f.state.sourceWindow,(1n<<64n)-1n),/SOURCE_TIME_OVERFLOW/);
});
test('accepted-right path has no current key/epoch/source/approval claim expiry guard, and cannot authorize claim',()=>{
 const f=fixtureV3();Object.assign(f.state,{status:'ACCEPTED',signerActive:false,authorizationEpoch:'99',nonceAvailable:false,decisionId:b32('ff'),currentDecision:false,newValidError:true});
 const r=inspect(f,2000010000);assert.equal(r.status,'NOT_APPLICABLE_ACCEPTED_RIGHT');assert.equal(r.claimExecutionVerified,false);assert.equal(r.gates.paymentAllowed,false);
});
test('fixed P0 SHA256 and decision bytes travel unchanged, not EXAM nullifiers',()=>{
 const f=fixtureV3(),example=bootcampP0Example();f.snapshot.message.decisionHash=example.decision.decisionHash;rebind(f);
 const h=hashTestUnsignedPayload(payload(f));assert.equal(h.primaryType,PRIMARY_TYPE);assert.equal(f.input.message.policyHash,example.decision.policyHash);assert.equal(f.input.message.decisionHash,example.decision.decisionHash);
 assert.equal(inspect(f).status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(h.digest,manualHashes(payload(f)).digest);
 assert.equal(testDeadlineHash(f.input.message),f.input.message.deadlinePolicyHash);
});
test('frozen v2 example remains distinct and has finite historical claimUntil only',()=>{
 const x=JSON.parse(readFileSync(new URL('../../docs/bootcamp-authorization/unsigned-example.json',import.meta.url)));
 assert(!JSON.stringify(x).includes('BootcampTestPaymentAuthorizationV3'));
 assert(JSON.stringify(x).includes('claimUntil'));
});

test('unrelated accepted right cannot be mistaken for the snapshot application',()=>{const f=fixtureV3();f.state.status='ACCEPTED';f.state.applicationId=b32('ee');rejects(f);});
test('malformed states, unknown fields and safe errors never reflect private input',()=>{
 const f=fixtureV3();f.state.secret='PRIVATE_DRAFT_CANARY';const r=inspect(f);assert.equal(r.status,'REJECTED');assert(!JSON.stringify(r).includes('PRIVATE_DRAFT_CANARY'));
 delete f.state.secret;f.state.signerActive='true';rejects(f);f.state.signerActive=true;f.state.reservedBalanceAtoms='01';rejects(f);
});
test('every numeric v3 field rejects overflow and unsafe wire numbers',()=>{
 const f=fixtureV3();for(const part of ['domain','message'])for(const [key,v] of Object.entries(f.input[part])){
  if(!/^[0-9]+$/.test(v)||part==='domain'&&key==='version')continue;
  for(const value of [9007199254740992,'9'.repeat(79),'01','-1',null]){const p=structuredClone(payload(f));p[part][key]=value;assert.throws(()=>validateTestUnsignedPayload(p),part+'.'+key);}
 }
});
test('deadline route cannot bypass substantive objections or missing exact allocation',()=>{for(const k of ['newValidError','unassessedSubstantiveObjection','unresolvedValidObjection']){const f=fixtureV3({route:'2'});f.state.bothPartiesConsent=false;f.state[k]=true;rejects(f);}});
test('published v3 proposal and unsigned example are reproducible, no signature',async()=>{
 const {PROPOSAL}=await import('../../src/bootcamp-authorization/test-schema-v3.mjs');
 assert.deepEqual(JSON.parse(readFileSync(new URL('../../docs/bootcamp-authorization/test-encoding-proposal-v3.json',import.meta.url))),PROPOSAL);
 const f=fixtureV3(),expected={provenance:'SYNTHETIC_EXAMPLE_NOT_AN_AUTHORIZATION',...f,result:inspect(f)};
 assert.deepEqual(JSON.parse(readFileSync(new URL('../../docs/bootcamp-authorization/test-unsigned-example-v3.json',import.meta.url))),expected);
});

test('facts acquired after issuance cannot retroactively justify that unsigned issuance',()=>{const f=fixtureV3();f.state.sourceWindow.rawAcquiredAt='2000000151';assert.equal(inspect(f).code,'SOURCE_FUTURE');});

test('longer current source window cannot extend previously issued approval or mutate its deadline',()=>{
 const f=fixtureV3(),before=JSON.stringify(f.input);
 f.state.sourceWindow.verifiedValidUntilExclusive='2000000900';
 assert.ok(sourceCutoff(f.state.sourceWindow,BigInt(f.now))>BigInt(f.input.message.sourceValidUntilExclusive));
 assert.equal(inspect(f,2000000249).status,'UNSIGNED_PREFLIGHT_ONLY');
 assert.equal(inspect(f,2000000250).code,'FIRST_ACCEPT_TIME');
 assert.equal(inspect(f,2000000300).status,'REJECTED');
 assert.equal(JSON.stringify(f.input),before);
});
