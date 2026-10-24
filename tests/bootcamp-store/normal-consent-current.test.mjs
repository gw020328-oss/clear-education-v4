// Real SQLite/store/evaluator/procedure, synthetic source and chain ports.
// Exercise the owner handoff immediately after START_REVIEW, without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {normalSourceTarget} from '../../tools/bootcamp/normal-current-view.mjs';
import {explicitReviewTarget,assertExplicitConsents,waitForExplicitConsents,waitForNormalReviewConsents} from '../../tools/bootcamp/explicit-consents.mjs';
import {RuleError} from '../../src/policy/values.mjs';

async function fixture(t){
 let collections=0,armed=null,ticks=0;
 const f=await procedureFixture(t,{authority:{beforeVerify:async()=>{collections++;}}});
 f.configuration.now=()=>{if(armed)armed(++ticks);return f.time;};f.restart();
 const app=f.create();await f.complete(app);f.publish(app);f.setTime(START+200);
 const initial=f.view(app),sourceTarget=normalSourceTarget(f.store.getApplication(f.aliceContext,app));
 let snapshotUntil=f.time+5,refreshes=0,refreshHook=()=>{},readHook=()=>{},final=false,targets=0,beats=0;
 const counts={operations:0,procedure:0},controller=new AbortController();t.after(()=>controller.abort());
 f.setHook(()=>{if(f.time>=snapshotUntil)throw Error('BC_E3_REGISTERED_SNAPSHOT_EXPIRED');});
 const store={getOperationsProjection(...args){readHook('operations',++counts.operations,final);return f.store.getOperationsProjection(...args);},
  getProcedure(...args){readHook('procedure',++counts.procedure,final);return f.store.getProcedure(...args);}};
 const connection={async refresh(id){assert.equal(id,app);refreshes++;await Promise.resolve();refreshHook();snapshotUntil=f.time+5;}};
 let entered;const heartbeat=new Promise(r=>entered=r);
 const args={store,connection,context:f.aliceContext,applicationId:app,sourceTarget,signal:controller.signal,
  waitForConsents:async opts=>{await waitForExplicitConsents({...opts,pollMs:1});final=true;},
  heartbeat(){beats++;entered();},onTarget(target){targets++;assert.deepEqual(target,explicitReviewTarget(initial));}};
 return {f,app,args,initial,heartbeat,counts,controller,
  get refreshes(){return refreshes;},get collections(){return collections;},get targets(){return targets;},get beats(){return beats;},
  readHook(fn){readHook=fn;},refreshHook(fn){refreshHook=fn;},
  arm(fn=()=>f.setTime(f.time+1)){ticks=0;armed=n=>{if(n===2){armed=null;fn();}};},
  view:()=>f.view(app),start:()=>waitForNormalReviewConsents(args)};
}

for(const method of ['operations','procedure'])test(`v20 control: consent polling stops on a pure ${method} clock boundary`,async t=>{
 const x=await fixture(t),target=explicitReviewTarget(x.initial);
 const read=async()=>{if(method==='operations')x.arm();x.f.store.getOperationsProjection(x.f.aliceContext,x.app);
  await x.args.connection.refresh(x.app);if(method==='procedure')x.arm();return x.f.view(x.app);};
 await assert.rejects(waitForExplicitConsents({target,read,heartbeat(){assert.fail('old wait stops before heartbeat');},pollMs:1}),/BC_VIEW_STALE/);
 const v=x.view();assert.equal(v.applicationRevision,9);assert.equal(v.decisionHash,x.initial.decisionHash);
 assert.equal(v.evidence.current,true);assert.equal(v.evidence.validUntilExclusive,START+300);assert.equal(v.consent.records.length,0);
});

