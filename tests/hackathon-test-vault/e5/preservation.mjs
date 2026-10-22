import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const intake=JSON.parse(readFileSync(new URL('specs/bootcamp/hackathon-test-e5-development-intake-v1.json',root)));
const digest=p=>createHash('sha256').update(readFileSync(new URL(p,root))).digest('hex');
// B explicitly consumes exact owner-reviewed memory compatibility v9. The exact normal-source intake additionally permits the E2 label delta. The original
// intake and eight other E4 artifacts remain frozen; this is no wildcard waiver.
const consumer='src/hackathon-test-vault/memory-stage-harness.mjs';
const compatibility='specs/bootcamp/hackathon-test-memory-source-intake-v4.json';
const consumerV9='dc60cc5d30cd3e101e7f2c6b43ab4ce7fb694324deae25c92d3147cc3c19ca5c';
assert.equal(digest(compatibility),'2cf7aba578d1ac5ed712a00288edcdff88d58e2152acdfd709c1228078f078a6');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v5.json'),'7b89a6c9f73797f0a6faff890f8a097f18dd3f91730eddc7f2cc56730c0f17ff');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v9.json'),'19261eca5c089bf8ae68626bfdfff87b935bb7c4b0a9c783bb52709c9a2870fc');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v8.json'),'ca37fb5574a293ac6873d4d22e136fcc2f214f58a60b0a8d7f46e09dd786ed33');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v7.json'),'4b82c1356b95e284d52e166928dc70823548e4ee1e1bb6785c221398c5740107');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v6.json'),'247326385d1514c57383553a9f7290a3a59f9ba1182f91600443f35027d32f22');
assert.equal(digest('specs/bootcamp/hackathon-test-normal-source-intake-v1.json'),'410ec5bab91a365cee6909328b0c1a2f847283738b27f66aaf911e2300f47dc9');
assert.equal(intake.e4.artifactSha256AtAcceptedHead[consumer],'b053742d1d3f0e8e9a751ac9c440146e5763157a1d8773f6b587334f61252fb9');
for(const [path,expected]of Object.entries(intake.e4.artifactSha256AtAcceptedHead))assert.equal(digest(path),path===consumer?consumerV9:expected,path);
const service=JSON.parse(readFileSync(new URL('specs/bootcamp/hackathon-test-e5-service-intake-v1.json',root)));
const preserved=Object.entries(service.sourceArtifacts).filter(([path])=>path!=='tests/hackathon-test-vault/e5/preservation.mjs');
// Explicit normal-path fixes requested by the API owner; original intake remains unchanged.
const normalPathChanges=[
  [
    "src/hackathon-test-vault/e5/environment.mjs",
    "a38dc46a8d0c9afd91b68d295c1d4aaaa3a5815ba8fe70338a9fa68e4fb3666e",
    "eb434625f9c4ec54965c9fb1f55db66d37bdf37c85d44d50f704908d5ecc1d26"
  ],
  [
    "src/hackathon-test-vault/e5/reader.mjs",
    "34f0b529dd459881bc82032efb9d7c3eaec6818928c4f23d2e046f649f3eddfd",
    "af6c782cd4722e4b3a8c3b32070ff022ef09bd46ef2302956ca451f31ef3b56d"
  ]
];
const ciChanges=[['.github/workflows/hackathon-e5.yml','fee28eb517ba2e96495d39f2aade786bf98289c89fab7a8fa20768791dd7a959','8b24df4c694b623be5ebc5ab61a02610ad02c1e85ac53839638ac02d78aeb29a']];
for(const [path,before,after]of ciChanges){assert.equal(service.sourceArtifacts[path],before,path);assert.equal(digest(path),after,path);}
for(const [path,before,after]of normalPathChanges){assert.equal(service.sourceArtifacts[path],before,path);assert.equal(digest(path),after,path);}
for(const [path,expected]of preserved)assert.equal(digest(path),[...normalPathChanges,...ciChanges].find(([p])=>p===path)?.[2]??expected,path);
assert.equal(digest(intake.frozenInputs.memoryBoundary),intake.frozenInputs.memoryBoundarySha256);
console.log(JSON.stringify({frozenE4Files:8,explicitV9MemoryConsumer:consumerV9,frozenE5Artifacts:preserved.length-normalPathChanges.length-ciChanges.length,explicitNormalPathChanges:normalPathChanges.length,explicitCiDependencyChanges:ciChanges.length,explicitPreservationTestUpdate:true,memoryBoundaryV1:'UNCHANGED'}));
