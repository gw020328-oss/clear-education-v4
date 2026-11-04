import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import {consumeReviewedV62Sources} from '../../../src/hackathon-test-vault/reviewed-source-v62.mjs';
import {createFreshMemoryStage,memoryStageTotals} from '../../../src/hackathon-test-vault/memory-stage-harness.mjs';

const root=new URL('../../../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const recordPath='specs/bootcamp/hackathon-test-preview-fence-integration-v1.json';
const record=JSON.parse(read(recordPath));
const consume=()=>consumeReviewedV62Sources(JSON.parse(read('specs/bootcamp/hackathon-test-memory-source-intake-v6.json')));
const git=(...args)=>execFileSync('git',args,{cwd:root});
const tableSha=table=>sha(JSON.stringify(Object.fromEntries(Object.entries(table).sort(([a],[b])=>a<b?-1:a>b?1:0))));

test('v62 candidate commit contains every declared source, wallet build input and preservation artifact',()=>{
 const current=consume(),scope=current.currentSourceCandidateScope,head=current.currentSourceCandidateHead;
 assert.equal(head,'c171b3d9e4370a0b3dece805fe92ca9d0e63c5a8');
 assert.equal(head,record.candidateHead);
 assert.deepEqual(scope,record.candidateScope);
 assert.equal(scope.wholeRepository,false);
 assert.equal(git('cat-file','-t',head).toString().trim(),'commit');
 git('merge-base','--is-ancestor',head,'HEAD');
 assert.equal(Object.keys(current.sources).length,211);
 assert.equal(Object.keys(current.productWalletSources).length,24);
 assert.equal(tableSha(current.sources),scope.sourceManifestSha256);
 assert.equal(tableSha(current.productWalletSources),scope.productWalletManifestSha256);
 const paths=new Map();
 for(const table of [current.sources,current.productWalletSources,scope.additionalArtifacts]){
  for(const [path,expected]of Object.entries(table)){
   if(paths.has(path))assert.equal(paths.get(path),expected,'overlapping tables must agree: '+path);
   paths.set(path,expected);
  }
 }
 assert.equal(paths.size,239);
 for(const [path,expected]of paths){
  assert.equal(sha(git('show',head+':'+path)),expected,'candidate blob: '+path);
  assert.equal(sha(read(path)),expected,'current bytes: '+path);
 }
 for(const path of [
  'src/bootcamp/execution-operations.mjs','src/bootcamp/execution-authority.mjs',
  'web/src/bootcamp/team-entry.js','tools/embedded-wallet/build-product.mjs',
 ])assert.ok(paths.has(path),'explicit integration boundary: '+path);
 // The new guard and its consumer cannot claim to be blobs of their own predecessor.
 for(const path of [recordPath,'src/hackathon-test-vault/reviewed-source-v62.mjs',
  'src/hackathon-test-vault/memory-stage-harness.mjs','tests/hackathon-test-vault/e5/preservation.mjs']){
  assert.equal(paths.has(path),false,'separately pinned control file: '+path);
 }
 const preview=JSON.parse(read('specs/bootcamp/hackathon-test-operator-condition-preview-source-delta-v1.json'));
 assert.notEqual(head,preview.candidateHead);
 assert.notEqual(sha(git('show',preview.candidateHead+':src/bootcamp/execution-operations.mjs')),
  current.sources['src/bootcamp/execution-operations.mjs'],'the old preview-only provenance lacks the fence change');
});

for(const [path,code]of [
 [recordPath,'STAGE_INTEGRATION_PIN'],
 ['src/hackathon-test-vault/reviewed-source-v62.mjs','STAGE_SOURCE_PIN'],
])test('v62 provenance rejects changed metadata before creating a runtime: '+path,async()=>{
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

test('memory runtime forwards the integrated candidate and immutable limited scope without payment',async t=>{
 const before=memoryStageTotals(),stage=await createFreshMemoryStage();
 t.after(()=>stage.close());
 assert.equal(stage.pin.currentCompatibleSourceHead,record.candidateHead);
 assert.deepEqual(stage.pin.currentCompatibleSourceScope,record.candidateScope);
 assert.ok(Object.isFrozen(stage.pin.currentCompatibleSourceScope));
 assert.ok(Object.isFrozen(stage.pin.currentCompatibleSourceScope.additionalArtifacts));
 const after=memoryStageTotals();
 for(const metric of ['signaturesGenerated','accepts','claims','actualSources','externalRpc','persistentChains']){
  assert.equal(after[metric],before[metric],metric);
 }
});
