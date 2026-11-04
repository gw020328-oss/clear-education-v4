import test from 'node:test';
import assert from 'node:assert/strict';
import {START} from './procedure-fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createMoodlePaymentReader} from '../../src/bootcamp/moodle-payment-projection.mjs';
const H=x=>p0Hash('OFFLINE-MOODLE-PAYMENT',x);
import {paymentFixture} from './moodle-payment-fixture.mjs';
test('both own roles read exact 100 TEST through existing canonical reader without DB mutation or secrets',async t=>{
 const x=await paymentFixture(t),before=x.dump(),bytes=x.bytes(),authBytes=x.authBytes(),counts=x.f.counts();
 const student=await x.reader.read(x.handle);x.operator();const operator=await x.reader.read(x.handle);
 for(const r of [student,operator]){
  assert.equal(r.receipt.amountAtoms,'100000000');assert.equal(r.receipt.canonical,true);assert.equal(r.receipt.finalized,false);
  assert.equal(r.consent.participant,'RECORDED_AGREE');assert.equal(r.consent.operator,'RECORDED_AGREE');assert.equal(r.consent.usableForPayment,false);
  assert.equal(r.decision.sourceCurrentness,'NOT_RECHECKED');assert.equal(r.paymentAuthority,false);
  for(const value of [x.mapping.recipient,x.mapping.token,x.f.aliceContext.token,x.f.operatorContext.token,x.f.aliceContext.csrf])assert.equal(JSON.stringify(r).includes(value),false);
 }
 assert.equal(operator.role,'COURSE_OPERATOR');assert.equal(x.calls(),2);assert.deepEqual(x.dump(),before);assert.deepEqual(x.bytes(),bytes);assert.deepEqual(x.authBytes(),authBytes);assert.deepEqual(x.f.counts(),counts);
});
test('teacher unavailable currentness and borrowing participant session fail before canonical query',async t=>{
 const x=await paymentFixture(t);x.operator();x.useParticipantSession();await assert.rejects(x.reader.read(x.handle),/MOODLE_PAYMENT_CLEAR_ROLE/);assert.equal(x.calls(),0);
 x.operator();x.unavailable();await assert.rejects(x.reader.read(x.handle),/B_CURRENTNESS_UNAVAILABLE/);assert.equal(x.calls(),0);
});
for(const kind of ['mapping','authorityEpoch','logout','role','expiry','monotonic','reverse'])test('canonical await rejects '+kind+' without returning a cached receipt',async t=>{
 const x=await paymentFixture(t);x.onRead(async()=>{
  if(kind==='mapping')x.mapping.mappingRevision++;
  if(kind==='authorityEpoch'){x.authority('temporary');x.epoch();x.authority('moodle-authority-1');}
  if(kind==='logout')x.f.service.logout(x.f.aliceContext);
  if(kind==='role')x.operator();
  if(kind==='expiry')x.setWall(START+5);
  if(kind==='monotonic')x.setMono(5000);
  if(kind==='reverse')x.setWall(START-1);
  return x.receipt;
 });
 await assert.rejects(x.reader.read(x.handle));assert.equal(x.calls(),1);
});
for(const kind of ['missing','unknown','reorg','recipient','token','amount','decision'])test('canonical '+kind+' never promotes accept or hash to paid',async t=>{
 const x=await paymentFixture(t);x.onRead(async()=>{
  if(kind==='missing')return null;if(kind==='unknown'||kind==='reorg')return {status:kind};
  const r=structuredClone(x.receipt);if(kind==='recipient')r.recipient=x.mapping.token;if(kind==='token')r.token=x.mapping.recipient;
  if(kind==='amount')r.amountAtoms='99999999';if(kind==='decision')r.observation.business.application.target.decisionHash=H('other');return r;
 });const r=await x.reader.read(x.handle);assert.equal(r.receipt.state,'READBACK_UNAVAILABLE');assert.equal(r.receipt.amountAtoms,null);assert.equal(r.receipt.transactionHash,null);
});
test('expired recorded evidence does not refresh decisions or erase prior canonical payment',async t=>{
 const x=await paymentFixture(t);x.setWall(START+400);const before=x.dump(),r=await x.reader.read(x.handle);
 assert.equal(r.receipt.amountAtoms,'100000000');assert.equal(r.decision.sourceCurrentness,'NOT_RECHECKED');assert.deepEqual(x.dump(),before);
});
test('ordinary mutating store getters cannot replace branded snapshot port',async t=>{
 const x=await paymentFixture(t);let called=0;
 assert.throws(()=>createMoodlePaymentReader({...x.options,snapshots:{read(){called++;return x.f.store.getProcedure(x.f.aliceContext,x.a);}}}),/MOODLE_PAYMENT_CONFIG/);
 assert.equal(called,0);
});