for(const site of ['initial-target','first-authority','first-procedure','later-authority','later-procedure','final-check'])
test(`START_REVIEW handoff survives one clock boundary at ${site} and awaits two separate consents`,async t=>{
 const x=await fixture(t);let crossed=false;
 x.readHook((method,n,final)=>{
  const hit=site==='initial-target'?method==='procedure'&&n===1:
   site==='first-authority'?method==='operations'&&n===1:site==='first-procedure'?method==='procedure'&&n===2:
   site==='later-authority'?method==='operations'&&n===2:site==='later-procedure'?method==='procedure'&&n===3:final;
  if(hit&&!crossed){crossed=true;x.arm();}
 });
 const pending=x.start();await Promise.race([x.heartbeat,pending]);assert.equal(x.view().consent.records.length,0);
 // These are two explicit test-user commands, outside the waiting code.
 x.f.consent(x.app);assert.equal(x.view().consent.bothCurrent,false);
 x.f.consent(x.app,x.f.operatorContext);const target=await pending;
 const v=x.view();assert.equal(crossed,true);assert.equal(assertExplicitConsents(v,target),true);
 assert.equal(v.consent.records.length,2);assert.equal(x.collections,4);assert.equal(x.targets,1);
 assert.equal(v.procedure.reviewCapAt,x.initial.procedure.reviewCapAt);assert.equal(v.evidence.validUntilExclusive,x.initial.evidence.validUntilExclusive);
 assert.equal(v.funding.amountAtoms,'100000000');assert.equal(v.funding.reservedAtoms,'100000000');
 assert.equal(x.counts.operations,x.refreshes+(['first-authority','later-authority'].includes(site)?1:0));
});

test('two consecutive projection conflicts stop without repeating chain refresh or producing consent',async t=>{
 const x=await fixture(t);x.readHook(method=>{if(method==='operations')x.arm();});
 await assert.rejects(x.start(),/BC_VIEW_STALE/);assert.equal(x.counts.operations,2);assert.equal(x.refreshes,0);assert.equal(x.beats,0);
 assert.equal(x.view().consent.records.length,0);
});

for(const kind of ['expiry','source-change','logout','wallet-change','clock-reversal','funding-change'])
test(`fresh post-refresh consent view rejects ${kind}`,async t=>{
 const x=await fixture(t);x.refreshHook(()=>{
  if(kind==='expiry')x.f.setTime(START+301);
  if(kind==='source-change')x.f.change(x.app,'activity-complete',{sourceHash:'0x'+'44'.repeat(32)});
  if(kind==='logout')x.f.service.logout(x.f.aliceContext);
  if(kind==='wallet-change')x.f.aliceContext.wallet=x.f.bob.address;
  if(kind==='clock-reversal')x.f.setTime(START+199);
  if(kind==='funding-change')x.f.setFull(false);
 });
 await assert.rejects(x.start(),/BC_NORMAL_REVIEW_REQUIRED|AUTH_REQUIRED|WALLET_CONTEXT_CHANGED|BC_CLOCK_REVERSED|BC_VIEW_STALE|BC_E3_PORT_CHANGED/);
 assert.equal(x.refreshes,1);assert.equal(x.beats,0);
});

test('source changes during a discarded read cannot become a fresh MET consent target',async t=>{
 const x=await fixture(t);let once=false;x.readHook(method=>{if(method==='operations'&&!once){once=true;x.arm(()=>x.f.change(x.app,'activity-complete',{sourceHash:'0x'+'55'.repeat(32)}));}});
 await assert.rejects(x.start(),/BC_NORMAL_REVIEW_REQUIRED/);assert.equal(x.view().consent.records.length,0);
 assert.equal(x.view().evidence.current,false);assert.equal(x.collections,4);
});

