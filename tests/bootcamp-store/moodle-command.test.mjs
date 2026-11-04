import test from 'node:test';
import assert from 'node:assert/strict';
import {commandFixture,createCommand,hex} from './moodle-command-fixture.mjs';
import {storeFixture} from './fixture.mjs';

test('same cookie in another tab cannot reserve; concurrent requests execute one real store mutation',async t=>{
 const f=await storeFixture(t),x=await commandFixture({authentication:f.service,contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
 t.after(()=>x.owner.close());let actors=0;
 f.configuration.commandScope=x.scope;
 f.configuration.authentication={...f.service,authorizeWorkflow(c,w){actors++;x.scope.assertContext(c);return f.service.authorizeWorkflow(c,w);}};f.restart();
 const input=await x.grant(createCommand());
 await assert.rejects(x.scope.run({...input,commandBinding:hex(999)},()=>{throw Error('MUST_NOT_DISPATCH');}),/BINDING/);
 let mutations=0;
 const work=()=>x.scope.business(()=>{mutations++;return f.store.createApplication(f.aliceContext,{},input.command.idempotencyKey);});
 const results=await Promise.allSettled([x.scope.run(input,work),x.scope.run(input,work)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(mutations,1);assert(actors>=2);
 const app=results.find(r=>r.status==='fulfilled').value.record.applicationId;
 assert.equal(f.store.getApplication(f.aliceContext,app).applicationId,app);
 await assert.rejects(x.scope.run(input,work),/BINDING/);
});

test('a lost response after actual store COMMIT keeps the grant spent and existing receipt replay is read without new mutation',async t=>{
 const f=await storeFixture(t),x=await commandFixture({authentication:f.service,contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
 t.after(()=>x.owner.close());f.configuration.commandScope=x.scope;f.restart();
 const input=await x.grant(createCommand('native-lost'));let saved;
 await assert.rejects(x.scope.run(input,()=>{saved=x.scope.business(()=>f.store.createApplication(f.aliceContext,{},'native-lost'));throw Error('RESPONSE_LOST');}),/RESPONSE_LOST/);
 await assert.rejects(x.scope.run(input,()=>{}),/BINDING/);
 assert.equal(f.store.getOperation(f.aliceContext,saved.record.applicationId,saved.record.operationId).record.operationId,saved.record.operationId);
});

for(const changed of ['wall','monotonic','lease','abort','end','context','body'])test('reserved command is fenced after '+changed,async t=>{
 const x=await commandFixture();t.after(()=>x.owner.close());const input=await x.grant(createCommand());
 const r=x.owner.reserveCommand(input);r.assert();r.assertContext(input.context);
 if(changed==='wall')x.advance(5);if(changed==='monotonic')x.drift(5000);if(changed==='lease')x.invalidate();
 if(changed==='abort')x.signal.abort();if(changed==='end')await x.end();
 if(changed==='context')input.context.csrf=hex(500);if(changed==='body')input.command.body.changed=true;
 assert.throws(()=>r.assert());r.fail();assert.throws(()=>r.finish());
});

test('a replacement Moodle session cannot authorize the connected original intent',async t=>{
 const x=await commandFixture();t.after(()=>x.owner.close());x.replaceSession();await assert.rejects(x.grant(createCommand()),/IDENTITY/);
});

test('a store savepoint error followed by invalidation-only outer COMMIT cannot consume the grant as success',async t=>{
 const f=await storeFixture(t),x=await commandFixture({authentication:f.service,contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
 t.after(()=>x.owner.close());const a=f.create();f.configuration.commandScope=x.scope;f.restart();
 const v=f.store.getOperationsProjection(f.aliceContext,a);
 const body={expectedRevision:1,expectedLedgerSequence:v.ledgerSequence+1,targetDecisionId:v.decisionId,
  targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,value:'AGREE'};
 const command={method:'POST',path:'/bootcamp/v3/applications/'+a+'/review-consents',body,idempotencyKey:'native-savepoint-error'};
 const input=await x.grant(command);
 await assert.rejects(x.scope.run(input,()=>x.scope.business(()=>f.store.recordReviewConsent(f.aliceContext,a,body,command.idempotencyKey))),/BC_VIEW_STALE/);
 assert.throws(()=>x.lastReservation.finish(),/NOT_COMMITTED/);
 await assert.rejects(x.scope.run(input,()=>{}),/BINDING/);
 assert.equal(f.store.getOperationsProjection(f.aliceContext,a).ledgerSequence,v.ledgerSequence);
});
