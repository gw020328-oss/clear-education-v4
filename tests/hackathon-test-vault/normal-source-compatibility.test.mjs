import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {normalE2Hash,NORMAL_E2_PATH,NORMAL_SOURCE_INTAKE,NORMAL_SOURCE_INTAKE_SHA} from '../../src/hackathon-test-vault/normal-source-compatibility.mjs';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('original accepted E2 pins match original Git snapshot; only reviewed E2 label delta is current',()=>{
 const pins=JSON.parse(read('specs/bootcamp/hackathon-test-consumer-pins-v1.json'));
 assert.equal(sha(read(NORMAL_SOURCE_INTAKE)),NORMAL_SOURCE_INTAKE_SHA);
 for(const [path,expected]of Object.entries(pins.artifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${pins.e2.commit}:${path}`],{cwd:root})),expected,path);
  assert.equal(sha(read(path)),normalE2Hash(path,expected),path);
  if(path!==NORMAL_E2_PATH)assert.equal(normalE2Hash(path,expected),expected);
 }
 assert.throws(()=>normalE2Hash(NORMAL_E2_PATH,'0'.repeat(64)),/NORMAL_SOURCE_INTAKE_PIN/);
 assert.equal(normalE2Hash('src/unlisted.mjs','synthetic-value'),'synthetic-value');
});
test('v5 preserves all 36 original source snapshots and historical v1-v4/component bytes',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v5.json';
 assert.equal(sha(read(path)),'7b89a6c9f73797f0a6faff890f8a097f18dd3f91730eddc7f2cc56730c0f17ff');
 const v5=JSON.parse(read(path)),tables=['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256'];
 assert.deepEqual(tables.map(k=>Object.keys(v5[k]).length),[8,19,6,3]);
 for(const table of tables)for(const [p,h]of Object.entries(v5[table])){
  assert.equal(sha(execFileSync('git',['show',`${v5.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
 }
 const historical=['specs/bootcamp/hackathon-test-boundary-intake-v1.json','specs/bootcamp/hackathon-test-consumer-pins-v1.json',...Array.from({length:3},(_,i)=>`specs/bootcamp/hackathon-test-memory-source-intake-v${i+2}.json`),'docs/hackathon-test-vault/e5b/source-pins.json','docs/hackathon-test-vault/e5b/source-pins-v2.json','docs/hackathon-test-vault/e5b/normal-source-pins.json'];
 for(const p of historical)assert.deepEqual(read(p),execFileSync('git',['show',`8851775fa4f34e1af0a858436cf3dea648eda9af:${p}`],{cwd:root}),p);
 const v4=JSON.parse(read(v5.previousCompatibilityRecord.path));
 for(const [p,h]of Object.entries({...v4.e3ArtifactSha256,...v4.additionalSourceArtifactSha256}))assert.equal(sha(execFileSync('git',['show',`${v4.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
});
test('v6 preserves exactly three reviewed deltas and all 36 historical sources to the candidate snapshot',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v6.json';
 assert.equal(sha(read(path)),'247326385d1514c57383553a9f7290a3a59f9ba1182f91600443f35027d32f22');
 const v6=JSON.parse(read(path)),v5=JSON.parse(read('specs/bootcamp/hackathon-test-memory-source-intake-v5.json'));
 assert.equal(v6.currentSourceCandidateHead,'92387a49a7808af0f7b240021aafcd01edc17253');
 const changed=['src/bootcamp/store.mjs','src/bootcamp/moodle-live-consumer.mjs','tools/bootcamp/live-context.mjs'];
 assert.deepEqual(v6.changedFromV5,changed);assert.deepEqual(Object.keys(v6.sourceDelta).sort(),[...changed].sort());
 const tables=['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256'];
 assert.deepEqual(tables.map(k=>Object.keys(v6[k]).length),[8,19,6,3]);
 const actual=[];
 for(const table of tables){
  assert.deepEqual(Object.keys(v6[table]).sort(),Object.keys(v5[table]).sort());
  for(const [p,h]of Object.entries(v6[table])){
   assert.equal(sha(execFileSync('git',['show',`${v6.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
   if(h!==v5[table][p]){actual.push(p);assert.deepEqual(v6.sourceDelta[p],{before:v5[table][p],after:h});}
  }
 }
 assert.deepEqual(actual.sort(),[...changed].sort());
 assert.equal(sha(execFileSync('git',['show','1e923495380c81abf2eab13b21ec918ef2915495:'+v6.reflectionPreparation.testPath],{cwd:root})),v6.reflectionPreparation.testSha256);
 assert.deepEqual(v6.allowedRuntimeKinds,['FRESH_ISOLATED_MEMORY_EVM_STAGE_HARNESS']);
 for(const flag of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled'])assert.equal(v6[flag],false,flag);
});
test('v6 guard records preserve every prior owner acceptance byte',()=>{
 const next=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v3.json'));
 assert.equal(next.baseHead,'da5b1cd5d62b8f56658346d9b23a31f7c9637910');
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v5.json','docs/hackathon-test-vault/e5b/normal-source-pins-v2.json','docs/hackathon-test-vault/e5b/ci-source-pins.json']){
  assert.deepEqual(read(p),execFileSync('git',['show',`${next.baseHead}:${p}`],{cwd:root}),p);
 }
 for(const [p,delta]of Object.entries(next.changes)){
  assert.equal(sha(execFileSync('git',['show',`${next.baseHead}:${p}`],{cwd:root})),delta.before,p);
  assert.equal(sha(execFileSync('git',['show',`7b35bb3dc47d5604f305cc4e063e003dbb1a79a8:${p}`],{cwd:root})),delta.after,p);
 }
 assert.equal(next.priorAcceptanceBytesChanged,false);assert.equal(next.actualSourceAccepted,false);
});
test('v7 pins the reviewed six-file delta and complete listed dependency generation without rewriting v6',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v7.json';
 assert.equal(sha(read(path)),'4b82c1356b95e284d52e166928dc70823548e4ee1e1bb6785c221398c5740107');
 const v7=JSON.parse(read(path)),v6=JSON.parse(read(v7.previousCompatibilityRecord.path));
 assert.equal(v7.currentSourceCandidateHead,'b07be3c928e476a2b6f1414bc8287a63bac28a7a');
 assert.equal(v7.producerHead,'e658b4026b44f800b607d2d7db64e14f3fd81666');
 const changed=['src/bootcamp/http.mjs','src/bootcamp/reclaim-live-consumer.mjs','src/hackerrank-evidence/collector.mjs','tools/bootcamp/live-context.mjs','tools/bootcamp/normal-chain.mjs','tools/bootcamp/prepare-live-input.mjs'];
 assert.deepEqual(v7.changedFromV6,changed);assert.deepEqual(Object.keys(v7.sourceDelta).sort(),changed);
 const tables=['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256'];
 for(const table of tables){
  assert.deepEqual(Object.keys(v7[table]),Object.keys(v6[table]));
  for(const [p,h]of Object.entries(v7[table])){
   if(changed.includes(p))assert.deepEqual(v7.sourceDelta[p],{before:v6[table][p],after:h});else assert.equal(h,v6[table][p]);
  }
 }
 const all=Object.assign({},...tables.map(k=>v7[k]),v7.transitiveSourceArtifactSha256,v7.runtimeAssetSha256);
 assert.equal(Object.keys(all).length,134);
 for(const [p,h]of Object.entries(all)){
  assert.equal(sha(execFileSync('git',['show',`${v7.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
 }
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v6.json','docs/hackathon-test-vault/e5b/normal-source-pins-v3.json']){
  assert.deepEqual(read(p),execFileSync('git',['show',`3f3c33f1c0130b6e85bf4eab0bfa282bf88cff6a:${p}`],{cwd:root}),p);
 }
 assert.equal(v7.uiBoundary.serverParticipantKeyFallback,false);assert.equal(v7.sourceResponsibility.independentStructureProof,false);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(v7[k],false,k);
});
test('v7 guard update preserves original v6 guard bytes and pins only the declared consumer changes',()=>{
 const v7=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v4.json'));
 for(const [p,delta]of Object.entries(v7.changes)){
  assert.equal(sha(execFileSync('git',['show',`${v7.baseHead}:${p}`],{cwd:root})),delta.before,p);assert.equal(sha(execFileSync('git',['show',`726c21d63f999d14161408040a12dff66ae0d5d2:${p}`],{cwd:root})),delta.after,p);
 }
 for(const [p,h]of Object.entries(v7.additions))assert.equal(sha(read(p)),h,p);
 assert.equal(v7.priorAcceptanceBytesChanged,false);assert.equal(v7.actualSourceAccepted,false);
});
test('v8 pins four read-only/browser changes and one addition while preserving every v7 source/guard byte',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v8.json';assert.equal(sha(read(path)),'ca37fb5574a293ac6873d4d22e136fcc2f214f58a60b0a8d7f46e09dd786ed33');
 const v8=JSON.parse(read(path)),v7=JSON.parse(read(v8.previousCompatibilityRecord.path));
 assert.equal(v8.currentSourceCandidateHead,'cbda762ba41e94413e5aa582bc22a3a4db71ff74');
 const old=Object.assign({},...['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256','transitiveSourceArtifactSha256','runtimeAssetSha256'].map(k=>v7[k]));
 assert.equal(Object.keys(old).length,134);assert.equal(Object.keys(v8.sourceArtifactSha256).length,135);
 const changed=['src/bootcamp/http.mjs','src/bootcamp/normal-client.mjs','tools/bootcamp/frontend-server.mjs','tools/bootcamp/live-context.mjs'];
 assert.deepEqual(v8.changedFromV7,changed);assert.deepEqual(Object.keys(v8.sourceDelta),changed);assert.deepEqual(Object.keys(v8.sourceAdditions),['src/bootcamp/normal-receipt.mjs']);
 for(const [p,h]of Object.entries(old)){
  assert.equal(sha(execFileSync('git',['show',`${v7.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
  if(changed.includes(p))assert.deepEqual(v8.sourceDelta[p],{before:h,after:v8.sourceArtifactSha256[p]});else assert.equal(v8.sourceArtifactSha256[p],h,p);
 }
 for(const [p,h]of Object.entries(v8.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${v8.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
 }
 const guard=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v5.json'));
 for(const [p,d]of Object.entries(guard.changes)){assert.equal(sha(execFileSync('git',['show',`${guard.baseHead}:${p}`],{cwd:root})),d.before,p);assert.equal(sha(execFileSync('git',['show',`dd4a79ac048fa572396b6cedd0553b042545b856:${p}`],{cwd:root})),d.after,p);}
 for(const [p,h]of Object.entries(guard.additions))assert.equal(sha(read(p)),h,p);
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v7.json','docs/hackathon-test-vault/e5b/normal-source-pins-v4.json','src/hackathon-test-vault/reviewed-source-v7.mjs'])assert.deepEqual(read(p),execFileSync('git',['show',`${guard.baseHead}:${p}`],{cwd:root}),p);
 assert.equal(v8.readOnlyReceipt.callerSelectedTxRecipientAmountAccepted,false);assert.equal(v8.readOnlyReceipt.nullOnUncertainOrUnmeasured,true);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(v8[k],false,k);
});
test('v9 pins only owned canonical refresh and preserves v8 sources, TTL, source and review windows',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v9.json';assert.equal(sha(read(path)),'19261eca5c089bf8ae68626bfdfff87b935bb7c4b0a9c783bb52709c9a2870fc');
 const v9=JSON.parse(read(path)),v8=JSON.parse(read(v9.previousCompatibilityRecord.path));
 assert.equal(v9.currentSourceCandidateHead,'26d451701186632ba7a37729b9937f28ce3a1f83');
 const changed=['src/bootcamp/http.mjs','tools/bootcamp/explicit-consents.mjs','tools/bootcamp/live-context.mjs','tools/bootcamp/normal-chain.mjs'];
 assert.deepEqual(v9.changedFromV8,changed);assert.deepEqual(Object.keys(v9.sourceDelta),changed);assert.deepEqual(v9.sourceAdditions,{});
 assert.equal(Object.keys(v9.sourceArtifactSha256).length,135);assert.deepEqual(Object.keys(v9.sourceArtifactSha256),Object.keys(v8.sourceArtifactSha256));
 for(const [p,h]of Object.entries(v8.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${v8.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
  if(changed.includes(p))assert.deepEqual(v9.sourceDelta[p],{before:h,after:v9.sourceArtifactSha256[p]});else assert.equal(v9.sourceArtifactSha256[p],h,p);
 }
 for(const [p,h]of Object.entries(v9.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show',`${v9.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 const guard=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v6.json'));
 for(const [p,d]of Object.entries(guard.changes)){assert.equal(sha(execFileSync('git',['show',`${guard.baseHead}:${p}`],{cwd:root})),d.before,p);assert.equal(sha(execFileSync('git',['show',`6294cf0b82a5f092e1973aeb92efb769a1f7dd77:${p}`],{cwd:root})),d.after,p);}
 for(const [p,h]of Object.entries(guard.additions))assert.equal(sha(read(p)),h,p);
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v8.json','docs/hackathon-test-vault/e5b/normal-source-pins-v5.json','src/hackathon-test-vault/reviewed-source-v8.mjs'])assert.deepEqual(read(p),execFileSync('git',['show',`${guard.baseHead}:${p}`],{cwd:root}),p);
 assert.equal(v9.humanWait.canonicalSnapshotTtlSeconds,5);for(const k of ['snapshotTtlChanged','originalSourceExpiryExtended','originalReviewCapExtended'])assert.equal(v9.humanWait[k],false,k);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(v9[k],false,k);
});

test('v10 owns exact host preparation/session delta and preserves v9 original source and guard snapshots',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v10.json';assert.equal(sha(read(path)),'823761592e8178e682ad2f2c39dd6d95423dcbcebad9ffdd15bb2ccfb4424ba8');
 const v10=JSON.parse(read(path)),v9=JSON.parse(read(v10.previousCompatibilityRecord.path));
 assert.equal(v10.currentSourceCandidateHead,'3c086b6f755bce880031bf1be92aa7df5905ab41');assert.equal(Object.keys(v10.sourceArtifactSha256).length,159);
 assert.equal(Object.keys(v10.sourceAdditions).length,24);assert.deepEqual(v10.changedFromV9,['src/bootcamp/http.mjs','src/bootcamp/normal-client.mjs','tools/bootcamp/frontend-server.mjs','tools/bootcamp/live-context.mjs']);
 for(const [p,h]of Object.entries(v9.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show',`${v9.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
  assert.equal(v10.sourceArtifactSha256[p],v10.sourceDelta[p]?.after??h,p);if(v10.sourceDelta[p])assert.equal(v10.sourceDelta[p].before,h,p);}
 for(const [p,h]of Object.entries(v10.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show',`944afafda1543cff70cb257915ccd7d7a0fa8cf3:${p}`],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${v10.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v9.json','docs/hackathon-test-vault/e5b/normal-source-pins-v6.json','src/hackathon-test-vault/reviewed-source-v9.mjs'])assert.deepEqual(read(p),execFileSync('git',['show',`14125ad12502b858cefd2ffc5c23c6ba6d7836a6:${p}`],{cwd:root}),p);
 const host=v10.normalHost;assert.equal(host.explicitActivationRequired,true);assert.equal(host.exactFreshAiApprovalRequired,true);
 for(const k of ['prepareCreatesApplication','prepareCreatesRealm','prepareIssuesSourceLease','registryOpensBrowser','existingSourceReviewExpiryExtended','frontendOwnedTreeEdited'])assert.equal(host[k],false,k);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(v10[k],false,k);
});

test('v11 accepts exactly the source lease resolver fix and preserves the complete v10 source/guard generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v11.json';assert.equal(sha(read(path)),'55c2986611b5ed0b3df69cc2e5294e3932715a847649ca5adc36f4f52146b65d');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'34d3661d558e4b07ed68e9cc26aa59eb499fe386');assert.equal(current.previousCompatibilityRecord.guardHead,'944afafda1543cff70cb257915ccd7d7a0fa8cf3');
 assert.deepEqual(current.changedFromV10,['tools/bootcamp/live-context.mjs']);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV10);assert.deepEqual(current.sourceAdditions,{});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,159);assert.deepEqual(Object.keys(current.sourceArtifactSha256),Object.keys(old.sourceArtifactSha256));
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const delta=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],delta?.after??h,p);if(delta){assert.equal(delta.before,h,p);assert.notEqual(delta.before,delta.after,p);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','85212551fd8e86b22b2c0c0b3525100e9579f2f7:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v10.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v7.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 assert.deepEqual(current.normalHost,old.normalHost);assert.deepEqual(current.normativeBoundary,old.normativeBoundary);assert.deepEqual(current.allowedRuntimeKinds,old.allowedRuntimeKinds);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 const fix=current.sourceLeaseFix;for(const k of ['sourceExpiryExtended','signaturePolicyChanged','paymentPolicyChanged'])assert.equal(fix[k],false,k);
});

test('v12 admits only the bounded diagnostic observer and preserves all v11 source/guard history',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v12.json';assert.equal(sha(read(path)),'ed279c819aab1bc91b8cb15b3c1f974e9a42df5feaf038e4270e89a7b1d49bcd');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'829451dd2d930f5e9cdb094e1e90ce89f982560c');assert.equal(current.previousCompatibilityRecord.guardHead,'85212551fd8e86b22b2c0c0b3525100e9579f2f7');
 assert.deepEqual(current.changedFromV11,['src/bootcamp/ui-session.mjs','src/hackerrank-evidence/collector.mjs','src/hackerrank-evidence/managed-source.mjs','src/hackerrank-evidence/prepared-source.mjs','src/hackerrank-evidence/worker-source.mjs','tools/bootcamp/live-context.mjs','tools/bootcamp/normal-host-worker.mjs']);
 assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV11);assert.deepEqual(Object.keys(current.sourceAdditions),['src/hackerrank-evidence/diagnostics.mjs']);assert.equal(Object.keys(current.sourceArtifactSha256).length,160);
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','18bbb2455de6971558077b4ab9a77c27008b5ba4:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v11.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v8.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 assert.deepEqual(current.normalHost,old.normalHost);assert.deepEqual(current.normativeBoundary,old.normativeBoundary);assert.deepEqual(current.allowedRuntimeKinds,old.allowedRuntimeKinds);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 const d=current.sourceDiagnostics;assert.equal(d.maximumEvents,128);assert.equal(d.fixedStageAndCodeVocabulary,true);assert.equal(d.unobservedStagesRemainUnknown,true);
 for(const k of ['rawSecretsRecorded','observerFailureChangesOutcome','sourceExpiryExtended','signaturePolicyChanged','paymentPolicyChanged'])assert.equal(d[k],false,k);
});


test('v13 admits exactly the signature wait fix and preserves the complete v12 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v13.json';assert.equal(sha(read(path)),'611a62d521854c8bd89a4eb7584c6deae71a7346d7b62c2409580f622d9d7880');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'cad308fa7552fc73d08a63bdb575334fdf791e05');assert.equal(current.previousCompatibilityRecord.guardHead,'18bbb2455de6971558077b4ab9a77c27008b5ba4');
 assert.deepEqual(current.changedFromV12,["src/bootcamp/ui-session.mjs", "src/hackerrank-evidence/diagnostics.mjs", "tests/bootcamp-store/fixture.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV12);assert.deepEqual(current.sourceAdditions,{});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,160);assert.deepEqual(Object.keys(current.sourceArtifactSha256),Object.keys(old.sourceArtifactSha256));
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','d678464fec400b01767aaaf2cbc7130e805c27be:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v12.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v9.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V4.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ['normalHost','normativeBoundary','allowedRuntimeKinds','sourceDiagnostics'])assert.deepEqual(current[k],old[k],k);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.signatureWait,{"transientReadCode":"BC_VIEW_STALE","exactStoreRuleErrorRequired":true,"pendingRequired":true,"readFailurePropagates":true,"freshSubmissionRevalidationRequired":true,"originalDeadlineRetained":true,"pollIntervalMilliseconds":250,"maximumSignatureWaitSeconds":300,"deferredDiagnosticEventsPerApproval":1,"staleSnapshotAccepted":false,"globalStoreChecksChanged":false,"automaticWriteOrSignatureOrExternalRetry":false,"sourceExpiryExtended":false,"paymentPolicyChanged":false});
});


test('v14 admits exactly SDK diagnostics and preserves the complete v13 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v14.json';assert.equal(sha(read(path)),'7f558777c3550522db9880359054f387d38460f4d487bceb708d2bfb1b3411de');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'105b1a33fc37cacf24179aff08a96a510d952383');assert.equal(current.previousCompatibilityRecord.guardHead,'d678464fec400b01767aaaf2cbc7130e805c27be');
 assert.deepEqual(current.changedFromV13,["src/hackerrank-evidence/diagnostics.mjs", "src/hackerrank-evidence/worker-source.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV13);assert.deepEqual(current.sourceAdditions,{});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,160);assert.deepEqual(Object.keys(current.sourceArtifactSha256),Object.keys(old.sourceArtifactSha256));
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','4b0a1063cc442f331510c1a0ed9e65bbbd570daf:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v13.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v10.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V5.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ['normalHost','normativeBoundary','allowedRuntimeKinds','signatureWait'])assert.deepEqual(current[k],old[k],k);
 assert.deepEqual(current.sourceDiagnostics,{...old.sourceDiagnostics,schema:'clear-normal-source-diagnostics.2'});
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.sdkDiagnostics,{"sdkVersion":"5.1.4","knownModulePrefixes":2,"sdkFailureEnums":12,"unknownTypesRemainUnknown":true,"awaitRejectSeparateFromResolvedError":true,"returnValidationSeparate":true,"monotonicRelativeMilliseconds":true,"absoluteTimeRecorded":false,"invalidClockStickyIncomplete":true,"abortObservedWithoutReason":true,"supportedFirstStepObservations":5,"exactZkStartClaimed":false,"stepPayloadRecorded":false,"lateCallbacksSuppressed":true,"totalSdkAttempts":1,"timeoutExtended":false,"rawErrorPayloadRecorded":false,"optionalTransportLookupChangesOutcome":false});
});


test('v15 admits only owned transport boundaries and preserves the complete v14 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v15.json';assert.equal(sha(read(path)),'6b5c80282fba406a3097f81b568b400ef22636bdf481c5ae3d400176c3e06887');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'3e8aa5c1060278431c8eda8fb8f0328c35115658');assert.equal(current.previousCompatibilityRecord.guardHead,'4b0a1063cc442f331510c1a0ed9e65bbbd570daf');
 assert.deepEqual(current.changedFromV14,["src/hackerrank-evidence/diagnostics.mjs", "src/hackerrank-evidence/worker-source.mjs", "src/ybm-collector/client.mjs", "src/ybm-collector/socket.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV14);assert.deepEqual(current.sourceAdditions,{"src/ybm-collector/claim-rpc-observer.mjs": "c113d0b30b09ef169ce588122a63de2a884e5b37e27f543f8ea09f7eef340ec8"});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,161);assert.deepEqual(Object.keys(current.sourceArtifactSha256),[...Object.keys(old.sourceArtifactSha256),...Object.keys(current.sourceAdditions)].sort());
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','0b9091f299f7ab56a622a8b3db7a976c529f6eca:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v14.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v11.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V6.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ['normalHost','normativeBoundary','allowedRuntimeKinds','signatureWait','sdkDiagnostics'])assert.deepEqual(current[k],old[k],k);
 assert.deepEqual(current.sourceDiagnostics,{...old.sourceDiagnostics,schema:'clear-normal-source-diagnostics.3'});
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.transportDiagnostics,{"ownedBoundedSendFailureCodes":3,"messageMatchingUsed":false,"weakMapErrorProvenance":true,"synchronousSendThrowClearsTimer":true,"terminationThrowPreservesFailure":true,"claimRpcObserverSynchronous":true,"sameClientAndRouteIdentity":true,"rpcArgumentsOrResultsRecorded":false,"originalRpcOutcomePreserved":true,"subscriptionInstallationObserved":true,"lateObserverCallbacksSuppressed":true,"fixedErrorAndOwnCodeShapesOnly":true,"r6OriginalCauseConfirmed":false,"sdkOrEngineChanged":false,"limitsOrTimeoutsChanged":false,"totalSdkAttempts":1,"rawErrorPayloadRecorded":false});
});


