import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
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
assert.equal(normal.baseHead,'a4a05c7aa6a1614760273e78edb5ba6ccb556232');
assert.deepEqual(Object.keys(normal.changes).sort(),['src/hackathon-test-vault/memory-stage-harness.mjs','src/hackathon-test-vault/e5/environment.mjs','src/hackathon-test-vault/e5/reader.mjs','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].sort());
assert.deepEqual(Object.keys(normal.additions),['src/hackathon-test-vault/normal-source-compatibility.mjs']);
for(const [path,expected]of Object.entries(normal.additions))assert.equal(digest(path),expected,path);
const service=JSON.parse(read('specs/bootcamp/hackathon-test-e5-service-intake-v1.json'));
for(const [path,{before,after}]of Object.entries(normal.changes)){assert.equal(before,pins.sourceArtifactSha256[path]??service.sourceArtifacts[path],path);assert.equal(digest(path),after,path);}
for(const [path,expected]of Object.entries(pins.sourceArtifactSha256))assert.equal(digest(path),normal.changes[path]?.after??expected,path);
for(const [path,expected]of Object.entries(pins.immutableInputs))assert.equal(digest(path),expected,path);
const v4=JSON.parse(read('specs/bootcamp/hackathon-test-memory-source-intake-v4.json'));
assert.equal(v4.currentSourceCandidateHead,'4dec3bd94ad786d2f1b52d00b5bfa1eab8f82ec0');
const current={...v4.e3ArtifactSha256,...v4.additionalSourceArtifactSha256};assert.equal(Object.keys(current).length,17);
for(const [path,expected]of Object.entries(current))assert.equal(digest(path),expected,path);
stripTypeScriptTypes(read('src/hackathon-test-vault/e5b/bridge.d.mts').toString());
console.log(JSON.stringify({componentArtifacts:Object.keys(pins.sourceArtifactSha256).length,immutableInputs:Object.keys(pins.immutableInputs).length,reviewedV4Sources:17,declarationSyntax:'PASS_NOT_FULL_TSC',actualApiConnected:false}));
