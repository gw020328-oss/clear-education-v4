import test from 'node:test';
import assert from 'node:assert/strict';
import {activityWriteAllowed} from '../../tools/bootcamp/live-context.mjs';
import {storeFixture} from './fixture.mjs';
import {commandFixture} from './moodle-command-fixture.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {requireRule as check} from '../../src/policy/values.mjs';

test('former first-bind guard rejects a saved application; fixed guard reaches real participant binding once',async t=>{
 const f=await storeFixture(t),app=f.create(),other=f.create();
 const commands=await commandFixture({authentication:f.service,contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
 const ui=createNormalUiSession({authentication:f.service,participantWallet:f.aliceContext.wallet.toLowerCase(),operatorWallet:f.operatorContext.wallet.toLowerCase(),getApplication:(c,a)=>f.store.getApplication(c,a),now:()=>f.time,commandScope:commands.scope});
 t.after(()=>{ui.close();commands.owner.close();});let bound=null;
 const path='/bootcamp/v4/applications/'+app+'/source-session';
 const old=path==='/bootcamp/v1/applications'||bound&&[path].includes(path);
 assert.throws(()=>check(old,'BC_ACTIVITY_MODE'),/BC_ACTIVITY_MODE/);
 const bind=async(role='PARTICIPANT',target=app,key='bind-one')=>{
  const input=await commands.grant({method:'POST',path:'/bootcamp/v4/applications/'+target+'/source-session',body:{},idempotencyKey:key},role);
  return commands.scope.run(input,()=>{check(activityWriteAllowed(input.command.path,bound),'BC_ACTIVITY_MODE');ui.bindParticipant(input.context,target,{dataMode:'RECLAIM_SIGNED_RECORD'});bound=target;commands.scope.memoryCommitted();});
 };
 await assert.rejects(bind('COURSE_OPERATOR'),/FORBIDDEN/);assert.equal(bound,null);
 await assert.rejects(bind('PARTICIPANT','application-missing','missing'),/BC_NOT_FOUND/);assert.equal(bound,null);
 await bind();assert.equal(bound,app);assert.equal(ui.participant().wallet,f.aliceContext.wallet);
 await assert.rejects(bind('PARTICIPANT',other,'foreign-binding'),/BC_ACTIVITY_MODE/);
 await assert.rejects(bind('PARTICIPANT',app,'bind-twice'),/BC_UI_ALREADY_BOUND/);
 assert.equal(f.counts().evidence,0);
});
test('first binding exception admits no source collection, payment, signature or malformed path',()=>{
 const app='application-one',base='/bootcamp/v4/applications/'+app;
 assert.equal(activityWriteAllowed(base+'/source-session',null),true);
 for(const path of [base+'/source-refresh',base+'/certificate-start',base+'/source-signature',base+'/reflection-approval',base+'/source-session?x=1',base+'/source-session/',base+'/../source-session','/bootcamp/v3/applications/'+app+'/review-consents'])assert.equal(activityWriteAllowed(path,null),false);
 assert.equal(activityWriteAllowed(base+'/source-refresh',app),true);
 assert.equal(activityWriteAllowed('/bootcamp/v4/applications/application-other/source-session',app),false);
});
