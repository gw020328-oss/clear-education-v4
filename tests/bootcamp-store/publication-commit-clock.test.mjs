import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureFixture,START} from './procedure-fixture.mjs';

test('publication crosses a second without replaying its command or extending its original windows',async t=>{
 let f,armed=false,writes=0,publications=0;
 f=await procedureFixture(t,{fault(point){if(!armed)return;
  if(point==='e3-after-publication')publications++;
  if(point==='e3-after-command'){writes++;f.setTime(f.time+1);}
 }});
 const app=f.create();await f.complete(app);const body=f.body(app),key=f.key(),before=f.counts();armed=true;
 const result=f.store.publishReview(f.aliceContext,app,body,key);armed=false;
 const view=f.view(app);
 assert.equal(writes,1);assert.equal(publications,1);assert.equal(f.counts().commands,before.commands+1);
 assert.equal(result.record.committedAt,START);assert.equal(view.procedure.firstStartedAt,START);
 assert.equal(view.procedure.publishedAt,START);assert.equal(view.procedure.confirmAt,START+120);
 assert.equal(view.procedure.reviewCapAt,START+600);assert.equal(view.evidence.validUntilExclusive,START+300);
 assert.equal(f.store.publishReview(f.aliceContext,app,body,key).record.operationId,result.record.operationId);
 assert.equal(f.counts().commands,before.commands+1);assert.equal(f.view(app).procedure.id,view.procedure.id);
});

for(const change of ['expiry','auth-lease','query-lease','raw-lease','lease-change','source-change','funding-change','logout','operator-scope','clock-reversal'])
test('publication commit rejects '+change+' and rolls back its only provisional publication',async t=>{
 let f,app,armed=false,writes=0,scope=true;
 f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-command'){
  writes++;f.setTime(change==='expiry'?START+300:change==='clock-reversal'?f.time-1:f.time+1);
  if(change==='source-change')f.change(app,'activity-complete',{rawAvailable:false});
  if(change==='lease-change')f.change(app,'activity-complete',{leaseId:'changed-lease'});
  if(change==='funding-change')f.setFull(false);
  if(change==='logout')f.service.logout(f.aliceContext);
  if(change==='operator-scope')scope=false;
 }}});
 f.configuration.resolveOperatorBindings=()=>scope?[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}]:[];f.restart();
 app=f.create();
 const leaseField={'auth-lease':'authExpiresAt','query-lease':'queryExpiresAt','raw-lease':'rawExpiresAt'}[change];
 // The source observation already carries this deadline before publication.
 if(leaseField){f.request(app);f.change(app,'activity-complete',{[leaseField]:START+1,rawExpiresAt:START+1});}
 await f.complete(app);
 const context=change==='operator-scope'?f.operatorContext:f.aliceContext,body=f.body(app,{},context),before=f.counts();armed=true;
 assert.throws(()=>f.store.publishReview(context,app,body,f.key()),/BC_|AUTH_REQUIRED|FORBIDDEN/);armed=false;
 assert.equal(writes,1);assert.equal(f.counts().commands,before.commands);
 scope=true;f.setTime(Math.max(f.time,START+1));const view=f.view(app,f.operatorContext);
 assert.equal(view.procedure.id,null);assert.equal(view.procedure.publishedAt,null);
});

test('republishing cannot cross the original review cap even with fresh evidence',async t=>{
 let f,armed=false,writes=0;
 f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-command'){writes++;f.setTime(START+600);}}});
 const app=f.create();await f.complete(app);f.publish(app);const old=f.view(app).procedure;
 await f.refreshEvidence(app,START+500);f.setTime(START+599);
 const body=f.body(app),before=f.counts();armed=true;
 assert.throws(()=>f.store.publishReview(f.aliceContext,app,body,f.key()),/BC_E3_REVIEW_CLOSED/);armed=false;
 assert.equal(writes,1);assert.equal(f.counts().commands,before.commands);
 const view=f.view(app);assert.equal(view.procedure.id,old.id);assert.equal(view.procedure.publishedAt,old.publishedAt);
 assert.equal(view.procedure.reviewCapAt,START+600);assert.equal(view.procedure.reservationReleased,false);
});

for(const crossings of [1,2])test('publication final validation crosses '+crossings+' seconds with one command only',async t=>{
 let f,armed=false,writes=0,checks=0;
 f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-command')writes++;}});
 const app=f.create();await f.complete(app);const body=f.body(app),before=f.counts();
 f.setHook(name=>{if(armed&&writes&&name==='funding'&&++checks<=crossings)f.setTime(f.time+1);});armed=true;
 const run=()=>f.store.publishReview(f.aliceContext,app,body,f.key());
 if(crossings===1)run();else assert.throws(run,/BC_VIEW_STALE/);armed=false;f.setHook(()=>{});
 assert.equal(checks,2);assert.equal(writes,1);assert.equal(f.counts().commands,before.commands+(crossings===1?1:0));
 assert.equal(f.view(app).procedure.publishedAt,crossings===1?START:null);
});

test('publication still rejects a stale caller CAS before any publication or command',async t=>{
 let armed=false,writes=0;
 const f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-command')writes++;}});
 const app=f.create();await f.complete(app);const body=f.body(app);await f.refreshEvidence(app,START+1);
 const before=f.counts();armed=true;
 assert.throws(()=>f.store.publishReview(f.aliceContext,app,body,f.key()),/BC_VIEW_STALE/);
 assert.equal(writes,0);assert.equal(f.counts().commands,before.commands);assert.equal(f.view(app).procedure.id,null);
});

for(const change of ['source','funding','logout'])test('publication final recheck still rejects '+change+' after a forward tick',async t=>{
 let f,armed=false,writes=0,checks=0;
 f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-command')writes++;}});
 const app=f.create();await f.complete(app);const body=f.body(app),before=f.counts();
 f.setHook(name=>{if(!armed||!writes||name!=='funding')return;
  if(++checks===1)f.setTime(f.time+1);
  if(checks===2){
   if(change==='source')f.change(app,'activity-complete',{rawAvailable:false});
   if(change==='funding')f.setFull(false);
   if(change==='logout')f.service.logout(f.aliceContext);
  }
 });armed=true;
 assert.throws(()=>f.store.publishReview(f.aliceContext,app,body,f.key()),/BC_|AUTH_REQUIRED/);
 armed=false;f.setHook(()=>{});
 assert.equal(checks,2);assert.equal(writes,1);assert.equal(f.counts().commands,before.commands);
 assert.equal(f.view(app,f.operatorContext).procedure.id,null);
});
