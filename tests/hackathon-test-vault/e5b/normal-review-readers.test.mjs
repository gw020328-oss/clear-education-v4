// Fresh isolated chain and invented actors/source facts. No provider or user login.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RuleError} from '../../../src/policy/values.mjs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';

test('late readers after SIGNED and after REGISTER continue the original payment once',async t=>{
 let f,missing=0,packet,accepted;
 const delayed=new Set();
 f=await normalPaymentFixture(t,{executionVersion:2,sourceSeconds:240,
  recipientWait:async({defaultWait,store,user,app})=>{await defaultWait();packet=store.getRecipientRegistration(user,app);accepted=packet.registrationTargetId;},
  requireReviewReaders(){
   const point=f.report.stages.length;
   if([0,1].includes(point)&&!delayed.has(point)){delayed.add(point);missing++;throw new RuleError('BC_NORMAL_REVIEW_SCREENS_REQUIRED');}
  }});
 await f.run();assert.equal(missing,2);assert.equal(f.report.completed,true);
 assert.equal(f.store.getRecipientRegistration(f.user,f.app).registrationTargetId,accepted);
 assert.deepEqual(f.store.getRecipientRegistration(f.user,f.app).payload,packet.payload);
 assert.deepEqual(f.report.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.equal(f.report.claim.amountAtoms,'100000000');assert.equal(f.report.claim.duplicateRejected,true);
});
for(const failure of ['expiry','logout'])test('late readers with '+failure+' stop before funding or execution',async t=>{
 let f,blocked=false,auth,user;
 f=await normalPaymentFixture(t,{executionVersion:2,sourceSeconds:240,
  recipientWait:async options=>{await options.defaultWait();auth=options.auth;user=options.user;},
  requireReviewReaders(){blocked=true;throw new RuleError('BC_NORMAL_REVIEW_SCREENS_REQUIRED');},
  afterRefresh(){if(blocked){if(failure==='expiry')f.advance(240);else auth.logout(user);}}
 });
 await assert.rejects(f.run());assert.equal(blocked,true);
 assert.deepEqual(f.report.stages,[]);assert.equal(f.report.chainApplicationId,undefined);
 assert.equal(f.metrics().broadcasts,0);assert.equal(f.metrics().transactionSignatures,0);assert.equal(f.report.completed,false);
});
