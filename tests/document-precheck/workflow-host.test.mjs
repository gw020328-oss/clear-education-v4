import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {workflowFixture,h} from './workflow-fixture.mjs';
import {reviewWorkflowDocument} from '../../src/document-precheck/workflow-adapter.mjs';
import {openReviewLedger} from '../../src/product-workflow/review-ledger.mjs';
function host(t,f){const directory=realpathSync(mkdtempSync(join(tmpdir(),'ai-workflow-'))),options={directory,environment:{instanceId:f.snapshot.binding.instanceId,origin:'https://synthetic.example.invalid',mode:'SYNTHETIC'},now:()=>100};let ledger=openReviewLedger(options);
 t.after(()=>{ledger.close();rmSync(directory,{recursive:true,force:true});});
 return {get ledger(){return ledger;},directory,reopen(){ledger.close();ledger=openReviewLedger(options);}};}
test('host-issued CODE summary accepts once, survives restart and stores no submission text/bytes',async t=>{
 const f=workflowFixture(),store=host(t,f);store.ledger.pinLatest(f.snapshot);const run=store.ledger.begin(f.snapshot,{idempotencyKey:'review-a',runId:'run-a'});
 const summary=await reviewWorkflowDocument({...f,context:run.context});const accepted=store.ledger.complete('run-a',summary);
 assert.equal(accepted.state,'ACCEPTED');assert.equal(accepted.paymentAllowed,false);assert.deepEqual(store.ledger.complete('run-a',summary).summary,summary);
 assert.throws(()=>store.ledger.complete('run-a',{...summary,resultHash:h('different')}),/RESULT_CONFLICT/);
 store.reopen();assert.deepEqual(store.ledger.get('run-a').summary,summary);
 const db=readFileSync(join(store.directory,'workflow.sqlite'));assert.ok(!db.includes(Buffer.from(f.submission.posts[0].text)));assert.ok(!db.includes(f.files[0].bytes));
});
test('host CAS rejects a delayed Vision summary after a newer workflow revision',async t=>{
 const f=workflowFixture('VISION'),store=host(t,f);store.ledger.pinLatest(f.snapshot);const run=store.ledger.begin(f.snapshot,{idempotencyKey:'review-a',runId:'run-a'});let resolve;
 const pending=reviewWorkflowDocument({...f,context:run.context},{execution:'MOCK',modelVersion:'mock-observer.1',observe:()=>new Promise(r=>{resolve=r;})});await Promise.resolve();
 store.ledger.pinLatest({...structuredClone(f.snapshot),workflowRevision:2});resolve({reviewStatus:'CHECKED',observations:[{fieldId:'image-type',value:'SYNTHETIC_PRIVATE_NAME',locator:'post/post-a/image/image-a',quote:null}]});
 const summary=await pending;assert.throws(()=>store.ledger.complete('run-a',summary),/RESULT_STALE/);assert.equal(store.ledger.get('run-a').summary,null);
 const db=readFileSync(join(store.directory,'workflow.sqlite'));assert.ok(!db.includes(Buffer.from('SYNTHETIC_PRIVATE_NAME')));
});
