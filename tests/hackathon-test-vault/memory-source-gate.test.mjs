import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import ganache from 'ganache';
import {createFreshMemoryStage,memoryStageTotals} from '../../src/hackathon-test-vault/memory-stage-harness.mjs';

// Replace one read in memory, never rewrite a pinned file or start an EVM.
const root=new URL('../../',import.meta.url);
for(const [path,code]of [
 ['specs/bootcamp/hackathon-test-memory-source-intake-v43.json','STAGE_V43_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v43.mjs','STAGE_SOURCE_PIN'],
 ['src/hackerrank-evidence/self-profile.mjs','STAGE_SOURCE_PIN'],
 ['tools/local-attestor-review/host.mjs','STAGE_SOURCE_PIN'],
 ['tools/local-attestor-review/server-child.mjs','STAGE_SOURCE_PIN'],
 ['tools/local-attestor-review/build-pins.json','STAGE_SOURCE_PIN'],
 ['tools/local-attestor-review/synthetic-https.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v42.json','STAGE_V42_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v42.mjs','STAGE_SOURCE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v41.mjs','STAGE_SOURCE_PIN'],
 ['tools/embedded-wallet/reviewed-dependencies.mjs','STAGE_PRODUCT_WALLET_PIN'],
 ['tools/embedded-wallet/patches/zod-6699.json','STAGE_PRODUCT_WALLET_PIN'],
 ['src/embedded-wallet/package-lock.json','STAGE_PRODUCT_WALLET_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v32.json','STAGE_V32_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v32.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/execution-corrections.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v31.json','STAGE_V31_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v31.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/recipient-registration.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v30.json','STAGE_V30_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v30.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v29.json','STAGE_V29_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v29.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/normal-chain-time.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v28.json','STAGE_V28_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v28.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/operations.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/procedure.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v27.json','STAGE_V27_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v27.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/execution-e4b-controller.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v26.json','STAGE_V26_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v26.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/execution-operations.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v25.json','STAGE_V25_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v25.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/execution-diagnostics.mjs','STAGE_SOURCE_PIN'],
 ['src/hackathon-test-vault/e5b/bridge.mjs','STAGE_SOURCE_PIN'],
 ['src/hackathon-test-vault/e5b/service.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v24.json','STAGE_V24_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v24.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/execution-e4b-controller.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v23.json','STAGE_V23_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v23.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/test-client/review-window.js','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v22.json','STAGE_V22_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v22.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/normal-review-window.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v21.json','STAGE_V21_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v21.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/explicit-consents.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v20.json','STAGE_V20_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v20.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/normal-reflection-run.mjs','STAGE_SOURCE_PIN'],
 ['tests/ai-review-precheck/first-normal-reflection-entry.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v19.json','STAGE_V19_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v19.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/normal-current-view.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/operations.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/procedure.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v18.json','STAGE_V18_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v18.mjs','STAGE_SOURCE_PIN'],
 ['docs/current/BOOTCAMP_ZK_EXECUTION_FINGERPRINTS_V1.json','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v17.json','STAGE_V17_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v17.mjs','STAGE_SOURCE_PIN'],
 ['src/hackerrank-evidence/claim-return-diagnostics.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v16.json','STAGE_V16_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v16.mjs','STAGE_SOURCE_PIN'],
 ['src/ybm-collector/send-context.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v15.json','STAGE_V15_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v15.mjs','STAGE_SOURCE_PIN'],
 ['src/ybm-collector/claim-rpc-observer.mjs','STAGE_SOURCE_PIN'],
 ['src/ybm-collector/socket.mjs','STAGE_SOURCE_PIN'],
 ['src/ybm-collector/client.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v14.json','STAGE_V14_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v14.mjs','STAGE_SOURCE_PIN'],
 ['src/hackerrank-evidence/worker-source.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v13.json','STAGE_V13_FILE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v13.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v12.json','STAGE_V12_FILE_PIN'],
 ['src/hackerrank-evidence/diagnostics.mjs','STAGE_SOURCE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v12.mjs','STAGE_SOURCE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v11.json','STAGE_V11_FILE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v10.json','STAGE_V10_FILE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v9.json','STAGE_V9_FILE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v8.json','STAGE_V9_PREVIOUS'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v7.json','STAGE_V9_PREVIOUS'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v6.json','STAGE_COMPATIBILITY_FILE_PIN'],
 ['specs/bootcamp/hackathon-test-memory-source-intake-v5.json','STAGE_PREVIOUS_COMPATIBILITY'],
 ['src/bootcamp/store.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/moodle-live-consumer.mjs','STAGE_SOURCE_PIN'],
 ['src/hackerrank-evidence/collector.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/live-context.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/ui-session.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/explicit-consents.mjs','STAGE_SOURCE_PIN'],
 ['src/hackerrank-evidence/worker-response.mjs','STAGE_SOURCE_PIN'],
 ['src/hackerrank-evidence/verifier.mjs','STAGE_SOURCE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v9.mjs','STAGE_SOURCE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v11.mjs','STAGE_SOURCE_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v10.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/normal-host-worker.mjs','STAGE_SOURCE_PIN'],
 ['tools/bootcamp/normal-host-config.mjs','STAGE_SOURCE_PIN'],
 ['src/dev/tls.mjs','STAGE_SOURCE_PIN'],
 ['src/bootcamp/normal-receipt.mjs','STAGE_SOURCE_PIN'],
 ['src/hackerrank-evidence/package-lock.json','STAGE_SOURCE_PIN'],
 ['src/mac-collector/storage.mjs','STAGE_SOURCE_PIN'],
])test('memory gate rejects changed bytes before runtime creation: '+path,async()=>{
 const original=fs.readFileSync,target=fileURLToPath(new URL(path,root)),before=memoryStageTotals();
 fs.readFileSync=function(file,...args){
  const value=original.call(this,file,...args);
  if((file instanceof URL?fileURLToPath(file):file)!==target)return value;
  return Buffer.isBuffer(value)?Buffer.concat([value,Buffer.from('\n')]):value+'\n';
 };
 syncBuiltinESMExports();
 try{
  await assert.rejects(()=>createFreshMemoryStage(),new RegExp(code));
  assert.deepEqual(memoryStageTotals(),before);
 }finally{fs.readFileSync=original;syncBuiltinESMExports();}
});
test('exact v32 bytes pass intake and stop at the injected pre-EVM boundary',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(ganache,'provider'),before=memoryStageTotals();
 Object.defineProperty(ganache,'provider',{configurable:true,value:()=>{throw Error('V27_REVIEW_STOP_BEFORE_EVM');}});
 try{
  await assert.rejects(()=>createFreshMemoryStage(),/V27_REVIEW_STOP_BEFORE_EVM/);
  assert.deepEqual(memoryStageTotals(),before);
 }finally{Object.defineProperty(ganache,'provider',descriptor);}
});
