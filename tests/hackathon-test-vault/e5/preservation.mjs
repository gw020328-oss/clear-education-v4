import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const intake=JSON.parse(readFileSync(new URL('specs/bootcamp/hackathon-test-e5-development-intake-v1.json',root)));
const digest=p=>createHash('sha256').update(readFileSync(new URL(p,root))).digest('hex');
// B explicitly consumes root-reviewed memory compatibility v3. The original
// intake and eight other E4 artifacts remain frozen; this is no wildcard waiver.
const consumer='src/hackathon-test-vault/memory-stage-harness.mjs';
const compatibility='specs/bootcamp/hackathon-test-memory-source-intake-v3.json';
const consumerV3='32a79032f53c81fbf2bf015b6647d969993ba69cdec4b9ecd625d629cd8047a2';
assert.equal(digest(compatibility),'df577fa3e54bad4502ac14e2237831134c6d3534fbe790031410dcdaedac2542');
assert.equal(intake.e4.artifactSha256AtAcceptedHead[consumer],'b053742d1d3f0e8e9a751ac9c440146e5763157a1d8773f6b587334f61252fb9');
for(const [path,expected]of Object.entries(intake.e4.artifactSha256AtAcceptedHead))assert.equal(digest(path),path===consumer?consumerV3:expected,path);
const service=JSON.parse(readFileSync(new URL('specs/bootcamp/hackathon-test-e5-service-intake-v1.json',root)));
const preserved=Object.entries(service.sourceArtifacts).filter(([path])=>path!=='tests/hackathon-test-vault/e5/preservation.mjs');
for(const [path,expected]of preserved)assert.equal(digest(path),expected,path);
assert.equal(digest(intake.frozenInputs.memoryBoundary),intake.frozenInputs.memoryBoundarySha256);
console.log(JSON.stringify({frozenE4Files:8,explicitV3MemoryConsumer:consumerV3,frozenE5Artifacts:preserved.length,explicitPreservationTestUpdate:true,memoryBoundaryV1:'UNCHANGED'}));
