import test from 'node:test';
import assert from 'node:assert/strict';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';

for(const change of ['forward','source','revoked','expiry','reverse','second-conflict'])test('native dispatch request '+change+' never repeats adoption or sends on rejection',async t=>{
 const stop=Error('TEST_ALLOCATE_RECOVERED');let f,armed=false,ticks=0,injected=0;
 f=await normalPaymentFixture(t,{executionVersion:2,
  fault(point,{report}){if(point==='e5b-after-adoption'&&report.stage==='ALLOCATE')armed=true;},
  onStoreTick(){if(!armed)return;ticks++;
   // Three ticks finish adoption commit, then dispatch starts at tick four.
   if(ticks===5){injected++;
    if(change==='source')f.withdrawSource();if(change==='revoked')f.revokeService();
    f.advance(change==='expiry'?60:change==='reverse'?-1:1);
   }
   if(change==='second-conflict'&&[7,10].includes(ticks))f.advance(1);
  },afterRecovery({report}){if(report.stage==='ALLOCATE')throw stop;}
 });
 if(change==='forward')await assert.rejects(f.run(),error=>error===stop);
 else{await assert.rejects(f.run(),/BC_|E5_/);assert.equal(f.report.paymentFailure.operation,'ALLOCATE');assert.equal(f.report.paymentFailure.step,'DISPATCH');}
 armed=false;assert.equal(injected,1);assert.equal(f.metrics().transactionSignatures,2);assert.equal(f.metrics().paymentSignatures,0);
 assert.equal(f.metrics().broadcasts,change==='forward'?2:1);
 assert.equal(f.metadata.prepare('SELECT count(*) n FROM bridge_adoptions').get().n,2);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='SEALED'").get().n,change==='forward'?0:1);
});
