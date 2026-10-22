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
test('exact v11 bytes pass intake and stop at the injected pre-EVM boundary',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(ganache,'provider'),before=memoryStageTotals();
 Object.defineProperty(ganache,'provider',{configurable:true,value:()=>{throw Error('V11_REVIEW_STOP_BEFORE_EVM');}});
 try{
  await assert.rejects(()=>createFreshMemoryStage(),/V11_REVIEW_STOP_BEFORE_EVM/);
  assert.deepEqual(memoryStageTotals(),before);
 }finally{Object.defineProperty(ganache,'provider',descriptor);}
});