test('v16 admits exact bounded sender policy and preserves the complete v15 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v16.json';assert.equal(sha(read(path)),'32e3d63af6d224f889c807866adb929056dff1bc16b4a2cf1190f8a2e049d36c');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'8765198716b74c37639b79dbb501e13689a90b0a');assert.equal(current.previousCompatibilityRecord.guardHead,'0b9091f299f7ab56a622a8b3db7a976c529f6eca');
 assert.deepEqual(current.changedFromV15,["src/hackerrank-evidence/diagnostics.mjs", "src/hackerrank-evidence/worker-source.mjs", "src/ybm-collector/claim-rpc-observer.mjs", "src/ybm-collector/client.mjs", "src/ybm-collector/socket.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV15);assert.deepEqual(current.sourceAdditions,{"src/ybm-collector/send-context.mjs": "0969eba332ea5fc25f505a8cde024cb2d45f8ba517fd5151b7063f65a72a122f"});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,162);assert.deepEqual(Object.keys(current.sourceArtifactSha256),[...Object.keys(old.sourceArtifactSha256),...Object.keys(current.sourceAdditions)].sort());
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','253f94ff1461e3521dd787395c71b40a4da214b6:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v15.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v12.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V7.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ['normalHost','normativeBoundary','allowedRuntimeKinds','signatureWait','sdkDiagnostics'])assert.deepEqual(current[k],old[k],k);
 assert.deepEqual(current.sourceDiagnostics,{...old.sourceDiagnostics,schema:'clear-normal-source-diagnostics.4'});
 assert.deepEqual(current.transportDiagnostics,{...old.transportDiagnostics,ownedBoundedSendFailureCodes:7,limitsOrTimeoutsChanged:true});
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.boundedSendPolicy,{"proofMessageBytes":104857600,"proofActiveAndWaitingBytes":138412032,"transportMessageAndRetainedBytes":2097152,"maximumActiveAndWaitingSends":64,"simultaneousSocketSends":1,"socketDrainPollMs":10,"proofTotalSendTimeoutMs":60000,"transportTotalSendTimeoutMs":10000,"rpcDeadlineCarriedFromInvocation":true,"expiredUnsentItemDiscardedAlone":true,"expiredReservationsSweptBeforeAdmission":true,"startedWriteTimeoutTerminatesSocket":true,"abortReachesRawSocket":true,"callbackAndPublicQueueDrainRequired":true,"wholeEncodedRpcMessage":true,"maxPayloadBasis":"PUBLISHED_SERVER_WS_DEFAULT_NOT_DEPLOYED_CONFIGURATION","deployedServerLimitConfirmed":false,"r7IndividualSizesKnown":false,"scalarTransportMeasurementsOnly":true,"otherRpcTerminalReasonPreserved":true,"automaticRetry":false,"messageSplitting":false,"sdkOrEngineChanged":false,"sourceExpiryExtended":false,"signaturePolicyChanged":false,"paymentPolicyChanged":false});
});


