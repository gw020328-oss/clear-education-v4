import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,actors,rows,NOW,USERNAME,resign,mutateContext,extract} from './fixture.mjs';
import {createHackerRankVerifier} from '../../src/hackerrank-evidence/verifier.mjs';
import {canonical,hash,strictJson} from '../../src/hackerrank-evidence/values.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';
import {parametersFor} from '../../src/hackerrank-evidence/recipes.mjs';
import {bootcampP0Example} from '../../specs/bootcamp/p0-example.mjs';
import {validateP0Evidence} from '../../specs/bootcamp/p0-contract.mjs';
const verify=f=>f.verifier.verify(f.input,f.request);
const reject=async(f,code)=>{const r=await verify(f);assert.notEqual(r.status,'VERIFIED_CANDIDATE');if(code)assert.equal(r.code,code);assert.equal(r.gates.paymentAllowed,false);return r;};

test('two SDK-verified synthetic signatures + separate participant/owner bind a fresh holding receipt',async()=>{
 const f=await fixture(),r=await verify(f);assert.equal(r.status,'VERIFIED_CANDIDATE');assert.equal(r.condition,'MET');
 assert.notEqual(f.request.expectedClaimOwner,f.request.participantWallet);assert.equal(r.facts.achievementAt,null);assert.equal(r.facts.accountProofIssuedAt,NOW-5);
 assert.equal(r.acquiredAt,NOW);assert.equal(r.verifiedAt,NOW);assert.equal(r.verification.sourceStatus,'MOCK_VERIFIED');
 assert.equal(r.cryptography.bothAttestorSignaturesVerified,true);assert.equal(r.cryptography.participantSignatureVerified,true);
 assert.equal(r.durableAcceptance,'REQUIRED_EXTERNAL_TRANSACTION');assert(Object.isFrozen(r.facts));
 const text=JSON.stringify(r);for(const secret of [USERNAME,rows[0].certificate_id,f.request.expectedClaimOwner,f.request.nonce,f.input.proofs.account.signature,'SYNTHETIC_COOKIE_ONLY'])assert(!text.includes(secret));
 const e=bootcampP0Example().evidence[3];Object.assign(e,{participantId:r.binding.participantId,applicationId:r.binding.applicationId,policyHash:r.binding.policyHash,source:r.source,acquiredAt:r.acquiredAt,verifiedAt:r.verifiedAt,facts:r.facts,sourceVersion:r.sourceVersion,sourceHash:r.sourceHash,runtimeMappingHash:r.binding.runtimeMappingHash,requestHash:r.binding.requestHash,verification:r.verification,condition:r.condition,rawLocator:{recordRef:'synthetic-private-locator',fieldPath:'/certificate/status',expiresAt:NOW+1800}});assert.doesNotThrow(()=>validateP0Evidence(e));
});
test('unknown or merely observed trust stays BLOCKED without reading a claim',async()=>{
 for(const trustConfig of [undefined,{status:'OBSERVED'}, {status:'UNCONFIGURED'}])assert.equal((await createHackerRankVerifier({trustConfig}).verify({})).status,'BLOCKED');
});
test('real-clock override and unreviewed live source cannot activate production trust',async()=>{
 const f=await fixture();const c={...f.config,dataMode:'RECLAIM_SIGNED_RECORD'};
 assert.throws(()=>createHackerRankVerifier({trustConfig:c,commitmentKey:f.key}),/TRUST_SOURCE_REVIEW/);
 c.sourceReview='AUTHENTICATED_SOURCE_REVIEWED';c.contextReview='SIGNED_REQUEST_CONTEXT_CONFIRMED';
 assert.throws(()=>createHackerRankVerifier({trustConfig:c,commitmentKey:f.key,clock:()=>NOW}),/REAL_CLOCK_REQUIRED/);
});
for(const role of ['account','certificate']){
 test(role+' unsigned extracted-field tampering fails cryptographic verification',async()=>{const f=await fixture();const p=f.input.proofs[role];const c=JSON.parse(p.claim.context);c.extractedParameters[role==='account'?'username':'records']='tampered';p.claim.context=canonical(c);p.claim.identifier=(await import('./fixture.mjs')).sdk.getIdentifierFromClaimInfo({...p.claim});await reject(f,'CLAIM_SIGNATURE');});
 test(role+' wrong signer rejected even with valid signature',async()=>{const f=await fixture();f.input.proofs[role]=await resign(f.input.proofs[role],()=>{},actors.other);await reject(f,'UNTRUSTED_SIGNER');});
 test(role+' incorrect claim owner rejected',async()=>{const f=await fixture();f.input.proofs[role]=await resign(f.input.proofs[role],c=>c.owner=actors.other.address.toLowerCase());await reject(f,'CLAIM_OWNER_OR_PROVIDER');});
 test(role+' incorrect epoch rejected',async()=>{const f=await fixture();f.input.proofs[role]=await resign(f.input.proofs[role],c=>c.epoch=2);await reject(f,'CLAIM_EPOCH');});
 for(const [label,ts] of [['old',NOW-901],['future',NOW+1],['before-request',NOW-11]])test(role+' '+label+' signed timestamp rejected',async()=>{const f=await fixture();f.input.proofs[role]=await resign(f.input.proofs[role],c=>c.timestampS=ts);await reject(f,'PROOF_TIME');});
 test(role+' source URL/recipe mutation rejected despite valid attestor signature',async()=>{const f=await fixture();f.input.proofs[role]=await resign(f.input.proofs[role],c=>{const p=JSON.parse(c.parameters);p.url='https://example.invalid/forged';c.parameters=canonical(p);});await reject(f,'SOURCE_RECIPE');});
 test(role+' extraction recipe substitution rejected',async()=>{const f=await fixture();f.input.proofs[role]=await resign(f.input.proofs[role],c=>{const p=JSON.parse(c.parameters);p.responseMatches[0].value='(?<username>.*)';c.parameters=canonical(p);});await reject(f,'SOURCE_RECIPE');});
 test(role+' absent signed request context is UNKNOWN, never bound by outer metadata',async()=>{const f=await fixture();f.input.proofs[role]=await mutateContext(f.input.proofs[role],c=>delete c.clearRequestHash);const r=await reject(f,'SIGNED_CONTEXT_REQUIRED');assert.equal(r.status,'UNKNOWN');});
 for(const [field,value] of [['clearRequestHash','0x'+'22'.repeat(32)],['clearSourceRole','wrong'],['clearRecipeHash','0x'+'33'.repeat(32)],['providerHash','wrong']])test(role+' signed '+field+' mismatch rejected',async()=>{const f=await fixture();f.input.proofs[role]=await mutateContext(f.input.proofs[role],c=>c[field]=value);await reject(f,field==='providerHash'?'PROVIDER_HASH':'SIGNED_REQUEST_BINDING');});
}
for(const [name,patch,code] of [
 ['policy',{policyHash:'0x'+'ab'.repeat(32)},'REQUEST_POLICY'],['criterion',{criterionId:'activity-complete'},'REQUEST_POLICY'],
 ['future',{issuedAt:NOW+1},'REQUEST_EXPIRED'],['expired',{issuedAt:NOW-900,expiresAt:NOW},'REQUEST_EXPIRED'],
 ['longer than 900s',{expiresAt:NOW+891},'REQUEST_WINDOW'],
])test('participant-signed request '+name+' rejected',async()=>{const f=await fixture({requestPatch:patch});await reject(f,code);});
test('participant signature cannot be replaced by a claim owner signature',async()=>{const f=await fixture();f.input.envelope.signature=await actors.owner.signMessage(requestMessage(f.request));await reject(f,'PARTICIPANT_SIGNATURE');});
for(const field of ['participantId','participantWallet','applicationId','runtimeMappingHash','nonce','expectedClaimOwner','audience'])test('server-issued expected '+field+' must match, not self-asserted browser binding',async()=>{
 const f=await fixture(),expected=structuredClone(f.request);expected[field]=field.endsWith('Hash')||field==='nonce'?'0x'+'12'.repeat(32):field==='participantWallet'||field==='expectedClaimOwner'?actors.other.address.toLowerCase():'different-record';
 assert.equal((await f.verifier.verify(f.input,expected)).code,'EXPECTED_REQUEST_MISMATCH');
});
test('same signed proofs cannot migrate to a new approved nonce',async()=>{const f=await fixture();f.request.nonce='0x'+'b2'.repeat(32);f.input.envelope.signature=await actors.participant.signMessage(requestMessage(f.request));await reject(f,'SIGNED_REQUEST_BINDING');});
test('same proofs cannot migrate to another approved participant/application',async()=>{const f=await fixture();f.request.participantId='another-participant';f.request.applicationId='another-application';f.input.envelope.signature=await actors.participant.signMessage(requestMessage(f.request));await reject(f,'SIGNED_REQUEST_BINDING');});
test('unsigned requestHash wrapper is rejected',async()=>{const f=await fixture();f.input.requestHash=hash('FAKE',f.request);await reject(f,'INPUT_SHAPE');});
test('different account certificate rejected with correct source URL and valid signature',async()=>{const f=await fixture({certificates:[{...rows[0],username:'synthetic_intruder'}]});await reject(f,'ACCOUNT_JOIN');});
test('different username source URL is rejected',async()=>{const f=await fixture();f.input.proofs.certificate=await resign(f.input.proofs.certificate,c=>{const p=JSON.parse(c.parameters);p.url=p.url.replace(USERNAME,'synthetic_intruder');c.parameters=canonical(p);});await reject(f,'SOURCE_RECIPE');});
test('wrong certification and explicit missing selection rejected',async()=>{await reject(await fixture({certificates:[{...rows[0],certificate_name:'SQL (Basic)'}]}),'CERTIFICATE_CLASS_OR_SELECTION');await reject(await fixture({selectedCertificateId:'not-present'}),'CERTIFICATE_CLASS_OR_SELECTION');});
test('unselected multiple Python candidates return AMBIGUOUS',async()=>{const r=await reject(await fixture({certificates:[rows[0],{...rows[0],certificate_id:'synthetic-other'}]}),'AMBIGUOUS_CERTIFICATE');assert.equal(r.status,'AMBIGUOUS');});
test('explicit ID selects second record; no data[0] dependency',async()=>{const f=await fixture({certificates:[{...rows[0],certificate_name:'SQL (Basic)',certificate_id:'synthetic-sql'},rows[0]],selectedCertificateId:rows[0].certificate_id});assert.equal((await verify(f)).condition,'MET');});
test('failed Python record plus passed SQL record cannot mix fields into success',async()=>{const f=await fixture({certificates:[{...rows[0],status:'test_failed'},{...rows[0],certificate_id:'synthetic-sql',certificate_name:'SQL (Basic)'}]});assert.equal((await verify(f)).condition,'NOT_MET');});
test('explicit selection binds the failed record when another matching certificate passes',async()=>{const f=await fixture({certificates:[rows[0],{...rows[0],certificate_id:'synthetic-failed',status:'test_failed'}],selectedCertificateId:'synthetic-failed'});assert.equal((await verify(f)).condition,'NOT_MET');});
test('duplicate IDs, nested/missing fields, unknown status and invented achievement rejected',async()=>{
 for(const [certificates,code] of [[[rows[0],rows[0]],'CERTIFICATE_ID'],[[{...rows[0],certificate_name:undefined}],'CERTIFICATE_RECORD_SHAPE'],[[{...rows[0],status:'pending'}],'UNKNOWN_ISSUER_STATUS'],[[{...rows[0],achievementAt:NOW-500}],'CERTIFICATE_RECORD_SHAPE']])await reject(await fixture({certificates}),code);
});
test('flat independent extracted fields are not accepted as a same-record proof',async()=>{const f=await fixture();f.input.proofs.certificate=await mutateContext(f.input.proofs.certificate,c=>c.extractedParameters={username:USERNAME,certificate_id:rows[0].certificate_id,certificate_name:'Python (Basic)',status:'test_passed'});await reject(f,'EXTRACTED_FIELDS');});
test('oversized array, duplicate JSON fields and malformed source JSON reject',async()=>{
 const f=await fixture();for(const text of ['[{"username":"a","username":"b"}]','[1,]','[',JSON.stringify(Array.from({length:33},(_,i)=>({...rows[0],certificate_id:'synthetic-'+i})))]){
  f.input.proofs.certificate=await mutateContext(f.input.proofs.certificate,c=>c.extractedParameters.records=text);await reject(f);
 }
});
test('duplicate escaped context keys and unsafe JSON keys rejected before interpretation',()=>{
 for(const text of ['{"x":1,"\\u0078":2}','{"__proto__":{}}','{"constructor":2}','[1.5]','[1e2]','{"x":true,}'])assert.throws(()=>strictJson(text));
 assert.deepEqual(strictJson(' { "b": 2, "a": [true, null, "\\u0041"] } '),{b:2,a:[true,null,'A']});
});
test('expiry and trust expiry are rechecked after asynchronous signature verification',async()=>{
 let n=0;await reject(await fixture({clock:()=>n++===0?NOW:NOW+890}),'REQUEST_EXPIRED');
 n=0;await reject(await fixture({trustPatch:{expiresAt:NOW+1},clock:()=>n++===0?NOW:NOW+1}),'TRUST_EXPIRED');
});
test('input snapshots prevent mutation during crypto awaits',async()=>{const f=await fixture();const p=verify(f);f.input.proofs.certificate.claim.context='mutated';f.request.participantId='mutated';assert.equal((await p).binding.participantId,'participant-orchid');});
test('trusted config and commitment key are snapshotted',async()=>{const f=await fixture();f.config.signers[0]=actors.other.address.toLowerCase();f.key.fill(0);assert.equal((await verify(f)).status,'VERIFIED_CANDIDATE');});
test('candidate recheck requires producer provenance, exact request and current real-time bounds',async()=>{
 let time=NOW;const f=await fixture({clock:()=>time}),r=await verify(f);assert.equal(f.verifier.recheck(r,f.request).durableConsumptionPerformed,false);
 assert.throws(()=>f.verifier.recheck(structuredClone(r),f.request),/UNTRUSTED_CANDIDATE/);
 const changed={...f.request,nonce:'0x'+'44'.repeat(32)};assert.throws(()=>f.verifier.recheck(r,changed),/EXPECTED_REQUEST_MISMATCH/);
 time=r.validUntilExclusive;assert.throws(()=>f.verifier.recheck(r,f.request),/REQUEST_EXPIRED|CANDIDATE_EXPIRED/);
});
test('same request replay stays pending external atomic consumption, including verifier restart',async()=>{
 const f=await fixture(),a=await verify(f),b=await verify(f);assert.equal(a.receiptHash,b.receiptHash);assert.equal(f.verifier.recheck(a,f.request).nonceHash,f.verifier.recheck(b,f.request).nonceHash);
 const restart=createHackerRankVerifier({trustConfig:f.config,commitmentKey:f.key,clock:()=>NOW});assert.equal((await restart.verify(f.input,f.request)).status,'VERIFIED_CANDIDATE');
 assert.throws(()=>restart.recheck(a,f.request),/UNTRUSTED_CANDIDATE/);
});
test('SDK extraction of synthetic HTTP cannot accept an anonymous page without account marker',async()=>{
 const f=await fixture();assert.throws(()=>extract(parametersFor(f.config.recipe,'account'),'anonymous dashboard'));
});
test('untrusted malformed input returns only fixed error code, no raw exception or source',async()=>{
 const f=await fixture(),r=await f.verifier.verify({secret:'SYNTHETIC_PRIVATE_CANARY'},f.request);assert(!JSON.stringify(r).includes('SYNTHETIC_PRIVATE_CANARY'));assert.equal(r.condition,'UNKNOWN');
});
for(const [field,value] of [['username','synthetic_intruder'],['certificate_id','synthetic-swapped'],['certificate_name','SQL (Basic)'],['status','test_failed']])test('unsigned single-record '+field+' alteration rejects despite recomputed identifier',async()=>{
 const f=await fixture(),p=f.input.proofs.certificate,c=JSON.parse(p.claim.context),records=JSON.parse(c.extractedParameters.records);records[0][field]=value;c.extractedParameters.records=JSON.stringify(records);p.claim.context=canonical(c);p.claim.identifier=(await import('./fixture.mjs')).sdk.getIdentifierFromClaimInfo({...p.claim});await reject(f,'CLAIM_SIGNATURE');
});
for(const role of ['account','certificate'])test(role+' corrupted signature rejects',async()=>{const f=await fixture(),p=f.input.proofs[role];p.signature='0x'+'00'.repeat(65);await reject(f,'CLAIM_SIGNATURE');});
test('claim context whitespace cannot evade stable semantic proof-bundle hashing',async()=>{
 const f=await fixture(),a=await verify(f);for(const p of Object.values(f.input.proofs))p.claim.context=JSON.stringify(JSON.parse(p.claim.context),null,2);
 const b=await verify(f);assert.equal(b.status,'VERIFIED_CANDIDATE');assert.equal(a.proofBundleHash,b.proofBundleHash);assert.equal(a.receiptHash,b.receiptHash);
});
test('duplicate signed context keys reject even when SDK canonicalization would keep the same value',async()=>{
 const f=await fixture(),p=f.input.proofs.account,c=JSON.parse(p.claim.context);p.claim.context=p.claim.context.replace('{','{"clearSchema":'+JSON.stringify(c.clearSchema)+',');await reject(f,'DUPLICATE_OR_UNSAFE_JSON_KEY');
});
test('browser acquiredAt/verifiedAt and condition flags cannot replace signed proof freshness or predicate',async()=>{for(const field of ['acquiredAt','verifiedAt','condition']){const f=await fixture();f.input[field]=field==='condition'?'MET':NOW;await reject(f,'INPUT_SHAPE');}});
test('request pins trust config and rejects zero nonce',async()=>{await reject(await fixture({requestPatch:{trustConfigHash:'0x'+'12'.repeat(32)}}),'REQUEST_TRUST');await reject(await fixture({requestPatch:{nonce:'0x'+'00'.repeat(32)}}),'REQUEST_HASH');});
test('expired signer configuration fails before claim acceptance',async()=>{await reject(await fixture({trustPatch:{expiresAt:NOW}}),'TRUST_EXPIRED');});
test('proof role swap, missing proof and incorrect provider reject',async()=>{
 const f=await fixture();[f.input.proofs.account,f.input.proofs.certificate]=[f.input.proofs.certificate,f.input.proofs.account];await reject(f,'SOURCE_RECIPE');
 const g=await fixture();delete g.input.proofs.account;await reject(g,'PROOF_PAIR');
 const h=await fixture();h.input.proofs.account=await resign(h.input.proofs.account,c=>c.provider='other-provider');await reject(h,'CLAIM_OWNER_OR_PROVIDER');
});
test('trusted recipe cannot omit required named capture or invert its match',async()=>{
 const f=await fixture();for(const role of ['account','certificate'])for(const change of [m=>m.value='.*',m=>m.invert=true,m=>m.type='contains']){
  const config=structuredClone(f.config);change(config.recipe[role].responseMatches[0]);assert.throws(()=>createHackerRankVerifier({trustConfig:config,commitmentKey:f.key,clock:()=>NOW}),/RECIPE_REQUIRED_CAPTURE/);
 }
});
test('synthetic source recipe cannot be promoted to live by changing trust review labels',async()=>{
 const f=await fixture(),config={...f.config,dataMode:'RECLAIM_SIGNED_RECORD',sourceReview:'AUTHENTICATED_SOURCE_REVIEWED',contextReview:'SIGNED_REQUEST_CONTEXT_CONFIRMED'};
 assert.throws(()=>createHackerRankVerifier({trustConfig:config,commitmentKey:f.key}),/SYNTHETIC_RECIPE_IN_LIVE_MODE/);
});
test('mandatory synthetic captures never succeed with an empty account/absent record array',async()=>{
 const f=await fixture();assert.throws(()=>extract(parametersFor(f.config.recipe,'account'),'<synthetic-account-control></synthetic-account-control>'));
 assert.throws(()=>extract(parametersFor(f.config.recipe,'certificate',USERNAME),'{"data":null}'));
});
test('SDK successful regex branch can produce no extraction despite containing the required capture name',async()=>{
 const f=await fixture(),params=parametersFor(f.config.recipe,'account');
 params.responseMatches[0].value='(?:^|\\r\\n\\r\\n)(?:anonymous|<synthetic-account-control>(?<username>[A-Za-z0-9_-]+)</synthetic-account-control>)$';
 // This is a source-review counterexample, not an approved recipe. A named-group
 // string check alone cannot prove all successful branches extract a field.
 assert.deepEqual(extract(params,'anonymous')??{},{});
 assert.equal((await createHackerRankVerifier({trustConfig:{status:'UNCONFIGURED'}}).verify(f.input,f.request)).status,'BLOCKED');
});
