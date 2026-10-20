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
test('v5 pins all 36 current sources and preserves historical v1-v4/component bytes',()=>{
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v5.json';
 assert.equal(sha(read(path)),'7b89a6c9f73797f0a6faff890f8a097f18dd3f91730eddc7f2cc56730c0f17ff');
 const v5=JSON.parse(read(path)),tables=['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256'];
 assert.deepEqual(tables.map(k=>Object.keys(v5[k]).length),[8,19,6,3]);
 for(const table of tables)for(const [p,h]of Object.entries(v5[table])){
  assert.equal(sha(read(p)),h,p);
  assert.equal(sha(execFileSync('git',['show',`${v5.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
 }
 const historical=['specs/bootcamp/hackathon-test-boundary-intake-v1.json','specs/bootcamp/hackathon-test-consumer-pins-v1.json',...Array.from({length:3},(_,i)=>`specs/bootcamp/hackathon-test-memory-source-intake-v${i+2}.json`),'docs/hackathon-test-vault/e5b/source-pins.json','docs/hackathon-test-vault/e5b/source-pins-v2.json','docs/hackathon-test-vault/e5b/normal-source-pins.json'];
 for(const p of historical)assert.deepEqual(read(p),execFileSync('git',['show',`8851775fa4f34e1af0a858436cf3dea648eda9af:${p}`],{cwd:root}),p);
 const v4=JSON.parse(read(v5.previousCompatibilityRecord.path));
 for(const [p,h]of Object.entries({...v4.e3ArtifactSha256,...v4.additionalSourceArtifactSha256}))assert.equal(sha(execFileSync('git',['show',`${v4.currentSourceCandidateHead}:${p}`],{cwd:root})),h,p);
});