test('v17 admits only safe claim-return hints and preserves the complete v16 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v17.json';assert.equal(sha(read(path)),'24c2808e5521ceac304efa167d00167f35f1e425cd29850add4bd7db22ce5361');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'3e1508d3f181662023268fb62a7803e0a483f5c9');assert.equal(current.previousCompatibilityRecord.guardHead,'253f94ff1461e3521dd787395c71b40a4da214b6');
 assert.deepEqual(current.changedFromV16,["src/hackerrank-evidence/diagnostics.mjs", "src/hackerrank-evidence/worker-source.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV16);assert.deepEqual(current.sourceAdditions,{"src/hackerrank-evidence/claim-return-diagnostics.mjs": "2046246cf391c3d02eb7743cd3029d1a2281b98c41d5924506dd7fc74b424653"});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,163);assert.deepEqual(Object.keys(current.sourceArtifactSha256),[...Object.keys(old.sourceArtifactSha256),...Object.keys(current.sourceAdditions)].sort());
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','36c9aed6370623a915e8eff858d96078da09f26b:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v16.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v13.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V8.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ['normalHost','normativeBoundary','allowedRuntimeKinds','signatureWait','sdkDiagnostics','transportDiagnostics','boundedSendPolicy'])assert.deepEqual(current[k],old[k],k);
 assert.deepEqual(current.sourceDiagnostics,{...old.sourceDiagnostics,schema:'clear-normal-source-diagnostics.5'});
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.claimReturnDiagnostics,{"basis":"REMOTE_ERROR_HINT","reasonHints":["UNKNOWN","REQUEST_SIGNATURE","TIMESTAMP_WINDOW","TLS_HANDSHAKE","ZK_PROOF","TRANSCRIPT_PACKET","HTTP_PROVIDER_RECEIPT"],"presenceFields":["errorPresent","claimPresent","claimSignaturePresent","resultSignaturePresent"],"numericErrorCode":5,"maximumTransientMessageCharacters":2048,"fullAuditedPatternOnly":true,"controlCharactersRejected":true,"proxyOrAccessorInvocation":false,"rawMessageOrDataOrStackRecorded":false,"signatureBytesRead":false,"hintGrantsAuthority":false,"r8RootCauseConfirmed":false,"publishedServerCommit":"bc36dac3657fc46b79b4ecd545262c32440b05a6","deployedServerVersionConfirmed":false,"sdkOrEngineChanged":false,"sendPolicyChanged":false,"sourceExpiryExtended":false,"signaturePolicyChanged":false,"paymentPolicyChanged":false});
});