function fixedOptions(x){
 const {bApplicationId,bindingRef,bindingRevision,bindingExpiresAtExclusive,...base}=x.mapping;
 const mapping={...base,version:'clear-normal-moodle-fixed-mapping.1',mappingRef:'fixed-owner-course'};
 return {...x.options,mapping,resolveScope:async handle=>{const {authorityEpoch,...scope}=await x.options.resolveScope(handle);
  return {...scope,mapping,version:'clear-moodle-fixed-scope-check.1'};}};
}
test('fixed normal mapping returns exact v1 display DTO without B IDs, binding or epoch',async t=>{
 const x=await paymentFixture(t),options=fixedOptions(x),reader=createMoodlePaymentReader(options),bytes=x.bytes();
 for(const role of ['PARTICIPANT','COURSE_OPERATOR']){
  if(role==='COURSE_OPERATOR')x.operator();const r=await reader.read(x.handle);
  assert.deepEqual(Object.keys(r).sort(),['version','requestRef','mappingRevision','mappingRef','role','observedAt','expiresAtExclusive','displayOnly','paymentAuthority','decision','consent','receipt'].sort());
  assert.equal(r.version,'clear-moodle-fixed-payment-status.1');assert.equal(r.mappingRef,options.mapping.mappingRef);assert.equal(r.role,role);
  assert.equal(r.receipt.amountAtoms,'100000000');assert.equal(r.paymentAuthority,false);assert.equal(r.consent.usableForPayment,false);
  assert.equal(r.decision.sourceCurrentness,'NOT_RECHECKED');assert.equal(r.expiresAtExclusive,START+5);
 }
 assert.deepEqual(x.bytes(),bytes);
});
for(const key of ['bApplicationId','bindingRef','bindingRevision','bindingExpiresAtExclusive'])test('fixed mapping rejects mixed legacy '+key,async t=>{
 const x=await paymentFixture(t),options=fixedOptions(x);assert.throws(()=>createMoodlePaymentReader({...options,mapping:{...options.mapping,[key]:x.mapping[key]}}),/MAPPING/);
});
test('fixed scope rejects fake epoch/unknown version and changed owner configuration',async t=>{
 const x=await paymentFixture(t),options=fixedOptions(x);
 for(const change of [{authorityEpoch:1},{version:'unrecognized'}]){
  const reader=createMoodlePaymentReader({...options,resolveScope:async h=>({...await options.resolveScope(h),...change})});
  await assert.rejects(reader.read(x.handle),/SCOPE/);
 }
 const reader=createMoodlePaymentReader(options);x.onRead(async()=>{options.mapping.mappingRef='different-config';return x.receipt;});
 await assert.rejects(reader.read(x.handle),/SCOPE/);
});
test('fixed scope retains exact canonical recipient, token and amount checks',async t=>{
 const x=await paymentFixture(t),reader=createMoodlePaymentReader(fixedOptions(x));
 x.onRead(async()=>({...x.receipt,amountAtoms:'99999999'}));const r=await reader.read(x.handle);
 assert.equal(r.receipt.state,'READBACK_UNAVAILABLE');assert.equal(r.receipt.amountAtoms,null);
});
