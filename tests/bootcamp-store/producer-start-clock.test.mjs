import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture} from './fixture.mjs';

test('collection preflight crosses one second without replaying its producer',async t=>{
 let calls=0;const f=await storeFixture(t,{authority:{beforeVerify(){calls++;}},store:{onCollectionFailure(event){t.diagnostic(JSON.stringify({event,producerCalls:calls}));}}}),app=f.create(),r=f.request(app);let ticks=0,armed=false;
 f.configuration.now=()=>{if(armed&&++ticks===6)f.setTime(f.time+1);return f.time;};f.restart();armed=true;
 const result=await f.store.collect(f.aliceContext,app,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key());armed=false;
 assert.ok(result.record.target.evidenceId);assert.equal(calls,1);assert.equal(f.counts().evidence,1);
});
for(const change of ['source','logout','expiry','reverse','second-conflict'])test('collection preflight '+change+' leaves the producer and nonce untouched',async t=>{
 let calls=0;const events=[],f=await storeFixture(t,{authority:{beforeVerify(){calls++;}},store:{onCollectionFailure:e=>events.push(e)}}),app=f.create(),r=f.request(app);let ticks=0,armed=false;
 f.configuration.now=()=>{
  if(armed){ticks++;
   if(ticks===6){
    if(change==='source')f.change(app,'activity-complete',{rawAvailable:false});
    if(change==='logout')f.service.logout(f.aliceContext);
    f.setTime(f.time+(change==='expiry'?900:change==='reverse'?-1:1));
   }
   if(change==='second-conflict'&&[8,11].includes(ticks))f.setTime(f.time+1);
  }return f.time;
 };f.restart();const before=f.counts();armed=true;
 await assert.rejects(f.store.collect(f.aliceContext,app,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/BC_|AUTH_REQUIRED/);armed=false;
 assert.equal(calls,0);assert.equal(f.counts().evidence,0);assert.equal(f.counts().commands,before.commands);
 assert.equal(events.length,1);assert.equal(events[0].phase,'PREFLIGHT');
});
test('actual producer error is distinguished and its arbitrary data is redacted without a retry',async t=>{
 let calls=0;const events=[],f=await storeFixture(t,{authority:{beforeVerify(){calls++;throw Error('PRIVATE_SYNTHETIC_SENTINEL');}},store:{onCollectionFailure(e){events.push(e);throw Error('observer failure');}}}),app=f.create();
 await assert.rejects(f.accept(app),/BC_PRODUCER_FAILED/);assert.equal(calls,1);assert.equal(f.counts().evidence,0);
 assert.deepEqual(events,[{phase:'PRODUCER',errorKind:'ERROR',code:'UNCLASSIFIED',codeBasis:'REDACTED',causes:[],causeChainTruncated:false}]);
 assert.equal(JSON.stringify(events).includes('PRIVATE_SYNTHETIC_SENTINEL'),false);
});