test('v18 adopts only exact crypto binding fix and preserves the complete v17 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v18.json';assert.equal(sha(read(path)),'12ddc5d166d8b3f090aa8e4211e4bd335938365e068757259df5244174c70b13');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'7d9db33924be50ae79f90385c3ac7f37b58d0a82');assert.equal(current.previousCompatibilityRecord.guardHead,'36c9aed6370623a915e8eff858d96078da09f26b');
 assert.deepEqual(current.changedFromV17,["src/hackerrank-evidence/package-lock.json", "src/hackerrank-evidence/package.json", "src/ybm-collector/package-lock.json", "src/ybm-collector/package.json"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV17);assert.deepEqual(current.sourceAdditions,{"docs/current/BOOTCAMP_ZK_EXECUTION_FINGERPRINTS_V1.json": "67f5f4ba9c38f19c0c568099fee1f9f15693a19d78a3c5ee4bcda6390aaf1579"});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,164);assert.deepEqual(Object.keys(current.sourceArtifactSha256),[...Object.keys(old.sourceArtifactSha256),...Object.keys(current.sourceAdditions)].sort());
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','03f8d157043fa1b1d004d5ef9d645a5767a26ffe:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v17.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v14.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V9.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ["normativeBoundary", "allowedRuntimeKinds", "normalHost", "signatureWait", "sdkDiagnostics", "transportDiagnostics", "boundedSendPolicy", "sourceDiagnostics", "claimReturnDiagnostics"])assert.deepEqual(current[k],old[k],k);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.zkCompatibility,{"sdk":"5.1.4","tls":"0.1.4","engine":"stwo","engineProto":2,"cryptoBefore":"5.1.6","cryptoAfter":"5.1.7","exactDirectDependencyBothPrefixes":true,"officialSecurityFix":"ec3974348444ad85adfe5e21c5152f69c7b93722","fingerprints":{"path":"docs/current/BOOTCAMP_ZK_EXECUTION_FINGERPRINTS_V1.json","sha256":"67f5f4ba9c38f19c0c568099fee1f9f15693a19d78a3c5ee4bcda6390aaf1579"},"sameVersionSyntheticPass":true,"crossVersionSyntheticRejected":true,"cipherAlgorithms":3,"tlsPacketConfigurations":6,"sdkAndTlsUnchanged":true,"deployedServerVersionConfirmed":false,"r9RootCauseConfirmed":false,"automaticFallback":false,"attempts":1,"zkProofConcurrency":1,"rawProofPersisted":false,"signaturePolicyChanged":false,"sendPolicyChanged":false,"sourceExpiryExtended":false,"paymentPolicyChanged":false});
 for(const prefix of ['hackerrank-evidence','ybm-collector']){
  const pkg=JSON.parse(read(`src/${prefix}/package.json`)),lock=JSON.parse(read(`src/${prefix}/package-lock.json`));
  assert.equal(pkg.dependencies['@reclaimprotocol/zk-symmetric-crypto'],'5.1.7');assert.equal(lock.packages['node_modules/@reclaimprotocol/zk-symmetric-crypto'].version,'5.1.7');
  assert.equal(pkg.dependencies['@reclaimprotocol/attestor-core'],'5.1.4');assert.equal(pkg.dependencies['@reclaimprotocol/tls'],'0.1.4');
 }
});


