import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {consumeReviewedV33Sources} from '../../../src/hackathon-test-vault/reviewed-source-v33.mjs';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root));
const actualDigest=p=>createHash('sha256').update(read(p)).digest('hex');
const v32Digest=p=>["src/bootcamp/http.mjs", "src/bootcamp/normal-client.mjs", "src/bootcamp/store.mjs", "tools/bootcamp/frontend-server.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','19e1c1473165cdea52a42040e740b79ba3e50c03:'+p],{cwd:root})).digest('hex'):actualDigest(p);
const v31Digest=p=>["src/bootcamp/execution-api-bridge.mjs", "src/bootcamp/execution-commands.mjs", "src/bootcamp/execution-development.mjs", "src/bootcamp/execution-e4b-ports.mjs", "src/bootcamp/execution-operations.mjs", "src/bootcamp/http.mjs", "src/bootcamp/normal-client.mjs", "src/bootcamp/procedure.mjs", "tools/bootcamp/explicit-consents.mjs", "tools/bootcamp/normal-chain.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','dce9ab18c25f2eee288de9c7bde05209e24af430:'+p],{cwd:root})).digest('hex'):v32Digest(p);
const v30Digest=p=>["src/bootcamp/execution-api-bridge.mjs", "src/bootcamp/execution-authority.mjs", "src/bootcamp/execution-commands.mjs", "src/bootcamp/execution-development.mjs", "src/bootcamp/execution-e4b-ports.mjs", "src/bootcamp/execution-operations.mjs", "src/bootcamp/http.mjs", "src/bootcamp/normal-client.mjs", "src/bootcamp/procedure-ledger.mjs", "src/bootcamp/procedure-ports.mjs", "src/bootcamp/procedure.mjs", "src/hackathon-test-vault/e5/environment.mjs", "src/hackathon-test-vault/e5/reader.mjs", "tools/bootcamp/live-context.mjs", "tools/bootcamp/normal-chain.mjs", "tools/bootcamp/prepare-live-input.mjs", "src/hackathon-test-vault/e5b/bridge.d.mts", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs", "src/bootcamp/store.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','c4d61be65cd2e912006060a4eb62183efad9cadc:'+p],{cwd:root})).digest('hex'):v31Digest(p);
const v29Digest=p=>["src/bootcamp/execution-api-bridge.mjs", "src/bootcamp/execution-e4b-controller.mjs", "src/bootcamp/execution-operations.mjs", "src/bootcamp/store.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','59864d27c0a32657a395f5d17544731b759dbb47:'+p],{cwd:root})).digest('hex'):v30Digest(p);
const v28Digest=p=>["src/bootcamp/execution-api-bridge.mjs", "src/bootcamp/execution-development.mjs", "src/bootcamp/execution-e4b-ports.mjs", "src/bootcamp/execution-operations.mjs", "src/hackathon-test-vault/e5/environment.mjs", "tools/bootcamp/normal-chain.mjs", "tools/bootcamp/prepare-live-input.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','cc9452a21aebe91fbf0b966341b11f9f5a0029dd:'+p],{cwd:root})).digest('hex'):v29Digest(p);
const currentDigest=p=>["src/bootcamp/execution-e4b-controller.mjs", "src/bootcamp/operations.mjs", "src/bootcamp/procedure.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','7a39f91b0861ea775cc4d1945f81a654b97d4458:'+p],{cwd:root})).digest('hex'):v28Digest(p);
const v26Digest=p=>["src/bootcamp/execution-e4b-controller.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','f5dc165ad0d76ffdcc0c4040ade06539ca432e5d:'+p],{cwd:root})).digest('hex'):currentDigest(p);
const v25Digest=p=>["src/bootcamp/execution-operations.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','851c9e12a139295d337f347d49d1f4aac90c6ce7:'+p],{cwd:root})).digest('hex'):v26Digest(p);
const v24Digest=p=>["src/bootcamp/execution-api-bridge.mjs", "src/bootcamp/execution-development.mjs", "src/bootcamp/execution-e4b-ports.mjs", "src/hackathon-test-vault/e5/envelope-service.mjs", "src/hackathon-test-vault/e5b/bridge.mjs", "src/hackathon-test-vault/e5b/service.mjs", "tools/bootcamp/live-context.mjs", "tools/bootcamp/normal-chain.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb:'+p],{cwd:root})).digest('hex'):v25Digest(p);
const v23Digest=p=>["src/bootcamp/execution-e4b-controller.mjs", "src/hackerrank-evidence/diagnostics.mjs", "tools/bootcamp/live-context.mjs", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','d0914a70ade684627ede88a3ed788403dd3437e5:'+p],{cwd:root})).digest('hex'):v24Digest(p);
const v22Digest=p=>["tools/bootcamp/test-client/review-window.js", "src/hackathon-test-vault/memory-stage-harness.mjs", "tests/hackathon-test-vault/e5/preservation.mjs", "tests/hackathon-test-vault/e5b/source-pins.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','dd10cb27dda05c320530a15305f4b464d2361780:'+p],{cwd:root})).digest('hex'):v23Digest(p);
// Prior generation assertions retain their original baseline bytes; v22 is checked separately below.
const v22ChangedPaths=["src/bootcamp/http.mjs", "src/bootcamp/normal-client.mjs", "src/bootcamp/procedure.mjs", "src/hackerrank-evidence/diagnostics.mjs", "tools/bootcamp/explicit-consents.mjs", "tools/bootcamp/frontend-server.mjs", "tools/bootcamp/live-context.mjs", "tools/bootcamp/normal-chain.mjs", "tools/bootcamp/normal-host-config.mjs", "tools/bootcamp/normal-host-flow.mjs", "tools/bootcamp/normal-host.mjs"];
const digest=p=>["src/bootcamp/execution-e4b-controller.mjs", "src/hackerrank-evidence/diagnostics.mjs", "tools/bootcamp/live-context.mjs"].includes(p)?createHash('sha256').update(execFileSync('git',['show','d0914a70ade684627ede88a3ed788403dd3437e5:'+p],{cwd:root})).digest('hex'):(v22ChangedPaths.includes(p)||['src/hackathon-test-vault/memory-stage-harness.mjs','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].includes(p))?createHash('sha256').update(execFileSync('git',['show','1421c5ff2105694461f6d470d6b0127d4fd11ce2:'+p],{cwd:root})).digest('hex'):v24Digest(p);
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
const v12Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v9.json'));
const v13Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v10.json'));
const v14Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v11.json'));
const v15Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v12.json'));
const v16Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v13.json'));
const v17Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v14.json'));
const v18Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v15.json'));
const v19Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v16.json'));
const v20Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v17.json'));
const v21Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v18.json'));
assert.equal(v21Pins.version,'clear-e5-normal-path-source-pins.18');assert.equal(v21Pins.scope,'EXACT_V21_CONSENT_READ_CURRENTNESS');
assert.equal(v21Pins.baseHead,'ffb999f5e1af802619c265908ab3b4fbeab72012');assert.equal(v21Pins.reviewedApiHead,'990db37a3d7b27d19d4fe43fe0cb64a7d155f050');
assert.equal(v21Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v17.json');assert.equal(digest(v21Pins.previousRecord.path),v21Pins.previousRecord.sha256);
assert.equal(v21Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v21.json');assert.equal(digest(v21Pins.reviewedIntake.path),'2edf76879b3b45562b71a65b38fea8aa6b8ef9732c11ea616a0c8d6036f5565b');
assert.deepEqual(Object.keys(v21Pins.changes),Object.keys(v20Pins.changes));for(const [p,d]of Object.entries(v21Pins.changes)){assert.equal(d.before,v20Pins.changes[p].after,p);assert.equal(digest(p),d.after,p);}
assert.deepEqual(Object.keys(v21Pins.additions),['src/hackathon-test-vault/reviewed-source-v21.mjs']);for(const [p,h]of Object.entries(v21Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v20Pins.version,'clear-e5-normal-path-source-pins.17');assert.equal(v20Pins.scope,'EXACT_V20_MANAGED_AI_RUN_BINDING');
assert.equal(v20Pins.baseHead,'1e923495380c81abf2eab13b21ec918ef2915495');assert.equal(v20Pins.reviewedApiHead,'f11d6a71aef3f1ef8f4483127ec22a9759303ec3');
assert.equal(v20Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v16.json');assert.equal(digest(v20Pins.previousRecord.path),v20Pins.previousRecord.sha256);
assert.equal(v20Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v20.json');assert.equal(digest(v20Pins.reviewedIntake.path),'25a66433edefd19bbdb98e57a7699748440b347cec95b145a491385813c9ef77');
assert.deepEqual(Object.keys(v20Pins.changes),Object.keys(v19Pins.changes));for(const [p,d]of Object.entries(v20Pins.changes)){assert.equal(d.before,v19Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v20Pins.additions),['src/hackathon-test-vault/reviewed-source-v20.mjs']);for(const [p,h]of Object.entries(v20Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v19Pins.version,'clear-e5-normal-path-source-pins.16');assert.equal(v19Pins.scope,'EXACT_V19_CLOCK_BOUNDARY_REGISTRATION_FIX');
assert.equal(v19Pins.baseHead,'03f8d157043fa1b1d004d5ef9d645a5767a26ffe');assert.equal(v19Pins.reviewedApiHead,'b2f11e62546e6bd3ab0a5458993918be6d3265c7');
assert.equal(v19Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v15.json');assert.equal(digest(v19Pins.previousRecord.path),v19Pins.previousRecord.sha256);
assert.equal(v19Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v19.json');assert.equal(digest(v19Pins.reviewedIntake.path),'51c1b01c643b6f11d05fbb6a85a89c66eb86a426db3cc4d947e1df7bb09e1d72');
assert.deepEqual(Object.keys(v19Pins.changes),Object.keys(v18Pins.changes));for(const [p,d]of Object.entries(v19Pins.changes)){assert.equal(d.before,v18Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v19Pins.additions),['src/hackathon-test-vault/reviewed-source-v19.mjs']);for(const [p,h]of Object.entries(v19Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v18Pins.version,'clear-e5-normal-path-source-pins.15');assert.equal(v18Pins.scope,'EXACT_V18_STWO_PUBLIC_INPUT_BINDING_FIX');
assert.equal(v18Pins.baseHead,'36c9aed6370623a915e8eff858d96078da09f26b');assert.equal(v18Pins.reviewedApiHead,'7d9db33924be50ae79f90385c3ac7f37b58d0a82');
assert.equal(v18Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v14.json');assert.equal(digest(v18Pins.previousRecord.path),v18Pins.previousRecord.sha256);
assert.equal(v18Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v18.json');assert.equal(digest(v18Pins.reviewedIntake.path),'12ddc5d166d8b3f090aa8e4211e4bd335938365e068757259df5244174c70b13');
assert.deepEqual(Object.keys(v18Pins.changes),Object.keys(v17Pins.changes));for(const [p,d]of Object.entries(v18Pins.changes)){assert.equal(d.before,v17Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v18Pins.additions),['src/hackathon-test-vault/reviewed-source-v18.mjs']);for(const [p,h]of Object.entries(v18Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v17Pins.version,'clear-e5-normal-path-source-pins.14');assert.equal(v17Pins.scope,'EXACT_V17_SAFE_INVALID_CLAIM_RETURN_HINTS');
assert.equal(v17Pins.baseHead,'253f94ff1461e3521dd787395c71b40a4da214b6');assert.equal(v17Pins.reviewedApiHead,'3e1508d3f181662023268fb62a7803e0a483f5c9');
assert.equal(v17Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v13.json');assert.equal(digest(v17Pins.previousRecord.path),v17Pins.previousRecord.sha256);
assert.equal(v17Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v17.json');assert.equal(digest(v17Pins.reviewedIntake.path),'24c2808e5521ceac304efa167d00167f35f1e425cd29850add4bd7db22ce5361');
assert.deepEqual(Object.keys(v17Pins.changes),Object.keys(v16Pins.changes));for(const [p,d]of Object.entries(v17Pins.changes)){assert.equal(d.before,v16Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v17Pins.additions),['src/hackathon-test-vault/reviewed-source-v17.mjs']);for(const [p,h]of Object.entries(v17Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v16Pins.version,'clear-e5-normal-path-source-pins.13');assert.equal(v16Pins.scope,'EXACT_V16_MESSAGE_QUEUE_LIMITS_AND_RPC_DEADLINES');
assert.equal(v16Pins.baseHead,'0b9091f299f7ab56a622a8b3db7a976c529f6eca');assert.equal(v16Pins.reviewedApiHead,'8765198716b74c37639b79dbb501e13689a90b0a');
assert.equal(v16Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v12.json');assert.equal(digest(v16Pins.previousRecord.path),v16Pins.previousRecord.sha256);
assert.equal(v16Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v16.json');assert.equal(digest(v16Pins.reviewedIntake.path),'32e3d63af6d224f889c807866adb929056dff1bc16b4a2cf1190f8a2e049d36c');
assert.deepEqual(Object.keys(v16Pins.changes),Object.keys(v15Pins.changes));for(const [p,d]of Object.entries(v16Pins.changes)){assert.equal(d.before,v15Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v16Pins.additions),['src/hackathon-test-vault/reviewed-source-v16.mjs']);for(const [p,h]of Object.entries(v16Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v15Pins.version,'clear-e5-normal-path-source-pins.12');assert.equal(v15Pins.scope,'EXACT_V15_OWNED_SEND_FAILURES_AND_CLAIM_RPC_BOUNDARY');
assert.equal(v15Pins.baseHead,'4b0a1063cc442f331510c1a0ed9e65bbbd570daf');assert.equal(v15Pins.reviewedApiHead,'3e8aa5c1060278431c8eda8fb8f0328c35115658');
assert.equal(v15Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v11.json');assert.equal(digest(v15Pins.previousRecord.path),v15Pins.previousRecord.sha256);
assert.equal(v15Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v15.json');assert.equal(digest(v15Pins.reviewedIntake.path),'6b5c80282fba406a3097f81b568b400ef22636bdf481c5ae3d400176c3e06887');
assert.deepEqual(Object.keys(v15Pins.changes),Object.keys(v14Pins.changes));for(const [p,d]of Object.entries(v15Pins.changes)){assert.equal(d.before,v14Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??v16Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v15Pins.additions),['src/hackathon-test-vault/reviewed-source-v15.mjs']);for(const [p,h]of Object.entries(v15Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v14Pins.version,'clear-e5-normal-path-source-pins.11');assert.equal(v14Pins.scope,'EXACT_V14_SDK_ERROR_BOUNDARIES_AND_MONOTONIC_DIAGNOSTICS');
assert.equal(v14Pins.baseHead,'d678464fec400b01767aaaf2cbc7130e805c27be');assert.equal(v14Pins.reviewedApiHead,'105b1a33fc37cacf24179aff08a96a510d952383');
assert.equal(v14Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v10.json');assert.equal(digest(v14Pins.previousRecord.path),v14Pins.previousRecord.sha256);
assert.equal(v14Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v14.json');assert.equal(digest(v14Pins.reviewedIntake.path),'7f558777c3550522db9880359054f387d38460f4d487bceb708d2bfb1b3411de');
assert.deepEqual(Object.keys(v14Pins.changes),Object.keys(v13Pins.changes));for(const [p,d]of Object.entries(v14Pins.changes)){assert.equal(d.before,v13Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??v16Pins.changes[p]?.after??v15Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v14Pins.additions),['src/hackathon-test-vault/reviewed-source-v14.mjs']);for(const [p,h]of Object.entries(v14Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v13Pins.version,'clear-e5-normal-path-source-pins.10');assert.equal(v13Pins.scope,'EXACT_V13_SIGNATURE_WAIT_PROJECTION_CONFLICT');
assert.equal(v13Pins.baseHead,'18bbb2455de6971558077b4ab9a77c27008b5ba4');assert.equal(v13Pins.reviewedApiHead,'cad308fa7552fc73d08a63bdb575334fdf791e05');
assert.equal(v13Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v9.json');assert.equal(digest(v13Pins.previousRecord.path),v13Pins.previousRecord.sha256);
assert.equal(v13Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v13.json');assert.equal(digest(v13Pins.reviewedIntake.path),'611a62d521854c8bd89a4eb7584c6deae71a7346d7b62c2409580f622d9d7880');
assert.deepEqual(Object.keys(v13Pins.changes),Object.keys(v12Pins.changes));for(const [p,d]of Object.entries(v13Pins.changes)){assert.equal(d.before,v12Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??v16Pins.changes[p]?.after??v15Pins.changes[p]?.after??v14Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v13Pins.additions),['src/hackathon-test-vault/reviewed-source-v13.mjs']);for(const [p,h]of Object.entries(v13Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v12Pins.version,'clear-e5-normal-path-source-pins.9');assert.equal(v12Pins.scope,'EXACT_V12_BOUNDED_SOURCE_DIAGNOSTICS');
assert.equal(v12Pins.baseHead,'85212551fd8e86b22b2c0c0b3525100e9579f2f7');assert.equal(v12Pins.reviewedApiHead,'829451dd2d930f5e9cdb094e1e90ce89f982560c');
assert.equal(v12Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v8.json');assert.equal(digest(v12Pins.previousRecord.path),v12Pins.previousRecord.sha256);
assert.equal(v12Pins.reviewedIntake.path,'specs/bootcamp/hackathon-test-memory-source-intake-v12.json');assert.equal(digest(v12Pins.reviewedIntake.path),'ed279c819aab1bc91b8cb15b3c1f974e9a42df5feaf038e4270e89a7b1d49bcd');
assert.deepEqual(Object.keys(v12Pins.changes),Object.keys(v11Pins.changes));for(const [p,d]of Object.entries(v12Pins.changes)){assert.equal(d.before,v11Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??v16Pins.changes[p]?.after??v15Pins.changes[p]?.after??v14Pins.changes[p]?.after??v13Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v12Pins.additions),['src/hackathon-test-vault/reviewed-source-v12.mjs']);for(const [p,h]of Object.entries(v12Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v11Pins.version,'clear-e5-normal-path-source-pins.8');assert.equal(v11Pins.scope,'EXACT_V11_SOURCE_LEASE_TRANSACTION_AND_ADDRESS_FIX');
assert.equal(v11Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v7.json');assert.equal(digest(v11Pins.previousRecord.path),v11Pins.previousRecord.sha256);
assert.equal(digest(v11Pins.reviewedIntake.path),v11Pins.reviewedIntake.sha256);
const v10Pins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v7.json'));
assert.deepEqual(Object.keys(v11Pins.changes).sort(),Object.keys(v10Pins.changes).sort());for(const [p,d]of Object.entries(v11Pins.changes)){assert.equal(d.before,v10Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??v16Pins.changes[p]?.after??v15Pins.changes[p]?.after??v14Pins.changes[p]?.after??v13Pins.changes[p]?.after??v12Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v11Pins.additions),['src/hackathon-test-vault/reviewed-source-v11.mjs']);for(const [p,h]of Object.entries(v11Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v10Pins.version,'clear-e5-normal-path-source-pins.7');assert.equal(v10Pins.scope,'EXACT_NORMAL_HOST_PREPARATION_AND_SESSION_BOOTSTRAP_V10');
assert.equal(v10Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v6.json');assert.equal(digest(v10Pins.previousRecord.path),v10Pins.previousRecord.sha256);
assert.equal(digest(v10Pins.reviewedIntake.path),v10Pins.reviewedIntake.sha256);
assert.deepEqual(Object.keys(v10Pins.changes).sort(),Object.keys(v9Pins.changes).sort());
for(const [p,d]of Object.entries(v10Pins.changes)){assert.equal(d.before,v9Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??v16Pins.changes[p]?.after??v15Pins.changes[p]?.after??v14Pins.changes[p]?.after??v13Pins.changes[p]?.after??v12Pins.changes[p]?.after??v11Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v10Pins.additions),['src/hackathon-test-vault/reviewed-source-v10.mjs']);for(const [p,h]of Object.entries(v10Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v9Pins.version,'clear-e5-normal-path-source-pins.6');
assert.equal(v9Pins.scope,'EXACT_C3_V9_OWNED_CANONICAL_REFRESH_NO_WINDOW_EXTENSION');
assert.equal(v9Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v5.json');
assert.equal(digest(v9Pins.previousRecord.path),v9Pins.previousRecord.sha256);
assert.equal(v9Pins.reviewedIntake.sha256,'19261eca5c089bf8ae68626bfdfff87b935bb7c4b0a9c783bb52709c9a2870fc');
assert.equal(digest(v9Pins.reviewedIntake.path),v9Pins.reviewedIntake.sha256);
assert.deepEqual(Object.keys(v9Pins.changes).sort(),Object.keys(v8Pins.changes).sort());
for(const [p,d]of Object.entries(v9Pins.changes)){assert.equal(d.before,v8Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??v16Pins.changes[p]?.after??v15Pins.changes[p]?.after??v14Pins.changes[p]?.after??v13Pins.changes[p]?.after??v12Pins.changes[p]?.after??v11Pins.changes[p]?.after??v10Pins.changes[p]?.after??v9Pins.changes[p]?.after??d.after,p);}
assert.deepEqual(Object.keys(v9Pins.additions),['src/hackathon-test-vault/reviewed-source-v9.mjs']);
for(const [p,h]of Object.entries(v9Pins.additions))assert.equal(digest(p),h,p);
assert.equal(v8Pins.version,'clear-e5-normal-path-source-pins.5');
assert.equal(v8Pins.scope,'EXACT_READONLY_C3_V8_RECEIPT_AND_BROWSER_CONNECTION');
assert.equal(v8Pins.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v4.json');
assert.equal(digest(v8Pins.previousRecord.path),v8Pins.previousRecord.sha256);
assert.equal(v8Pins.reviewedIntake.sha256,'ca37fb5574a293ac6873d4d22e136fcc2f214f58a60b0a8d7f46e09dd786ed33');
assert.equal(digest(v8Pins.reviewedIntake.path),v8Pins.reviewedIntake.sha256);
assert.deepEqual(Object.keys(v8Pins.changes).sort(),Object.keys(v7Pins.changes).sort());
for(const [p,d]of Object.entries(v8Pins.changes)){assert.equal(d.before,v7Pins.changes[p].after,p);assert.equal(digest(p),v21Pins.changes[p]?.after??v20Pins.changes[p]?.after??v19Pins.changes[p]?.after??v18Pins.changes[p]?.after??v17Pins.changes[p]?.after??v16Pins.changes[p]?.after??v15Pins.changes[p]?.after??v14Pins.changes[p]?.after??v13Pins.changes[p]?.after??v12Pins.changes[p]?.after??v11Pins.changes[p]?.after??v10Pins.changes[p]?.after??v9Pins.changes[p]?.after??d.after,p);}
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
for(const [path,{before,after}]of Object.entries(v7Pins.changes)){assert.equal(before,v6Pins.changes[path].after,path);assert.equal(digest(path),v21Pins.changes[path]?.after??v20Pins.changes[path]?.after??v19Pins.changes[path]?.after??v18Pins.changes[path]?.after??v17Pins.changes[path]?.after??v16Pins.changes[path]?.after??v15Pins.changes[path]?.after??v14Pins.changes[path]?.after??v13Pins.changes[path]?.after??v12Pins.changes[path]?.after??v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??after,path);}
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
 assert.equal(before,ci.changes[path]?.after??next.changes[path]?.after,path);assert.equal(digest(path),v21Pins.changes[path]?.after??v20Pins.changes[path]?.after??v19Pins.changes[path]?.after??v18Pins.changes[path]?.after??v17Pins.changes[path]?.after??v16Pins.changes[path]?.after??v15Pins.changes[path]?.after??v14Pins.changes[path]?.after??v13Pins.changes[path]?.after??v12Pins.changes[path]?.after??v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??after,path);
}
assert.equal(ci.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins-v2.json');
assert.equal(digest(ci.previousRecord.path),ci.previousRecord.sha256);
assert.deepEqual(Object.keys(ci.changes).sort(),['.github/workflows/hackathon-e5.yml','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].sort());
assert.equal(next.baseHead,'8851775fa4f34e1af0a858436cf3dea648eda9af');
assert.equal(digest(next.previousRecord.path),next.previousRecord.sha256);
assert.equal(next.previousRecord.path,'docs/hackathon-test-vault/e5b/normal-source-pins.json');
assert.deepEqual(Object.keys(next.changes).sort(),['src/hackathon-test-vault/memory-stage-harness.mjs','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].sort());
for(const [path,{before,after}]of Object.entries(next.changes)){assert.equal(before,normal.changes[path].after,path);assert.equal(digest(path),v21Pins.changes[path]?.after??v20Pins.changes[path]?.after??v19Pins.changes[path]?.after??v18Pins.changes[path]?.after??v17Pins.changes[path]?.after??v16Pins.changes[path]?.after??v15Pins.changes[path]?.after??v14Pins.changes[path]?.after??v13Pins.changes[path]?.after??v12Pins.changes[path]?.after??v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??v6Pins.changes[path]?.after??ci.changes[path]?.after??after,path);}
assert.equal(normal.baseHead,'a4a05c7aa6a1614760273e78edb5ba6ccb556232');
assert.deepEqual(Object.keys(normal.changes).sort(),['src/hackathon-test-vault/memory-stage-harness.mjs','src/hackathon-test-vault/e5/environment.mjs','src/hackathon-test-vault/e5/reader.mjs','tests/hackathon-test-vault/e5/preservation.mjs','tests/hackathon-test-vault/e5b/source-pins.mjs'].sort());
assert.deepEqual(Object.keys(normal.additions),['src/hackathon-test-vault/normal-source-compatibility.mjs']);
for(const [path,expected]of Object.entries(normal.additions))assert.equal(digest(path),expected,path);
const service=JSON.parse(read('specs/bootcamp/hackathon-test-e5-service-intake-v1.json'));
for(const [path,{before,after}]of Object.entries(ci.changes)){assert.equal(before,next.changes[path]?.after??service.sourceArtifacts[path],path);assert.equal(digest(path),v21Pins.changes[path]?.after??v20Pins.changes[path]?.after??v19Pins.changes[path]?.after??v18Pins.changes[path]?.after??v17Pins.changes[path]?.after??v16Pins.changes[path]?.after??v15Pins.changes[path]?.after??v14Pins.changes[path]?.after??v13Pins.changes[path]?.after??v12Pins.changes[path]?.after??v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??v6Pins.changes[path]?.after??after,path);}
for(const [path,{before,after}]of Object.entries(normal.changes)){assert.equal(before,pins.sourceArtifactSha256[path]??service.sourceArtifacts[path],path);assert.equal(digest(path),v21Pins.changes[path]?.after??v20Pins.changes[path]?.after??v19Pins.changes[path]?.after??v18Pins.changes[path]?.after??v17Pins.changes[path]?.after??v16Pins.changes[path]?.after??v15Pins.changes[path]?.after??v14Pins.changes[path]?.after??v13Pins.changes[path]?.after??v12Pins.changes[path]?.after??v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??v6Pins.changes[path]?.after??ci.changes[path]?.after??next.changes[path]?.after??after,path);}
for(const [path,expected]of Object.entries(pins.sourceArtifactSha256))assert.equal(digest(path),v21Pins.changes[path]?.after??v20Pins.changes[path]?.after??v19Pins.changes[path]?.after??v18Pins.changes[path]?.after??v17Pins.changes[path]?.after??v16Pins.changes[path]?.after??v15Pins.changes[path]?.after??v14Pins.changes[path]?.after??v13Pins.changes[path]?.after??v12Pins.changes[path]?.after??v11Pins.changes[path]?.after??v10Pins.changes[path]?.after??v9Pins.changes[path]?.after??v8Pins.changes[path]?.after??v7Pins.changes[path]?.after??v6Pins.changes[path]?.after??ci.changes[path]?.after??next.changes[path]?.after??normal.changes[path]?.after??expected,path);
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
const v28=consumeReviewedV33Sources(v6);assert.equal(Object.keys(v28.sources).length,180);
const windowPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v19.json'));assert.equal(windowPins.version,'clear-e5-normal-path-source-pins.19');
assert.equal(windowPins.baseHead,'1421c5ff2105694461f6d470d6b0127d4fd11ce2');assert.equal(windowPins.reviewedApiHead,'f0548e3f77d1c19c348713fef2a2b389ca291c67');assert.equal(windowPins.scope,'EXACT_V22_HUMAN_REVIEW_WINDOW');
assert.equal(v22Digest(windowPins.previousRecord.path),windowPins.previousRecord.sha256);
assert.equal(v22Digest(windowPins.reviewedIntake.path),'3072f09076cd07b1db2efbb4001ee2c5ee7d48fabb15649082abff5f8534ca97');
for(const [p,d]of Object.entries(windowPins.changes)){assert.equal(createHash('sha256').update(execFileSync('git',['show','1421c5ff2105694461f6d470d6b0127d4fd11ce2:'+p],{cwd:root})).digest('hex'),d.before,p);assert.equal(v22Digest(p),d.after,p);}
assert.deepEqual(Object.keys(windowPins.additions),["tools/bootcamp/normal-reflection-approval.mjs", "tools/bootcamp/normal-review-window.mjs", "tools/bootcamp/normal-source-sequence.mjs", "tools/bootcamp/test-client/review-window.js", "src/hackathon-test-vault/reviewed-source-v22.mjs"]);for(const [p,h]of Object.entries(windowPins.additions))assert.equal(v22Digest(p),h,p);
stripTypeScriptTypes(read('src/hackathon-test-vault/e5b/bridge.d.mts').toString());
console.log(JSON.stringify({componentArtifacts:Object.keys(pins.sourceArtifactSha256).length,immutableInputs:Object.keys(pins.immutableInputs).length,preservedV5Sources:36,preservedV6Sources:36,preservedV7Sources:134,preservedV8Sources:135,preservedV9Sources:135,preservedV10Sources:159,preservedV11Sources:159,preservedV12Sources:160,preservedV13Sources:160,preservedV14Sources:160,preservedV15Sources:161,preservedV16Sources:162,preservedV17Sources:163,preservedV18Sources:164,preservedV19Sources:165,preservedV20Sources:166,preservedV21Sources:166,preservedV22Sources:170,preservedV23Sources:170,preservedV24Sources:170,preservedV25Sources:171,preservedV26Sources:171,reviewedV33Sources:180,reviewedV7TransitiveSources:85,reviewedV7Assets:13,explicitV6SourceDeltas:3,declarationSyntax:'PASS_NOT_FULL_TSC',actualApiConnected:false}));

const budgetPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v20.json'));assert.equal(budgetPins.version,'clear-e5-normal-path-source-pins.20');assert.equal(budgetPins.baseHead,'dd10cb27dda05c320530a15305f4b464d2361780');assert.equal(budgetPins.reviewedApiHead,'3374c383e585f26ea712911ac6be5b6ac44c0a56');
assert.equal(v23Digest(budgetPins.previousRecord.path),budgetPins.previousRecord.sha256);assert.equal(v23Digest(budgetPins.reviewedIntake.path),'a950980645917f3353759dd01065766e2859e29af928a434106b6566a524ca3c');
for(const [p,d]of Object.entries(budgetPins.changes)){assert.equal(createHash('sha256').update(execFileSync('git',['show','dd10cb27dda05c320530a15305f4b464d2361780:'+p],{cwd:root})).digest('hex'),d.before,p);assert.equal(v23Digest(p),d.after,p);}
assert.deepEqual(Object.keys(budgetPins.additions),['src/hackathon-test-vault/reviewed-source-v23.mjs']);assert.equal(v23Digest('src/hackathon-test-vault/reviewed-source-v23.mjs'),budgetPins.additions['src/hackathon-test-vault/reviewed-source-v23.mjs']);

const recoveryPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v21.json'));assert.equal(recoveryPins.version,'clear-e5-normal-path-source-pins.21');assert.equal(recoveryPins.baseHead,'d0914a70ade684627ede88a3ed788403dd3437e5');assert.equal(recoveryPins.reviewedApiHead,'cce3b9382fcf3309534a8d5fa57d4ddfb8259505');
assert.equal(v24Digest(recoveryPins.previousRecord.path),recoveryPins.previousRecord.sha256);assert.equal(v24Digest(recoveryPins.reviewedIntake.path),'8ec4832c29f6717b32d47d1266798600994bc17190027b19be604ee6591512fc');
for(const [p,d]of Object.entries(recoveryPins.changes)){assert.equal(createHash('sha256').update(execFileSync('git',['show','d0914a70ade684627ede88a3ed788403dd3437e5:'+p],{cwd:root})).digest('hex'),d.before,p);assert.equal(v24Digest(p),d.after,p);}
assert.deepEqual(Object.keys(recoveryPins.additions),['src/hackathon-test-vault/reviewed-source-v24.mjs']);assert.equal(v24Digest('src/hackathon-test-vault/reviewed-source-v24.mjs'),recoveryPins.additions['src/hackathon-test-vault/reviewed-source-v24.mjs']);

const diagnosticPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v22.json'));assert.equal(diagnosticPins.version,'clear-e5-normal-path-source-pins.22');assert.equal(diagnosticPins.scope,'EXACT_V25_NORMAL_PAYMENT_FAILURE_DIAGNOSTICS');assert.equal(diagnosticPins.baseHead,'c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb');assert.equal(diagnosticPins.reviewedApiHead,'c48ec5b08e821ffaa08034c8dafe56c2b214df60');
assert.equal(v25Digest(diagnosticPins.previousRecord.path),diagnosticPins.previousRecord.sha256);assert.equal(v25Digest(diagnosticPins.reviewedIntake.path),'8c4b1dcca74ca3a350a08268d705e0c8332e849bfbb014c997a926d192398a16');
for(const [p,d]of Object.entries(diagnosticPins.changes)){assert.equal(createHash('sha256').update(execFileSync('git',['show','c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb:'+p],{cwd:root})).digest('hex'),d.before,p);assert.equal(v25Digest(p),d.after,p);}
assert.deepEqual(Object.keys(diagnosticPins.additions),["src/bootcamp/execution-diagnostics.mjs", "src/hackathon-test-vault/reviewed-source-v25.mjs"]);for(const [p,h]of Object.entries(diagnosticPins.additions))assert.equal(v25Digest(p),h,p);

const planPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v23.json'));assert.equal(planPins.version,'clear-e5-normal-path-source-pins.23');assert.equal(planPins.scope,'EXACT_V26_CLOCK_ONLY_PLAN_RECHECK');assert.equal(planPins.baseHead,'851c9e12a139295d337f347d49d1f4aac90c6ce7');assert.equal(planPins.reviewedApiHead,'b49c9485894a50c21ae10a5a8997b1993f4a0c51');
assert.equal(v26Digest(planPins.previousRecord.path),planPins.previousRecord.sha256);assert.equal(v26Digest(planPins.reviewedIntake.path),'f6bcbc3700bd6b7d8172da5afeb3786e3343a465c810df11f59d9ce3b700deb8');
for(const [p,d]of Object.entries(planPins.changes)){assert.equal(createHash('sha256').update(execFileSync('git',['show','851c9e12a139295d337f347d49d1f4aac90c6ce7:'+p],{cwd:root})).digest('hex'),d.before,p);assert.equal(v26Digest(p),d.after,p);}
assert.deepEqual(Object.keys(planPins.additions),['src/hackathon-test-vault/reviewed-source-v26.mjs']);for(const [p,h]of Object.entries(planPins.additions))assert.equal(v26Digest(p),h,p);

const witnessPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v24.json'));assert.equal(witnessPins.version,'clear-e5-normal-path-source-pins.24');assert.equal(witnessPins.scope,'EXACT_V27_BOUNDED_WITNESS_RECHECK');assert.equal(witnessPins.baseHead,'f5dc165ad0d76ffdcc0c4040ade06539ca432e5d');assert.equal(witnessPins.reviewedApiHead,'be6596e553e9dbb0f82b2932e8b22063ef24d355');
assert.equal(currentDigest(witnessPins.previousRecord.path),witnessPins.previousRecord.sha256);assert.equal(currentDigest(witnessPins.reviewedIntake.path),'309b79a1a8c1c490f602c9cc1e7daa4bf387efed942f87dc40271436506302f9');
for(const [p,d]of Object.entries(witnessPins.changes)){assert.equal(createHash('sha256').update(execFileSync('git',['show','f5dc165ad0d76ffdcc0c4040ade06539ca432e5d:'+p],{cwd:root})).digest('hex'),d.before,p);assert.equal(currentDigest(p),d.after,p);}
assert.deepEqual(Object.keys(witnessPins.additions),['src/hackathon-test-vault/reviewed-source-v27.mjs']);for(const [p,h]of Object.entries(witnessPins.additions))assert.equal(currentDigest(p),h,p);

const commitPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v25.json'));
assert.equal(commitPins.version,'clear-e5-normal-path-source-pins.25');assert.equal(commitPins.baseHead,'7a39f91b0861ea775cc4d1945f81a654b97d4458');assert.equal(commitPins.reviewedApiHead,'d2a6ffcda125057cebd932536e045b5f204604e8');
assert.equal(v28Digest(commitPins.previousRecord.path),commitPins.previousRecord.sha256);assert.equal(v28Digest(commitPins.reviewedIntake.path),'a0cde4221afa098bd4405fe4a65af94b3ebc91543179360ba2cb951303bb4561');
for(const [p,d]of Object.entries(commitPins.changes)){assert.equal(createHash('sha256').update(execFileSync('git',['show','7a39f91b0861ea775cc4d1945f81a654b97d4458:'+p],{cwd:root})).digest('hex'),d.before,p);assert.equal(v28Digest(p),d.after,p);}
assert.deepEqual(Object.keys(commitPins.additions),['src/hackathon-test-vault/reviewed-source-v28.mjs']);assert.equal(v28Digest('src/hackathon-test-vault/reviewed-source-v28.mjs'),commitPins.additions['src/hackathon-test-vault/reviewed-source-v28.mjs']);

const clockPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v26.json'));
assert.equal(clockPins.version,'clear-e5-normal-path-source-pins.26');assert.equal(clockPins.baseHead,'cc9452a21aebe91fbf0b966341b11f9f5a0029dd');assert.equal(clockPins.reviewedApiHead,'2730dcc43321facd9c58c0cfbf142dd34b87a1e6');
assert.equal(v31Digest(clockPins.previousRecord.path),clockPins.previousRecord.sha256);assert.equal(v31Digest(clockPins.reviewedIntake.path),'db613940a142d37d1f52f82d979a66e48f9dfa951d60bda5d8661198ac96dcd5');
for(const [p,d]of Object.entries(clockPins.changes)){assert.equal(createHash('sha256').update(execFileSync('git',['show','cc9452a21aebe91fbf0b966341b11f9f5a0029dd:'+p],{cwd:root})).digest('hex'),d.before,p);assert.equal(v29Digest(p),d.after,p);}
assert.deepEqual(Object.keys(clockPins.additions),['tools/bootcamp/normal-chain-time.mjs','src/hackathon-test-vault/reviewed-source-v29.mjs']);for(const [p,h]of Object.entries(clockPins.additions))assert.equal(v31Digest(p),h,p);

assert.equal(v31Digest('specs/bootcamp/hackathon-test-memory-source-intake-v30.json'),'cc5e9b3339e3cafac3db828abe23463f680b9719c0dc431503d452635dbe8f69');
for(const [p,h]of Object.entries(consumeReviewedV33Sources(v6).sources))assert.equal(actualDigest(p),h,p);

const registrationPins=JSON.parse(read('docs/hackathon-test-vault/e5b/normal-source-pins-v27.json'));
assert.equal(registrationPins.scope,'EXACT_V31_RECIPIENT_REGISTRATION_V2');
for(const [p,d]of Object.entries(registrationPins.changes)){
 assert.equal(createHash('sha256').update(execFileSync('git',['show',registrationPins.baseHead+':'+p],{cwd:root})).digest('hex'),d.before,p);
 assert.equal(v31Digest(p),d.after,p);
}
