import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const intake=JSON.parse(readFileSync(new URL('specs/bootcamp/hackathon-test-e5-development-intake-v1.json',root)));
const digest=p=>createHash('sha256').update(readFileSync(new URL(p,root))).digest('hex');
// B explicitly consumes exact owner-reviewed memory compatibility v34. The exact normal-source intake additionally permits the E2 label delta. The original
// intake and eight other E4 artifacts remain frozen; this is no wildcard waiver.
const consumer='src/hackathon-test-vault/memory-stage-harness.mjs';
const compatibility='specs/bootcamp/hackathon-test-memory-source-intake-v4.json';
const consumerV34='d54762ece22616686d83d6931e0f295a8e9be40552fdac29d94b61c5df5c2356'; // V34 consumes preserved prior records and the exact preflight/lookup validation delta.
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v30.json'),'cc5e9b3339e3cafac3db828abe23463f680b9719c0dc431503d452635dbe8f69');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v29.json'),'db613940a142d37d1f52f82d979a66e48f9dfa951d60bda5d8661198ac96dcd5');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v28.json'),'a0cde4221afa098bd4405fe4a65af94b3ebc91543179360ba2cb951303bb4561');
assert.equal(digest(compatibility),'2cf7aba578d1ac5ed712a00288edcdff88d58e2152acdfd709c1228078f078a6');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v5.json'),'7b89a6c9f73797f0a6faff890f8a097f18dd3f91730eddc7f2cc56730c0f17ff');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v27.json'),'309b79a1a8c1c490f602c9cc1e7daa4bf387efed942f87dc40271436506302f9');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v26.json'),'f6bcbc3700bd6b7d8172da5afeb3786e3343a465c810df11f59d9ce3b700deb8');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v25.json'),'8c4b1dcca74ca3a350a08268d705e0c8332e849bfbb014c997a926d192398a16');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v24.json'),'8ec4832c29f6717b32d47d1266798600994bc17190027b19be604ee6591512fc');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v23.json'),'a950980645917f3353759dd01065766e2859e29af928a434106b6566a524ca3c');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v22.json'),'3072f09076cd07b1db2efbb4001ee2c5ee7d48fabb15649082abff5f8534ca97');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v21.json'),'2edf76879b3b45562b71a65b38fea8aa6b8ef9732c11ea616a0c8d6036f5565b');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v20.json'),'25a66433edefd19bbdb98e57a7699748440b347cec95b145a491385813c9ef77');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v19.json'),'51c1b01c643b6f11d05fbb6a85a89c66eb86a426db3cc4d947e1df7bb09e1d72');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v18.json'),'12ddc5d166d8b3f090aa8e4211e4bd335938365e068757259df5244174c70b13');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v17.json'),'24c2808e5521ceac304efa167d00167f35f1e425cd29850add4bd7db22ce5361');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v16.json'),'32e3d63af6d224f889c807866adb929056dff1bc16b4a2cf1190f8a2e049d36c');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v15.json'),'6b5c80282fba406a3097f81b568b400ef22636bdf481c5ae3d400176c3e06887');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v14.json'),'7f558777c3550522db9880359054f387d38460f4d487bceb708d2bfb1b3411de');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v13.json'),'611a62d521854c8bd89a4eb7584c6deae71a7346d7b62c2409580f622d9d7880');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v12.json'),'ed279c819aab1bc91b8cb15b3c1f974e9a42df5feaf038e4270e89a7b1d49bcd');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v11.json'),'55c2986611b5ed0b3df69cc2e5294e3932715a847649ca5adc36f4f52146b65d');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v10.json'),'823761592e8178e682ad2f2c39dd6d95423dcbcebad9ffdd15bb2ccfb4424ba8');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v9.json'),'19261eca5c089bf8ae68626bfdfff87b935bb7c4b0a9c783bb52709c9a2870fc');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v8.json'),'ca37fb5574a293ac6873d4d22e136fcc2f214f58a60b0a8d7f46e09dd786ed33');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v7.json'),'4b82c1356b95e284d52e166928dc70823548e4ee1e1bb6785c221398c5740107');
assert.equal(digest('specs/bootcamp/hackathon-test-memory-source-intake-v6.json'),'247326385d1514c57383553a9f7290a3a59f9ba1182f91600443f35027d32f22');
assert.equal(digest('specs/bootcamp/hackathon-test-normal-source-intake-v1.json'),'410ec5bab91a365cee6909328b0c1a2f847283738b27f66aaf911e2300f47dc9');
assert.equal(intake.e4.artifactSha256AtAcceptedHead[consumer],'b053742d1d3f0e8e9a751ac9c440146e5763157a1d8773f6b587334f61252fb9');
for(const [path,expected]of Object.entries(intake.e4.artifactSha256AtAcceptedHead))assert.equal(digest(path),path===consumer?consumerV34:expected,path);
const service=JSON.parse(readFileSync(new URL('specs/bootcamp/hackathon-test-e5-service-intake-v1.json',root)));
const preserved=Object.entries(service.sourceArtifacts).filter(([path])=>path!=='tests/hackathon-test-vault/e5/preservation.mjs');
// Explicit normal-path fixes requested by the API owner; original intake remains unchanged.
const normalPathChanges=[
  ["src/hackathon-test-vault/e5/envelope-service.mjs", "cd73c063aff3d75aba9532361f2592299260729565875b7721bfdf515083f87b", "ac9431747c64ab86da904222e458dbba1e25ba8b127ef481d8fe57618d162d0b"],
  [
    "src/hackathon-test-vault/e5/environment.mjs",
    "a38dc46a8d0c9afd91b68d295c1d4aaaa3a5815ba8fe70338a9fa68e4fb3666e",
    "04ce4ba88b683fa680639bf003fabf135ef58a4bd5339026fbdffbdfe746bc6a"
  ],
  [
    "src/hackathon-test-vault/e5/reader.mjs",
    "34f0b529dd459881bc82032efb9d7c3eaec6818928c4f23d2e046f649f3eddfd",
    "a9d828b388b16e8ebbe3ecc153b65f01a4a45a14e657282d1e91acbfc8136fc8"
  ]
];
const ciChanges=[['.github/workflows/hackathon-e5.yml','fee28eb517ba2e96495d39f2aade786bf98289c89fab7a8fa20768791dd7a959','8b24df4c694b623be5ebc5ab61a02610ad02c1e85ac53839638ac02d78aeb29a']];
for(const [path,before,after]of ciChanges){assert.equal(service.sourceArtifacts[path],before,path);assert.equal(digest(path),after,path);}
for(const [path,before,after]of normalPathChanges){assert.equal(service.sourceArtifacts[path],before,path);assert.equal(digest(path),after,path);}
for(const [path,expected]of preserved)assert.equal(digest(path),[...normalPathChanges,...ciChanges].find(([p])=>p===path)?.[2]??expected,path);
assert.equal(digest(intake.frozenInputs.memoryBoundary),intake.frozenInputs.memoryBoundarySha256);
console.log(JSON.stringify({frozenE4Files:8,explicitV34MemoryConsumer:consumerV34,frozenE5Artifacts:preserved.length-normalPathChanges.length-ciChanges.length,explicitNormalPathChanges:normalPathChanges.length,explicitCiDependencyChanges:ciChanges.length,explicitPreservationTestUpdate:true,memoryBoundaryV1:'UNCHANGED'}));