test('v19 admits only clock-boundary registration changes and preserves the complete v18 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v19.json';assert.equal(sha(read(path)),'51c1b01c643b6f11d05fbb6a85a89c66eb86a426db3cc4d947e1df7bb09e1d72');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'b2f11e62546e6bd3ab0a5458993918be6d3265c7');assert.equal(current.previousCompatibilityRecord.guardHead,'03f8d157043fa1b1d004d5ef9d645a5767a26ffe');
 assert.deepEqual(current.changedFromV18,["src/bootcamp/operations.mjs", "src/bootcamp/procedure.mjs", "tools/bootcamp/live-context.mjs", "tools/bootcamp/normal-chain.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV18);assert.deepEqual(current.sourceAdditions,{"tools/bootcamp/normal-current-view.mjs": "18e4db029d297d34c217e06782b9cf83311f90123fcdf00b1f55e01b083f4e25"});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,165);assert.deepEqual(Object.keys(current.sourceArtifactSha256),[...Object.keys(old.sourceArtifactSha256),...Object.keys(current.sourceAdditions)].sort());
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','1e923495380c81abf2eab13b21ec918ef2915495:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v18.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v15.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V10.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ["normativeBoundary", "allowedRuntimeKinds", "normalHost", "signatureWait", "sdkDiagnostics", "transportDiagnostics", "boundedSendPolicy", "sourceDiagnostics", "claimReturnDiagnostics", "zkCompatibility"])assert.deepEqual(current[k],old[k],k);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.registrationCurrentness,{"registrationOnly":true,"maximumAdditionalLocalAttempts":1,"clockForwardOnly":true,"unchangedRevisionAndLedgerRequired":true,"rolledBackBeforeRetry":true,"originalBodyAndIdempotencyKeyRetained":true,"freshAuthenticationAndPortObservations":true,"finalChecksRetained":true,"normalReadMaximumAdditionalAttempts":1,"exactTypedReadErrorRequired":true,"collectedDecisionTargetBound":true,"humanConsentAutomaticallyRetried":false,"sourceCollectionRetried":false,"aiRetried":false,"chainDispatchRetried":false,"sourceExpiryExtended":false,"oldViewAccepted":false,"sdkOrEngineChanged":false,"signaturePolicyChanged":false,"paymentPolicyChanged":false});
});


