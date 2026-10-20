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
