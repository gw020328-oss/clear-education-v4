// Native signing guards require an owned Geth connection; the offline bridge
// deliberately cannot enable sealing. Fault clocks affect only these fresh tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {environmentRecord} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
for(const change of ['forward','one-final-crossing','expiry','service','source','reverse','second-conflict'])test('native seal request '+change+' never repeats intent, key access or broadcast',{skip:process.env.CLEAR_SEAL_REQUEST_TEST!=='1',timeout:180000},async t=>{
 let f,armed=false,writes=0,ticks=0;const stop=Error('ALLOCATE_RECOVERED'),success=['forward','one-final-crossing'].includes(change);
 f=await normalPaymentFixture(t,{executionVersion:2,
  onStoreTick(){if(armed){ticks++;if((change==='one-final-crossing'||change==='second-conflict')&&ticks===3||change==='second-conflict'&&ticks===6)f.advance(1);}},
  fault(point,{report}){if(point==='e5b-after-seal-request'&&report.stage==='ALLOCATE'){
   writes++;armed=true;if(change==='source')f.withdrawSource();if(change==='service')f.revokeService();f.advance(change==='expiry'?61:change==='reverse'?-1:1);
  }},afterRecovery({report}){if(report.stage==='ALLOCATE')throw stop;}});
 await assert.rejects(f.run(),e=>success?e===stop:/BC_|E5_/.test(e.message));armed=false;
 assert.equal(writes,1);assert.equal(f.metrics().transactionSignatures,success?2:1);assert.equal(f.metrics().keyAccesses,success?2:1);assert.equal(f.metrics().paymentSignatures,0);assert.equal(f.metrics().broadcasts,success?2:1);
 if(!success){assert.equal(f.report.paymentFailure.operation,'ALLOCATE');assert.equal(f.report.paymentFailure.step,'SEAL');}
 const db=new DatabaseSync(join(environmentRecord(f.environmentId).dir,'offline-bind-store/bootcamp.sqlite'),{readOnly:true});
 try{const intent=db.prepare("SELECT intent_id FROM e5b_requests WHERE json_extract(record,'$.command.method')='allocate'").get().intent_id;
  assert.equal(db.prepare("SELECT count(*) n FROM e5b_events WHERE intent_id=? AND kind='SEAL_REQUESTED'").get(intent).n,success?1:0);
  assert.equal(db.prepare("SELECT count(*) n FROM e5b_events WHERE intent_id=? AND kind='REFERENCE'").get(intent).n,success?1:0);
 }finally{db.close();}
});