test('v20 admits only managed AI run binding and preserves the complete v19 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v20.json';assert.equal(sha(read(path)),'25a66433edefd19bbdb98e57a7699748440b347cec95b145a491385813c9ef77');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'f11d6a71aef3f1ef8f4483127ec22a9759303ec3');assert.equal(current.previousCompatibilityRecord.guardHead,'1e923495380c81abf2eab13b21ec918ef2915495');
 assert.deepEqual(current.changedFromV19,["src/bootcamp/moodle-live-consumer.mjs", "tests/ai-review-precheck/first-normal-reflection-entry.mjs", "tools/bootcamp/normal-host-config.mjs", "tools/bootcamp/normal-host-flow.mjs", "tools/bootcamp/normal-host-worker.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV19);assert.deepEqual(current.sourceAdditions,{"tools/bootcamp/normal-reflection-run.mjs": "e7ed93ee68943264056f9ff368be9a06ad3d2c31749b43a9c7b1dfdae6d24096"});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,166);assert.deepEqual(Object.keys(current.sourceArtifactSha256),[...Object.keys(old.sourceArtifactSha256),...Object.keys(current.sourceAdditions)].sort());
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','ffb999f5e1af802619c265908ab3b4fbeab72012:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v19.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v16.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V11.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ["normativeBoundary", "allowedRuntimeKinds", "normalHost", "signatureWait", "sdkDiagnostics", "transportDiagnostics", "boundedSendPolicy", "sourceDiagnostics", "claimReturnDiagnostics", "zkCompatibility", "registrationCurrentness"])assert.deepEqual(current[k],old[k],k);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.managedReflectionRun,{"managedHostRunIdRequired":true,"privateCapabilityRequired":true,"fixedHostJournalOnly":true,"exactRunApplicationWalletInputModelApprovalBinding":true,"oneBindingPerHost":true,"globalApplicationAndApprovalConsumption":true,"legacySpentApprovalRejected":true,"durableReservationBeforeDispatch":true,"partialFailureOrUnknownRemainsSpent":true,"finalRunGuardBeforeKeyRead":true,"liveFixtureAndStoreOverridesRejected":true,"maximumGenerationCalls":1,"countCalls":0,"automaticRetries":0,"fallbacks":0,"sourceExpiryExtended":false,"sdkOrEngineChanged":false,"paymentPolicyChanged":false});
});


test('v21 admits only consent read currentness and preserves the complete v20 generation',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v21.json';assert.equal(sha(read(path)),'2edf76879b3b45562b71a65b38fea8aa6b8ef9732c11ea616a0c8d6036f5565b');
 const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'990db37a3d7b27d19d4fe43fe0cb64a7d155f050');assert.equal(current.previousCompatibilityRecord.guardHead,'ffb999f5e1af802619c265908ab3b4fbeab72012');
 assert.deepEqual(current.changedFromV20,["tools/bootcamp/explicit-consents.mjs", "tools/bootcamp/normal-chain.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV20);assert.deepEqual(current.sourceAdditions,{});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,166);assert.deepEqual(Object.keys(current.sourceArtifactSha256),Object.keys(old.sourceArtifactSha256));
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){
  assert.equal(sha(execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root})),h,p);
  const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d){assert.equal(d.before,h);assert.notEqual(d.before,d.after);}
 }
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','1421c5ff2105694461f6d470d6b0127d4fd11ce2:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show',`${current.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);}
 for(const p of [current.previousCompatibilityRecord.path,'src/hackathon-test-vault/reviewed-source-v20.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v17.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V12.json'])assert.deepEqual(read(p),execFileSync('git',['show',`${current.previousCompatibilityRecord.guardHead}:${p}`],{cwd:root}),p);
 for(const k of ["normativeBoundary", "allowedRuntimeKinds", "normalHost", "signatureWait", "sdkDiagnostics", "transportDiagnostics", "boundedSendPolicy", "sourceDiagnostics", "claimReturnDiagnostics", "zkCompatibility", "registrationCurrentness", "managedReflectionRun"])assert.deepEqual(current[k],old[k],k);
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
 assert.deepEqual(current.consentReadCurrentness,{"stage":"AFTER_START_REVIEW_EXPLICIT_CONSENT_WAIT","exactStoreRuleErrorRequired":true,"failedViewDiscarded":true,"maximumFreshReadRetries":1,"initialCollectedTargetBound":true,"fixedReviewTargetRetained":true,"beforeAndAfterRefreshAuthorityChecks":true,"finalBothConsentsRechecked":true,"secondConflictPropagates":true,"chainRefreshRetried":false,"consentCommandRetried":false,"automaticHumanConsent":false,"paymentOperationRetried":false,"sourceExpiryExtended":false,"reviewDeadlineExtended":false,"sdkOrEngineChanged":false,"paymentPolicyChanged":false});
});


