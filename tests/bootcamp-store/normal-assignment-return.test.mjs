import test from 'node:test';
import assert from 'node:assert/strict';
import {createNormalActivityReturn} from '../../tools/bootcamp/normal-activity-return.mjs';
import {commandFixture} from './moodle-command-fixture.mjs';
import {START} from './fixture.mjs';
import {validateNativeWorkflowCommand} from '../../src/embedded-wallet/moodle-native-workflow.mjs';

for(const revoke of [false,true])test('assignment return retains original intent, exact target and no reflection invocation; revoke='+revoke,async t=>{
 const c=await commandFixture(),stop=new AbortController(),app='application-assignment',calls=[],windows=new Map();
 const store={getApplication(){return{revision:1,status:'ACTIVE'};},issueBridgeRequest(_c,_a,body){calls.push(body.criterionId);return{record:{target:{requestId:'request-assignment'},applicationRevision:2}};},
  async collectBridge(_c,_a,_b,_key,{assertAuthority}){assertAuthority();calls.push('collected');}};
 let n=0;const options={store,mapping:{courseId:2,targets:{activity:{cmId:3,module:'page',instanceId:1},assignment:{cmId:4,instanceId:1},reflection:{cmId:5,forumId:3}}},
  origin:'https://127.0.0.1:9477',startedAt:START,now:()=>START,signal:stop.signal,sourceWindows:windows,commandScope:c.scope,
  authorize(ctx){c.scope.assertContext(ctx);return{role:ctx===c.contexts.PARTICIPANT?'participant':'operator'};},getBinding:()=>({app,user:c.contexts.PARTICIPANT}),key:()=> 'job-'+(++n),observeFailure(){}};
 const job=createNormalActivityReturn(options);t.after(()=>{stop.abort();c.owner.close();});
 assert.deepEqual(job.targets(c.contexts.PARTICIPANT,app).targets.map(t=>[t.criterionId,t.cmId,t.module]),[
  ['activity-complete',3,'page'],['assignment-submitted',4,'assign'],['reflection-topics',5,'forum']]);
 assert.equal(job.targets(c.contexts.COURSE_OPERATOR,app),null);
 assert.throws(()=>createNormalActivityReturn({...options,mapping:{...options.mapping,targets:{...options.mapping.targets,assignment:{cmId:5,instanceId:1}}}}),/BC_ACTIVITY_MAPPING/);
 const body={criterionId:'assignment-submitted',expectedRevision:1},command={method:'POST',path:'/bootcamp/v4/applications/'+app+'/source-refresh',body,idempotencyKey:'assignment-one'};
 const post=async(cmd=command,role='PARTICIPANT')=>{const input=await c.grant(cmd,role);return c.scope.run(input,()=>job.queue(input.context,app,cmd.body,cmd.idempotencyKey));};
 await assert.rejects(post(command,'COURSE_OPERATOR'),/FORBIDDEN/);
 await assert.rejects(post({...command,body:{...body,criterionId:'reflection-topics'},idempotencyKey:'not-ai'}),/BC_ACTIVITY_BODY/);
 assert.deepEqual(calls,[]);
 assert.equal((await post()).status,'QUEUED');
 if(revoke)await c.end();else c.advance(6);
 await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,revoke?[]:['assignment-submitted','collected']);
 assert.equal(windows.has('reflection-topics'),false);assert.equal(windows.has('activity-complete'),false);
});
test('return command rejects arbitrary condition IDs and retains legacy page input',()=>{
 const old={action:'refresh-activity',applicationId:'application-test',expectedRevision:1,idempotencyKey:'test-one'};
 assert.deepEqual(validateNativeWorkflowCommand(old),old);
 assert.equal(validateNativeWorkflowCommand({...old,criterionId:'assignment-submitted'}).criterionId,'assignment-submitted');
 for(const criterionId of ['reflection-topics','python-basic-certificate','arbitrary',null])assert.throws(()=>validateNativeWorkflowCommand({...old,criterionId}));
});

for(const criterionId of ['activity-complete','assignment-submitted'])for(const clock of ['wall','monotonic'])test('source original '+clock+' horizon is exclusive for '+criterionId,async t=>{
 const c=await commandFixture();t.after(()=>c.owner.close());c.limitAuthority(START+20);
 const app='application-horizon',command={method:'POST',path:'/bootcamp/v4/applications/'+app+'/source-refresh',body:{criterionId,expectedRevision:1},idempotencyKey:'horizon-one'};
 const input=await c.grant(command);c.advance(2); // Reservation must not restart the source's original 20-second horizon.
 const authority=await c.scope.run(input,()=>{const fence=c.scope.captureActivityAuthority(app);c.scope.memoryCommitted();return fence;});
 c.advance(4);authority(); // Original POST five-second lease ended; source still valid.
 if(clock==='wall')c.advance(14);else c.drift(14000);
 assert.throws(authority,/MOODLE_ACTIVITY_AUTHORITY/);
 await assert.rejects(c.scope.run(input,()=>assert.fail('consumed command must not run')),/MOODLE_COMMAND_UNAVAILABLE|MOODLE_COMMAND_BINDING/);
});
