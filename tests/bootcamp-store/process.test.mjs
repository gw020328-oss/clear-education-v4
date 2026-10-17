import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {storeFixture} from './fixture.mjs';
async function child(t,directory,crashStage){
  const p=fork(new URL('./worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
  t.after(()=>{if(p.exitCode===null)p.kill('SIGKILL');});
  const ready=once(p,'message');p.send({action:'prepare',directory,crashStage});assert.equal((await ready)[0].ready,true);return p;
}
for(const crashStage of ['after-nonce','after-evidence','after-decision','after-command'])test(`SIGKILL ${crashStage}: hot journal recovery exposes no partial acceptance`,{timeout:15000},async t=>{
  const f=await storeFixture(t),a=f.create(),r=f.request(a),before=f.counts(),p=await child(t,f.directory,crashStage);
  const body={requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},key=f.key();
  const exited=once(p,'exit');p.send({action:'collect',context:f.aliceContext,applicationId:a,body,key});assert.deepEqual(await exited,[null,'SIGKILL']);
  f.restart();assert.deepEqual(f.counts(),before);assert.equal(f.store.getRequest(f.aliceContext,a,body.requestId).status,'PENDING');
  assert.equal((await f.store.collect(f.aliceContext,a,body,key)).current,true);assert.equal(f.counts().evidence,1);
});
test('independent processes contend for same nonce and SQLite CAS: exactly one receipt', {timeout:15000},async t=>{
  const f=await storeFixture(t),a=f.create(),r=f.request(a),p1=await child(t,f.directory),p2=await child(t,f.directory);
  const body={requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision};
  const results=await Promise.all([p1,p2].map((p,i)=>{const done=once(p,'message');p.send({action:'collect',context:f.aliceContext,applicationId:a,body,key:`process-${i}`});return done.then(r=>r[0]);}));
  assert.equal(results.filter(r=>r.ok).length,1);assert.match(results.find(r=>!r.ok).code,/BC_REVISION_CONFLICT/);
  assert.equal(f.counts().evidence,1);assert.equal(f.store.getRequest(f.aliceContext,a,body.requestId).status,'CONSUMED');
});
