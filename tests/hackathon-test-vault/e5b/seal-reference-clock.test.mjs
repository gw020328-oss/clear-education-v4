import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {environmentRecord} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';

test('native seal reference crosses a second with exactly one signature and send per command',async t=>{
 const stop=Error('TEST_ALLOCATE_RECOVERED');let f,crossed=0;
 f=await normalPaymentFixture(t,{executionVersion:2,fault(point,{report}){
  if(point==='e5b-after-reference'&&report.stage==='ALLOCATE'){crossed++;f.advance(1);}
 },afterRecovery({report}){if(report.stage==='ALLOCATE')throw stop;}});
 // End at the target command. Later startReview requires a canonical wall-clock
 // block; its full real-time payment coverage lives in recipient-v2-flow.
 await assert.rejects(f.run(),error=>error===stop);assert.equal(crossed,1);
 assert.equal(f.metrics().transactionSignatures,2);assert.equal(f.metrics().broadcasts,2);assert.equal(f.metrics().paymentSignatures,0);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='INCLUDED'").get().n,2);
});
for(const change of ['source','service','expiry','reverse','second-conflict'])test('sealed reference '+change+' rolls back metadata without a second signature or send',async t=>{
 let f,armed=false,injected=0;f=await normalPaymentFixture(t,{executionVersion:2,
  onStoreTick(){if(armed&&change==='second-conflict')f.advance(1);},
  fault(point,{report}){if(point==='e5b-after-reference'&&report.stage==='ALLOCATE'){
   injected++;armed=true;
   if(change==='source')f.withdrawSource();else if(change==='service')f.revokeService();
   else if(change!=='second-conflict')f.advance(change==='expiry'?600:-1);
  }}
 });
 await assert.rejects(f.run(),/BC_|E5_/);armed=false;assert.equal(injected,1);
 assert.equal(f.report.paymentFailure.operation,'ALLOCATE');assert.equal(f.report.paymentFailure.step,'SEAL');
 assert.equal(f.metrics().transactionSignatures,2);assert.equal(f.metrics().broadcasts,1);assert.equal(f.metrics().paymentSignatures,0);
 assert.deepEqual(f.metadata.prepare('SELECT state,count(*) n FROM envelopes GROUP BY state ORDER BY state').all().map(x=>({...x})),[{state:'INCLUDED',n:1},{state:'SEALED',n:1}]);
 const db=new DatabaseSync(join(environmentRecord(f.environmentId).dir,'offline-bind-store/bootcamp.sqlite'),{readOnly:true});
 try{
  const intent=db.prepare("SELECT intent_id FROM e5b_requests WHERE json_extract(record,'$.command.method')='allocate'").get().intent_id;
  assert.equal(db.prepare("SELECT count(*) n FROM e5b_events WHERE intent_id=? AND kind='SEAL_REQUESTED'").get(intent).n,1);
  assert.equal(db.prepare("SELECT count(*) n FROM e5b_events WHERE intent_id=? AND kind='REFERENCE'").get(intent).n,0);
 }finally{db.close();}
});