test('v22 pins exact human review coordination while preserving all previous generation bytes',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v22.json';assert.equal(sha(read(path)),'3072f09076cd07b1db2efbb4001ee2c5ee7d48fabb15649082abff5f8534ca97');const current=JSON.parse(read(path)),old=JSON.parse(read(current.previousCompatibilityRecord.path));
 assert.equal(current.currentSourceCandidateHead,'f0548e3f77d1c19c348713fef2a2b389ca291c67');assert.equal(current.previousCompatibilityRecord.guardHead,'1421c5ff2105694461f6d470d6b0127d4fd11ce2');
 assert.deepEqual(current.changedFromV21,["src/bootcamp/http.mjs", "src/bootcamp/normal-client.mjs", "src/bootcamp/procedure.mjs", "src/hackerrank-evidence/diagnostics.mjs", "tools/bootcamp/explicit-consents.mjs", "tools/bootcamp/frontend-server.mjs", "tools/bootcamp/live-context.mjs", "tools/bootcamp/normal-chain.mjs", "tools/bootcamp/normal-host-config.mjs", "tools/bootcamp/normal-host-flow.mjs", "tools/bootcamp/normal-host.mjs"]);assert.deepEqual(Object.keys(current.sourceDelta),current.changedFromV21);assert.deepEqual(current.sourceAdditions,{"tools/bootcamp/normal-reflection-approval.mjs": "435d9f1519f4be26d74c47f2a50bdc9219e9bfd454ec7aae37a0e20ba97aea77", "tools/bootcamp/normal-review-window.mjs": "9232bbe4b66ff96c05223e32e1e5eebfcf806f86ddbc6ceb37803bb4e447a70c", "tools/bootcamp/normal-source-sequence.mjs": "43e6a29dc3d00c60bd2f603a633d4787299059933ac7df2145089a040fe639df", "tools/bootcamp/test-client/review-window.js": "b8524af41e643a19b37493b6f46a23161ef68f9429134579743c3c6e9570fa06"});
 assert.equal(Object.keys(current.sourceArtifactSha256).length,170);
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','1421c5ff2105694461f6d470d6b0127d4fd11ce2:'+p],{cwd:root})),h,p);const d=current.sourceDelta[p];assert.equal(current.sourceArtifactSha256[p],d?.after??h,p);if(d)assert.equal(d.before,h);}
 for(const [p,h]of Object.entries(current.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','dd10cb27dda05c320530a15305f4b464d2361780:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show','f0548e3f77d1c19c348713fef2a2b389ca291c67:'+p],{cwd:root})),h,p);}
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v21.json','src/hackathon-test-vault/reviewed-source-v21.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v18.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V13.json'])assert.deepEqual(read(p),execFileSync('git',['show','1421c5ff2105694461f6d470d6b0127d4fd11ce2:'+p],{cwd:root}),p);
 for(const k of ["normativeBoundary", "allowedRuntimeKinds", "normalHost", "signatureWait", "sdkDiagnostics", "transportDiagnostics", "boundedSendPolicy", "sourceDiagnostics", "claimReturnDiagnostics", "zkCompatibility", "registrationCurrentness", "managedReflectionRun", "consentReadCurrentness"])assert.deepEqual(current[k],old[k],k);
 assert.deepEqual(current.reviewWindowCoordination,{"sequence":["STATIC_PREPARATION_AND_NATIVE_APPROVER_DESIGNATION","BOTH_AUTHENTICATED_READERS","HR_CURRENT_MET","BOTH_AUTHENTICATED_READERS","ORIGINAL_REFLECTION_PACKET","EXPLICIT_EXACT_AI_APPROVAL","ONE_APPROVED_MODEL_RESPONSE","ACTIVITY","ASSIGNMENT","CURRENT_FOUR_MET","E3","TWO_DIRECT_CURRENT_APP_CONSENTS"],"nativeCostApproverDesignationRequired":true,"defaultAuthorityConfigured":false,"roleAloneGrantsCostAuthority":false,"exactHostHeadWalletScopeRequired":true,"humanExplicitUiApprovalRequired":true,"approvalHttpDispatchesModel":false,"automaticConsentOrSignature":false,"readOnlyAutoRefresh":true,"originalSourceExpiryRetained":true,"recollectionOrStaleReissue":false,"maximumGenerationCalls":1,"countCalls":0,"automaticPaidRetries":0,"operatingBudgetsAreLatencyGuarantees":false,"operatingSeconds":{"beforeModel":185,"opening":155,"firstDisplay":150,"settlementReserve":30,"readersFresh":5},"newConsentGateAfterExactReplay":true,"sdkCryptoTransportWindowsChanged":false,"paymentPolicyChanged":false,"actualSourceDemoComplete":false});
 for(const k of ['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'])assert.equal(current[k],false,k);
});


test('v23 changes one reviewed runtime budget/display input and preserves v22 evidence',()=>{
 const p='specs/bootcamp/hackathon-test-memory-source-intake-v23.json';assert.equal(sha(read(p)),'a950980645917f3353759dd01065766e2859e29af928a434106b6566a524ca3c');const v=JSON.parse(read(p)),old=JSON.parse(read(v.previousCompatibilityRecord.path));
 assert.equal(v.currentSourceCandidateHead,'3374c383e585f26ea712911ac6be5b6ac44c0a56');assert.equal(v.previousCompatibilityRecord.guardHead,'dd10cb27dda05c320530a15305f4b464d2361780');assert.deepEqual(v.changedFromV22,["tools/bootcamp/test-client/review-window.js"]);assert.deepEqual(v.sourceAdditions,{});assert.equal(Object.keys(v.sourceArtifactSha256).length,170);
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','dd10cb27dda05c320530a15305f4b464d2361780:'+p],{cwd:root})),h,p);assert.equal(v.sourceArtifactSha256[p],v.sourceDelta[p]?.after??h,p);if(v.sourceDelta[p])assert.equal(v.sourceDelta[p].before,h);}
 for(const [p,h]of Object.entries(v.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','d0914a70ade684627ede88a3ed788403dd3437e5:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show','3374c383e585f26ea712911ac6be5b6ac44c0a56:'+p],{cwd:root})),h,p);}
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v22.json','src/hackathon-test-vault/reviewed-source-v22.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v19.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V14.json'])assert.deepEqual(read(p),execFileSync('git',['show','dd10cb27dda05c320530a15305f4b464d2361780:'+p],{cwd:root}),p);
 assert.deepEqual(v.reviewWindowCoordination,{"sequence":["STATIC_PREPARATION_AND_NATIVE_APPROVER_DESIGNATION","BOTH_AUTHENTICATED_READERS","HR_CURRENT_MET","BOTH_AUTHENTICATED_READERS","ORIGINAL_REFLECTION_PACKET","EXPLICIT_EXACT_AI_APPROVAL","ONE_APPROVED_MODEL_RESPONSE","ACTIVITY","ASSIGNMENT","CURRENT_FOUR_MET","E3","TWO_DIRECT_CURRENT_APP_CONSENTS"],"nativeCostApproverDesignationRequired":true,"defaultAuthorityConfigured":false,"roleAloneGrantsCostAuthority":false,"exactHostHeadWalletScopeRequired":true,"humanExplicitUiApprovalRequired":true,"approvalHttpDispatchesModel":false,"automaticConsentOrSignature":false,"readOnlyAutoRefresh":true,"originalSourceExpiryRetained":true,"recollectionOrStaleReissue":false,"maximumGenerationCalls":1,"countCalls":0,"automaticPaidRetries":0,"operatingBudgetsAreLatencyGuarantees":false,"operatingSeconds":{"beforeModel":145,"opening":115,"firstDisplay":110,"settlementReserve":30,"readersFresh":5},"newConsentGateAfterExactReplay":true,"sdkCryptoTransportWindowsChanged":false,"paymentPolicyChanged":false,"actualSourceDemoComplete":false,"minimumDisplayHumanReviewSeconds":80,"disabledActionReasonsDisplayed":true,"failedObservationDiscardsOldAiPacket":true});
});


test('v24 admits only the exact post-send recovery recheck and bounded diagnostics',()=>{
 const p='specs/bootcamp/hackathon-test-memory-source-intake-v24.json';assert.equal(sha(read(p)),'8ec4832c29f6717b32d47d1266798600994bc17190027b19be604ee6591512fc');const v=JSON.parse(read(p)),old=JSON.parse(read(v.previousCompatibilityRecord.path));
 assert.equal(v.currentSourceCandidateHead,'cce3b9382fcf3309534a8d5fa57d4ddfb8259505');assert.equal(v.previousCompatibilityRecord.guardHead,'d0914a70ade684627ede88a3ed788403dd3437e5');assert.deepEqual(v.changedFromV23,["src/bootcamp/execution-e4b-controller.mjs", "src/hackerrank-evidence/diagnostics.mjs", "tools/bootcamp/live-context.mjs"]);assert.deepEqual(v.sourceAdditions,{});assert.equal(Object.keys(v.sourceArtifactSha256).length,170);
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','d0914a70ade684627ede88a3ed788403dd3437e5:'+p],{cwd:root})),h,p);assert.equal(v.sourceArtifactSha256[p],v.sourceDelta[p]?.after??h,p);if(v.sourceDelta[p])assert.equal(v.sourceDelta[p].before,h);}
 for(const [p,h]of Object.entries(v.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb:'+p],{cwd:root})),h,p);assert.equal(sha(execFileSync('git',['show','cce3b9382fcf3309534a8d5fa57d4ddfb8259505:'+p],{cwd:root})),h,p);}
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v23.json','src/hackathon-test-vault/reviewed-source-v23.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v20.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V15.json'])assert.deepEqual(read(p),execFileSync('git',['show','d0914a70ade684627ede88a3ed788403dd3437e5:'+p],{cwd:root}),p);
 assert.deepEqual(v.reviewWindowCoordination,old.reviewWindowCoordination);assert.deepEqual(v.postSendRecoveryClockCurrentness,{"exactStoreRuleError":"BC_E5_CLOCK_CHANGED","onlyPhases":["RECOVER","RECOVER_FINAL_SYNC"],"kind":"current","maximumFreshAuthorityRechecks":1,"alreadyIssuedUnreturnedWitnessRequired":true,"sameWitnessAndPayloadRetained":true,"originalBindingAndCapsRetained":true,"beforeAndAfterAuthorityChecksRetained":true,"issuerOrKeyWorkRepeated":false,"sealDispatchTransactionSigningOrPaymentSigningRepeated":false,"secondConflictPropagates":true,"untypedErrorRetried":false,"expiredOrRevokedAuthorityAllowed":false,"sourceExpiryExtended":false,"paymentPolicyChanged":false,"maximumPersistedFailureDiagnosticEnums":8,"sdkCryptoTransportChanged":false,"actualR15UnderlyingExceptionProven":false});
});


test('v25 admits only bounded diagnostics while preserving all payment and recovery policy',()=>{
 const p='specs/bootcamp/hackathon-test-memory-source-intake-v25.json';assert.equal(sha(read(p)),'8c4b1dcca74ca3a350a08268d705e0c8332e849bfbb014c997a926d192398a16');const v=JSON.parse(read(p)),old=JSON.parse(read(v.previousCompatibilityRecord.path));
 assert.equal(v.currentSourceCandidateHead,'c48ec5b08e821ffaa08034c8dafe56c2b214df60');assert.equal(v.previousCompatibilityRecord.guardHead,'c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb');assert.deepEqual(v.changedFromV24,["src/bootcamp/execution-api-bridge.mjs", "src/bootcamp/execution-development.mjs", "src/bootcamp/execution-e4b-ports.mjs", "src/hackathon-test-vault/e5/envelope-service.mjs", "src/hackathon-test-vault/e5b/bridge.mjs", "src/hackathon-test-vault/e5b/service.mjs", "tools/bootcamp/live-context.mjs", "tools/bootcamp/normal-chain.mjs"]);assert.deepEqual(v.sourceAdditions,{"src/bootcamp/execution-diagnostics.mjs": "a5e27acd0ff8e87bdd3e93b2d4251b29ec1e8a14736ad88f74f00e46bb09d311"});assert.equal(Object.keys(v.sourceArtifactSha256).length,171);
 for(const [p,h]of Object.entries(old.sourceArtifactSha256)){assert.equal(sha(execFileSync('git',['show','c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb:'+p],{cwd:root})),h,p);assert.equal(v.sourceArtifactSha256[p],v.sourceDelta[p]?.after??h,p);if(v.sourceDelta[p])assert.equal(v.sourceDelta[p].before,h);}
 for(const [p,h]of Object.entries(v.sourceArtifactSha256)){assert.equal(sha(read(p)),h,p);assert.equal(sha(execFileSync('git',['show','c48ec5b08e821ffaa08034c8dafe56c2b214df60:'+p],{cwd:root})),h,p);}
 for(const p of ['specs/bootcamp/hackathon-test-memory-source-intake-v24.json','src/hackathon-test-vault/reviewed-source-v24.mjs','docs/hackathon-test-vault/e5b/normal-source-pins-v21.json','docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V16.json'])assert.deepEqual(read(p),execFileSync('git',['show','c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb:'+p],{cwd:root}),p);
 assert.deepEqual(v.reviewWindowCoordination,old.reviewWindowCoordination);assert.deepEqual(v.postSendRecoveryClockCurrentness,old.postSendRecoveryClockCurrentness);assert.deepEqual(v.normalPaymentFailureDiagnostics,{"callbackOnlyDiagnosticGapConfirmed":true,"apiTransactionAndNativeSanitizerAndNormalStepCovered":true,"maximumFirstFailureEvents":16,"maximumSafeCauses":3,"fixedCodeAndPhaseAllowlist":true,"arbitraryMessagesStacksRequestsAndSecretsRecorded":false,"observerFailureMasksOriginal":false,"existingNativeSanitizationRetained":true,"nativeReadbackBeforeUnknownRecorded":true,"broadcastFailureOutcome":"UNKNOWN","sendAndSigningCountersAndAggregateEnvelopeStatesOnly":true,"v24RecoveryRecheckChanged":false,"sourceExpiryFreshnessCasCapsChanged":false,"transactionSignatureSealDispatchOrAiRetried":false,"twoConsent100TestDuplicateAndDepositPolicyChanged":false,"actualR15R17R18UnderlyingExceptionProven":false,"sdkCryptoTransportChanged":false});
});
