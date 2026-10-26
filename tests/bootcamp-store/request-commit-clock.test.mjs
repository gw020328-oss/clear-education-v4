import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture,START} from './fixture.mjs';

async function fixture(t,change='forward'){
 const f=await storeFixture(t),app=f.create(),body={criterionId:'activity-complete',expectedRevision:f.view(app).revision},key=f.key();let ticks=0,armed=false;
 f.configuration.now=()=>{
  if(armed){ticks++;
   if(ticks===2){
    if(change==='source')f.change(app,'activity-complete',{rawAvailable:false});
    if(change==='logout')f.service.logout(f.aliceContext);
    f.setTime(f.time+(change==='expiry'?900:change==='reverse'?-1:1));
   }
   if(change==='second-conflict'&&[3,5].includes(ticks))f.setTime(f.time+1);
  }
  return f.time;
 };
 f.restart();const before=f.counts();armed=true;
 return {f,app,body,key,before,run:()=>f.store.issueRequest(f.aliceContext,app,body,key),disarm(){armed=false;}};
}
test('request issuance crosses a second with its original nonce, issue time and expiry',async t=>{
 const x=await fixture(t),result=x.run();x.disarm();const r=x.f.store.getRequest(x.f.aliceContext,x.app,result.record.target.requestId).record;
 assert.equal(r.issuedAt,START);assert.equal(r.expiresAt,START+900);
 assert.equal(x.f.counts().requests,x.before.requests+1);assert.equal(x.f.counts().commands,x.before.commands+1);
 assert.deepEqual(x.run(),result);assert.equal(x.f.counts().requests,x.before.requests+1);
});
for(const change of ['source','expiry','logout','reverse','second-conflict'])test('request issuance '+change+' rolls back request and command',async t=>{
 const x=await fixture(t,change);assert.throws(x.run,/BC_|AUTH_REQUIRED/);x.disarm();
 assert.equal(x.f.counts().requests,x.before.requests);assert.equal(x.f.counts().commands,x.before.commands);
});
