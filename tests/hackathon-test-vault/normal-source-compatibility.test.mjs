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
 assert.equal(sha(read(v6.reflectionPreparation.testPath)),v6.reflectionPreparation.testSha256);
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
 assert.equal(sha(read(path)),'10dc1d3a050157b43a655eaa32d022855726d42bbcf4fa1ffc0bb83021c307f5');
 const v7=JSON.parse(read(path)),v6=JSON.parse(read(v7.previousCompatibilityRecord.path));
 assert.equal(v7.currentSourceCandidateHead,'ef5d7e000407a54b469bfab70c00fd878b17e29a');
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
  assert.equal(sha(read(p)),h,p);
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
  assert.equal(sha(execFileSync('git',['show',`${v7.baseHead}:${p}`],{cwd:root})),delta.before,p);assert.equal(sha(read(p)),delta.after,p);
 }
 for(const [p,h]of Object.entries(v7.additions))assert.equal(sha(read(p)),h,p);
 assert.equal(v7.priorAcceptanceBytesChanged,false);assert.equal(v7.actualSourceAccepted,false);
});
