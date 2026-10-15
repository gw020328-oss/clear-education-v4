import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,rmSync,readFileSync,chmodSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fixture,h } from './fixture.mjs';
import { openReviewLedger } from '../../src/product-workflow/review-ledger.mjs';
import { WORKFLOW_VERSION } from '../../src/product-workflow/contract.mjs';
function setup(t){const f=fixture(),directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-workflow-test-')));let time=100,ledger;
 const environment={instanceId:f.snapshot.binding.instanceId,origin:'https://clear.example.invalid',mode:'SYNTHETIC'};
 const open=()=>openReviewLedger({directory,environment,now:()=>time});ledger=open();ledger.pinLatest(f.snapshot);
 t.after(()=>{ledger.close();rmSync(directory,{recursive:true,force:true});});
 return {...f,directory,environment,get ledger(){return ledger;},restart(){ledger.close();ledger=open();},setTime(value){time=value;}};
}
const summary=(run,value='first')=>({version:WORKFLOW_VERSION,runContextHash:run.contextHash,resultHash:h(value),reviewStatus:'NEEDS_REVIEW',outcome:'UNDETERMINED',reasons:[{fieldId:'image-type',code:'IMAGE_NOT_DECODED'}]});
test('response loss, duplicate completion and process restart return the same immutable receipt',t=>{
 const f=setup(t),a=f.ledger.begin(f.snapshot,{idempotencyKey:'start-a'}),again=f.ledger.begin(f.snapshot,{idempotencyKey:'start-a'});
 assert.deepEqual(again,a);const s=summary(a),receipt=f.ledger.complete(a.context.runId,s);assert.equal(receipt.state,'ACCEPTED');
 f.restart();assert.deepEqual(f.ledger.complete(a.context.runId,s),receipt);assert.deepEqual(f.ledger.get(a.context.runId),receipt);
 assert.throws(()=>f.ledger.complete(a.context.runId,summary(a,'changed')),/RESULT_CONFLICT/);
 assert.equal(f.ledger.cancel(a.context.runId).state,'ACCEPTED');
 const bytes=readFileSync(join(f.directory,'workflow.sqlite'));assert.ok(!bytes.includes(Buffer.from('SYNTHETIC\nExample')));assert.ok(!bytes.includes(f.files[0].bytes));
});
test('same idempotency key cannot replace the request or re-run cancelled work',t=>{
 const f=setup(t),a=f.ledger.begin(f.snapshot,{idempotencyKey:'start-a',runId:'run-a'});f.ledger.cancel('run-a');
 assert.equal(f.ledger.begin(f.snapshot,{idempotencyKey:'start-a',runId:'run-a'}).state,'CANCELLED');
 assert.throws(()=>f.ledger.begin(f.snapshot,{idempotencyKey:'start-a',runId:'run-b'}),/IDEMPOTENCY_CONFLICT/);
 assert.throws(()=>f.ledger.complete('run-a',summary(a)),/RESULT_STALE/);
});
test('new retry supersedes the older run and late results cannot overwrite it',t=>{
 const f=setup(t),old=f.ledger.begin(f.snapshot,{idempotencyKey:'a',runId:'run-a'}),fresh=f.ledger.begin(f.snapshot,{idempotencyKey:'b',runId:'run-b'});
 assert.equal(fresh.context.attempt,2);assert.equal(f.ledger.get('run-a').state,'SUPERSEDED');assert.throws(()=>f.ledger.complete('run-a',summary(old)),/RESULT_STALE/);
 assert.equal(f.ledger.complete('run-b',summary(fresh)).state,'ACCEPTED');
});
test('source/plan policy update needs a new agreement and rejects prior results',t=>{
 const f=setup(t),old=f.ledger.begin(f.snapshot,{idempotencyKey:'a',runId:'run-a'}),next=structuredClone(f.snapshot);
 next.workflowRevision++;next.sourceBundleRevision++;next.sourceBundleHash=h('new-source');
 assert.throws(()=>f.ledger.pinLatest(next),/NEW_AGREEMENT_REQUIRED/);next.agreementHash=h('new-ack');f.ledger.pinLatest(next);
 assert.equal(f.ledger.get('run-a').state,'SUPERSEDED');assert.throws(()=>f.ledger.complete('run-a',summary(old)),/RESULT_STALE/);
 assert.throws(()=>f.ledger.pinLatest(f.snapshot),/STALE/);
});
test('withdrawal invalidates all app runs and cannot revive by pinning old revision',t=>{
 const f=setup(t);f.ledger.begin(f.snapshot,{idempotencyKey:'a',runId:'run-a'});f.ledger.invalidate(f.snapshot.binding.applicationId);
 assert.equal(f.ledger.get('run-a').current,false);assert.throws(()=>f.ledger.pinLatest(f.snapshot),/REVISION_CONFLICT/);
});
test('restart preserves running state and timeout never dispatches another model call',t=>{
 const f=setup(t),a=f.ledger.begin(f.snapshot,{idempotencyKey:'a',runId:'run-a'});f.restart();assert.equal(f.ledger.get('run-a').state,'RUNNING');
 f.setTime(a.expiresAt);assert.equal(f.ledger.get('run-a').state,'TIMED_OUT');assert.throws(()=>f.ledger.complete('run-a',summary(a)),/RESULT_STALE/);
 assert.equal(f.ledger.begin(f.snapshot,{idempotencyKey:'a',runId:'run-a'}).state,'TIMED_OUT');
});
test('environment mismatch and same revision mutation do not reset durable state',t=>{
 const f=setup(t);assert.throws(()=>f.ledger.pinLatest({...f.snapshot,inputHash:h('changed')}));
 assert.throws(()=>openReviewLedger({directory:f.directory,environment:{...f.environment,instanceId:'another-instance'}}),/DB_ENVIRONMENT/);
 const altered=structuredClone(f.snapshot);altered.modelVersion='another-model';assert.throws(()=>f.ledger.pinLatest(altered),/REVISION_CONFLICT/);
});
test('two independent completion processes accept exactly one changed result',async t=>{
 const f=setup(t),a=f.ledger.begin(f.snapshot,{idempotencyKey:'a',runId:'run-a'}),url=new URL('../../src/product-workflow/review-ledger.mjs',import.meta.url).href;
 const code=`import {openReviewLedger} from ${JSON.stringify(url)}; const input=JSON.parse(process.argv[1]);const s=openReviewLedger({...input.config,now:()=>101});try{s.complete('run-a',input.summary);console.log('ACCEPTED');}catch(e){console.log(e.message);}finally{s.close();}`;
 const child=async value=>{const p=spawn(process.execPath,['--input-type=module','-e',code,JSON.stringify({config:{directory:f.directory,environment:f.environment},summary:summary(a,value)})],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',b=>{output+=b;});await once(p,'exit');return output.trim();};
 const outcomes=await Promise.all([child('one'),child('two')]);assert.deepEqual(outcomes.sort(),['ACCEPTED','WORKFLOW_RESULT_CONFLICT']);
});

test('an application revision change also invalidates a pending run in another method scope',t=>{
 const f=setup(t),old=f.ledger.begin(f.snapshot,{idempotencyKey:'a',runId:'run-a'}),code=structuredClone(f.snapshot);
 code.method='CODE';code.fieldIds=[];f.ledger.pinLatest(code);f.ledger.begin(code,{idempotencyKey:'code-a',runId:'run-code'});
 code.workflowRevision++;code.submissionRevision++;f.ledger.pinLatest(code);
 assert.equal(f.ledger.get('run-a').current,false);assert.throws(()=>f.ledger.complete('run-a',summary(old)),/RESULT_STALE/);
 assert.throws(()=>f.ledger.begin(f.snapshot,{idempotencyKey:'another',runId:'run-b'}),/STALE/);
});