test('renewed decision and publication cannot reuse the original target or its two old consents',async t=>{
 const x=await fixture(t);x.f.consent(x.app);x.f.consent(x.app,x.f.operatorContext);const old=explicitReviewTarget(x.view());
 x.f.setHook(()=>{});await x.f.refreshEvidence(x.app,START+201);x.f.publish(x.app);
 assert.equal(x.view().consent.bothCurrent,false);assert.notEqual(x.view().consent.scopeHash,old.consentScopeHash);
 assert.throws(()=>assertExplicitConsents(x.view(),old),/BC_NORMAL_REVIEW_TARGET_CHANGED/);
 await assert.rejects(x.start(),/BC_NORMAL_SOURCE_CHANGED/);assert.equal(x.refreshes,0);assert.equal(x.targets,0);
});

test('caller stale revision, decision hash and clock-conflicted consent writes are never retried',async t=>{
 const x=await fixture(t),body=x.f.body(x.app,{value:'AGREE'});
 assert.throws(()=>x.f.store.recordReviewConsent(x.f.aliceContext,x.app,{...body,expectedRevision:body.expectedRevision-1},x.f.key()),/BC_VIEW_STALE/);
 assert.throws(()=>x.f.store.recordReviewConsent(x.f.aliceContext,x.app,{...body,targetDecisionHash:'0x'+'66'.repeat(32)},x.f.key()),/BC_DECISION_TARGET/);
 const current=x.f.body(x.app,{value:'AGREE'});x.arm();
 assert.throws(()=>x.f.store.recordReviewConsent(x.f.aliceContext,x.app,current,x.f.key()),/BC_VIEW_STALE/);
 assert.equal(x.view().consent.records.length,0);assert.equal(x.collections,4);
});

test('unrelated or awaited refresh failures propagate without a retry',async t=>{
 for(const error of [new Error('BC_VIEW_STALE'),new RuleError('BC_VIEW_STALE'),new RuleError('AUTH_REQUIRED')]){
  const x=await fixture(t);x.refreshHook(()=>{throw error;});
  await assert.rejects(x.start(),e=>e===error);assert.equal(x.refreshes,1);assert.equal(x.counts.operations,1);
  assert.equal(x.counts.procedure,1);assert.equal(x.view().consent.records.length,0);
 }
});

test('cancellation during refresh cannot finish the wait or emit consent',async t=>{
 const x=await fixture(t);x.refreshHook(()=>x.controller.abort());
 await assert.rejects(x.start(),/BC_NORMAL_CONSENT_WAIT_STOPPED/);assert.equal(x.counts.procedure,1);assert.equal(x.beats,0);
 assert.equal(x.view().consent.records.length,0);
});

for(const kind of ['expiry','logout','funding-change'])test(`final check after both consents still rejects ${kind}`,async t=>{
 const x=await fixture(t);x.f.consent(x.app);x.f.consent(x.app,x.f.operatorContext);
 x.args.waitForConsents=async opts=>{
  await waitForExplicitConsents({...opts,pollMs:1});
  if(kind==='expiry')x.f.setTime(START+301);
  if(kind==='logout')x.f.service.logout(x.f.aliceContext);
  if(kind==='funding-change')x.f.setFull(false);
 };
 await assert.rejects(x.start(),/BC_NORMAL_REVIEW_REQUIRED|AUTH_REQUIRED|BC_E3_REGISTERED_SNAPSHOT_EXPIRED/);
});

test('polling refreshes a five-second chain snapshot without extending the original review or source deadline',async t=>{
 const x=await fixture(t),pending=x.start();await Promise.race([x.heartbeat,pending]);
 x.f.setTime(START+206);assert.throws(x.view,/BC_E3_REGISTERED_SNAPSHOT_EXPIRED/);
 let refreshed;const next=new Promise(r=>refreshed=r);x.refreshHook(()=>refreshed());
 await Promise.race([next,pending]);await Promise.resolve();
 x.f.consent(x.app);x.f.consent(x.app,x.f.operatorContext);const target=await pending;
 assert.equal(target.reviewCapAt,x.initial.procedure.reviewCapAt);assert.equal(target.sourceValidUntilExclusive,x.initial.evidence.validUntilExclusive);
 assert.equal(x.view().consent.records.length,2);assert.ok(x.refreshes>=3);
});
