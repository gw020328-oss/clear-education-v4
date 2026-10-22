import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {consumeReviewedV11Sources} from '../../../src/hackathon-test-vault/reviewed-source-v11.mjs';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root));
const digest=p=>createHash('sha256').update(read(p)).digest('hex');
const pins=JSON.parse(read('docs/hackathon-test-vault/e5b/source-pins-v2.json'));
assert.equal(pins.version,'clear-e5b-component-source-pins.2');
assert.equal(pins.actualApiConnected,false);assert.equal(pins.fullE5Accepted,false);
// Original PR100 pins remain historical evidence; only these exact normal-path changes are admitted.
const normal=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins.json'));
const next=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v2.json'));
const ci=JSON.parse(read('docs/hackathon-test-vault/e5b/ci-source-pins.json'));
const v6Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v3.json'));
const v7Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v4.json'));
const v8Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v5.json'));
const v9Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v6.json'));
const v11Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v8.json'));
assert.equal(v11Pins.version,'clear-e5-normal-path-source-pins.8');assert.equal(v11Pins.scope,'EXACT_V11_SOURCE_LEASE_TRANSACTION_AND_ADDRESS_FIX');
assert.equal(v11Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v7.json');assert.equal(digest(v11Pins.previousRecord.path),v11Pins.previousRecord.sha256);
assert.equal(digest(v11Pins.reviewedIntake.path),v11Pins.reviewedIntake.sha256);
const v10Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v7.json'));
assert.deepEqual(Object.keys(v11Pins.changes).sort(),Object.keys(v10Pins.changes).sort());for(const [p,d]of Object.entries(v11Pins.changes)){assert.equal(d.before,v10Pins.changes[p].after,p);assert.equal(digest(p),d.after,p);}
assert.deepEqual(Object.keys(v11Pins.additions),['src/hackathon-test-vault/reviewed-source-v11.mjs']);for(const [p,h]of Object.entries(v11Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v10Pins.version,'clear-e5-normal-path-source-pins.7');assert.equal(v10Pins.scope,'EXACT_NORMAL_HOST_PREPARATION_AND_SESSION_BOOTSTRAP_V10');
assert.equal(v10Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v6.json');assert.equal(digest(v10Pins.previousRecord.path),v10Pins.previousRecord.sha256);
assert.equal(digest(v10Pins.reviewedIntake.path),v10Pins.reviewedIntake.sha256);
assert.deepEqual(Object.keys(v10Pins.changes).sort(),Object.keys(v9Pins.changes).sort());
for(const [p,d]of Object.entries(v10Pins.changes)){assert.equal(d.before,v9Pins.changes[p].after,p);assert.equal(digest(p),v11Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v10Pins.additions),['src/hackathon-test-vault/reviewed-source-v10.mjs']);for(const [p,h]of Object.entries(v10Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v9Pins.version,'clear-e5-normal-path-source-pins.6');
assert.equal(v9Pins.scope,'EXACT_C3_V9_OWNED_CANONICAL_REFRESH_NO_WINDOW_EXTENSION');
assert.equal(v9Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v5.json');
assert.equal(digest(v9Pins.previousRecord.path),v9Pins.previousRecord.sha256);
assert.equal(v9Pins.reviewedIntake.sha256,'19261eca5c089bf8ae68626bfdfff87b935bb7c4b0a9c783bb52709c9a2870fc');
assert.equal(digest(v9Pins.reviewedIntake.path),v9Pins.reviewedIntake.sha256);
assert.deepEqual(Object.keys(v9Pins.changes).sort(),Object.keys(v8Pins.changes).sort());
for(const [p,d]of Object.entries(v9Pins.changes)){assert.equal(d.before,v8Pins.changes[p].after,p);assert.equal(digest(p),v11Pins.changes[p]?.after??v10Pins.changes[p]?.after??v9Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v9Pins.additions),['src/hackathon-test-vault/reviewed-source-v9.mjs']);
for(const [p,h]of Object.entries(v9Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v8Pins.version,'clear-e5-normal-path-source-pins.5');
assert.equal(v8Pins.scope,'EXACT_READONLY_C3_V8_RECEIPT_AND_BROWSER_CONNECTION');
assert.equal(v8Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v4.json');
assert.equal(digest(v8Pins.previousRecord.path),v8Pins.previousRecord.sha256);
assert.equal(v8Pins.reviewedIntake.sha256,'ca37fb5574a293ac6873d4d22e136fcc2f214f58a60b0a8d7f46e09dd786ed33');
assert.equal(digest(v8Pins.reviewedIntake.path),v8Pins.reviewedIntake.sha256);
assert.deepEqual(Object.keys(v8Pins.changes).sort(),Object.keys(v7Pins.changes).sort());
for(const [p,d]of Object.entries(v8Pins.changes)){assert.equal(d.before,v7Pins.changes[p].after,p);assert.equal(digest(p),v11Pins.changes[p]?.after??v10Pins.changes[p]?.after??v9Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v8Pins.additions),['src/hackathon-test-vault/reviewed-source-v8.mjs']);
for(const [p,h]of Object.entries(v8Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v7Pins.version,'clear-e5-normal-path-source-pins.4');
assert.equal(v7Pins.scope,'EXACT_REVIEWED_V7_HR_WORKER_EXTERNAL_UI_AND_EXPLICIT_CONSENTS');
assert.equal(v7Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v3.json');
assert.equal(digest(v7Pins.previousRecord.path),v7Pins.previousRecord.sha256);
assert.equal(v7Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v7.json');
assert.equal(v7Pins.reviewedIntake.sha256,'4b82c1356b95e284d52e166928dc70823548e4ee1e1bb6785c221398c5740107');
assert.equal(digest(v7Pins.reviewedIntake.path),v7Pins.reviewedIntake.sha256);
assert.deepEqual(Object.keys(v7Pins.changes).sort(),Object.keys(v6Pins.changes).sort());
for(const [path,{before,after}]of Object.entries(v7Pins.changes)){assert.equal(before,v6Pins.changes[path].after,path);assert.equal(digest(path),v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??after,path);}
assert.deepEqual(Object.keys(v7Pins.additions),['src/hackathon-test-vault/reviewed-source-v7.mjs']);
for(const [path,h]of Object.entries(v7Pins.additions))assert.equal(digest(path),h,path);
assert.equal(v6Pins.version,'clear-e5-normal-path-source-pins.3');
assert.equal(v6Pins.scope,'EXACT_REVIEWED_V6_THREE_FILE_REFLECTION_PREPARATION_COMPATIBILITY_ONLY');
assert.equal(v6Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/ci-source-pins.json');
assert.equal(digest(v6Pins.previousRecord.path),v6Pins.previousRecord.sha256);
assert.equal(v6Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v6.json');
assert.equal(v6Pins.reviewedIntake.sha256,'247326385d1514c57383553a9f7290a3a59f9ba1182f91600443f35027d32f22');
assert.equal(digest(v6Pins.reviewedIntake.path),v6Pins.reviewedIntake.sha256);
assert.deepEqual(Object.keys(v6Pins.changes).sort(),['src/hackathon-test-vault/memory-stage-harness.mjs','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].sort());
for(const [path,{before,after}]of Object.entries(v6Pins.changes)){
 assert.equal(before,ci.changes[path]?.after??next.changes[path]?.after,path);assert.equal(digest(path),v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??after,path);
}
assert.equal(ci.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v2.json');
assert.equal(digest(ci.previousRecord.path),ci.previousRecord.sha256);
assert.deepEqual(Object.keys(ci.changes).sort(),['.github/workflows/hackathon-e5.yml','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].sort());
assert.equal(next.baseHead,'8851775fa4f34e1af0a858436cf3dea648eda9af');
assert.equal(digest(next.previousRecord.path),next.previousRecord.sha256);
assert.equal(next.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins.json');
assert.deepEqual(Object.keys(next.changes).sort(),['src/hackathon-test-vault/memory-stage-harness.mjs','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].sort());
for(const [path,{before,after}]of Object.entries(next.changes)){assert.equal(before,normal.changes[path].after,path);assert.equal(digest(path),v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??v6Pins.changes[path]?.after??ci.changes[path]?.after??after,path);}
assert.equal(normal.baseHead,'a4a05c7aa6a1614760273e78edb5ba6ccb556232');
assert.deepEqual(Object.keys(normal.changes).sort(),['src/hackathon-test-vault/memory-stage-harness.mjs','src/hackathon-test-vault/e5/environment.mjs','src/hackathon-test-vault/e5/reader.mjs','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].sort());
assert.deepEqual(Object.keys(normal.additions),['src/hackathon-test-vault/normal-source-compatibility.mjs']);
for(const [path,expected]of Object.entries(normal.additions))assert.equal(digest(path),expected,path);
const service=JSON.parse(read('specs/bootcamp/hackathon-test-e5-service-intake-v1.json'));
for(const [path,{before,after}]of Object.entries(ci.changes)){assert.equal(before,next.changes[path]?.after??service.sourceArtifacts[path],path);assert.equal(digest(path),v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??v6Pins.changes[path]?.after??after,path);}
for(const [path,{before,after}]of Object.entries(normal.changes)){assert.equal(before,pins.sourceArtifactSha256[path]??service.sourceArtifacts[path],path);assert.equal(digest(path),v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??v6Pins.changes[path]?.after??ci.changes[path]?.after??next.changes[path]?.after??after,path);}
for(const [path,expected]of Object.entries(pins.sourceArtifactSha256))assert.equal(digest(path),v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??v6Pins.changes[path]?.after??ci.changes[path]?.after??next.changes[path]?.after??normal.changes[path]?.after??expected,path);
for(const [path,expected]of Object.entries(pins.immutableInputs))assert.equal(digest(path),expected,path);
const v4=JSON.parse(read('specs/bootcamp/hackathon-test-memory-source-intake-v4.json'));
assert.equal(v4.currentSourceCandidateHead,'4dec3bd94ad786d2f1b52d00b5bfa1eab8f82ec0');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v5.json'),'7b89a6c9f73797f0a6faff890f8a097f18dd3f91730eddc7f2cc56730c0f17ff');
const v5=JSON.parse(read('specs/bootcamp/hackathon-test-memory-source-intake-v5.json'));
assert.equal(v5.currentSourceCandidateHead,'937f982622643f0759d3ac1da2a42cdac93841b7');
assert.deepEqual([Object.keys(v5.e3ArtifactSha256).length,Object.keys(v5.additionalSourceArtifactSha256).length,Object.keys(v5.producerSeamArtifactSha256).length,Object.keys(v5.normalEntryArtifactSha256).length],[8,19,6,3]);
const current={...v5.e3ArtifactSha256,...v5.additionalSourceArtifactSha256,...v5.producerSeamArtifactSha256,...v5.normalEntryArtifactSha256};assert.equal(Object.keys(current).length,36);
for(const [path,expected]of Object.entries(current))assert.equal(createHash('sha256').update(execFileSync('git',['show',`${v5.currentSourceCandidateHead}:${path}`],{cwd:root})).digest('hex'),expected,path);
const v6=JSON.parse(read(v6Pins.reviewedIntake.path));
assert.equal(v6.currentSourceCandidateHead,'92387a49a7808af0f7b240021aafcd01edc17253');
const changed=['src/bootcamp/store.mjs','src/bootcamp/moodle-live-consumer.mjs','tools/bootcamp/live-context.mjs'];
assert.deepEqual(v6.changedFromV5,changed);assert.deepEqual(Object.keys(v6.sourceDelta).sort(),[...changed].sort());
for(const table of ['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256']){
 assert.deepEqual(Object.keys(v6[table]).sort(),Object.keys(v5[table]).sort());
 for(const [path,expected]of Object.entries(v6[table])){
  const delta=v6.sourceDelta[path];if(delta){assert.equal(delta.before,v5[table][path]);assert.equal(delta.after,expected);assert.notEqual(delta.before,delta.after);}else assert.equal(expected,v5[table][path]);
  assert.equal(createHash('sha256').update(execFileSync('git',['show',`${v6.currentSourceCandidateHead}:${path}`],{cwd:root})).digest('hex'),expected,path);
 }
}
const v11=consumeReviewedV11Sources(v6);assert.equal(Object.keys(v11.sources).length,159);
stripTypeScriptTypes(read('src/hackathon-test-vault/e5b/bridge.d.mts').toString());
console.log(JSON.stringify({componentArtifacts:Object.keys(pins.sourceArtifactSha256).length,immutableInputs:Object.keys(pins.immutableInputs).length,preservedV5Sources:36,preservedV6Sources:36,preservedV7Sources:134,preservedV8Sources:135,preservedV9Sources:135,preservedV10Sources:159,reviewedV11Sources:159,reviewedV7TransitiveSources:85,reviewedV7Assets:13,explicitV6SourceDeltas:3,declarationSyntax:'PASS_NOT_FULL_TSC',actualApiConnected:false}));
