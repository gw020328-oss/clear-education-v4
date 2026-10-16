import test from 'node:test';import assert from 'node:assert/strict';import {id} from 'ethers';
import {fixtureSigner} from '../model.mjs';
import {record,proof,table,rows,NOW} from './fixture.mjs';
import {privateRegistryLab,academyBindingCandidate} from './reuse-lab.mjs';
const a=record(),b=record({application:id('PUBLIC_SYNTHETIC_SECOND_APP'),owner:'0x3333333333333333333333333333333333333333'}),
 c=record({...b,application:id('PUBLIC_SYNTHETIC_OTHER_PRODUCT_APP'),reuseScope:id('PUBLIC_SYNTHETIC_OTHER_PRODUCT')});
const setup=(key=Buffer.alloc(32,42))=>privateRegistryLab({key,registrations:[a,b,c],signer:fixtureSigner().address.toLowerCase(),clock:()=>NOW});
test('private keyed registry blocks same source across reissue, different wallet/application and date formatting',async()=>{
 const lab=setup();try{
 assert.equal((await lab.observe({application:a.application,proof:await proof({r:a})})).firstSeen,true);
 assert.equal((await lab.observe({application:a.application,proof:await proof({r:a,timestampS:NOW-9})})).firstSeen,false);
 const repeated=await lab.observe({application:b.application,proof:await proof({r:b,html:table([{...rows[0],date:'2026-10-10'},...rows.slice(1)])})});
 assert.equal(repeated.firstSeen,false);assert.equal(repeated.sameApplication,false);assert.equal(repeated.publicTagIssued,false);
 assert.equal((await lab.observe({application:c.application,proof:await proof({r:c})})).firstSeen,true);
 }finally{lab.close();}
});
test('service rejects unapproved source requests, tampered proof, changed scope and unresolved leading-zero equivalence',async()=>{
 const lab=setup();try{
 await assert.rejects(lab.observe({application:id('not-approved'),proof:await proof()}));
 const fake=await proof();fake.claim.context=fake.claim.context.replace('850','950');await assert.rejects(lab.observe({application:a.application,proof:fake}));
 await assert.rejects(lab.observe({application:a.application,proof:await proof({r:{...a,reuseScope:c.reuseScope}})}));
 await assert.rejects(lab.observe({application:a.application,proof:await proof({html:table([{...rows[0],number:'00123456'}])})}),/NORMALIZATION_UNRESOLVED/);
 }finally{lab.close();}
});
test('silent key rotation blocked; state/key loss remains a real service dependency',async()=>{
 const one=setup(),two=setup(Buffer.alloc(32,43));try{
 const p=await proof();await one.observe({application:a.application,proof:p});
 await assert.rejects(two.observe({application:a.application,proof:p,expectedKeyId:one.keyId}),/KEY_ROTATION_REVIEW/);
 // A newly authorized empty service can forget duplicates. This is a COUNTEREXAMPLE,
 // not evidence that rotation/migration/durable service has been implemented.
 assert.equal((await two.observe({application:a.application,proof:p})).firstSeen,true);
 }finally{one.close();two.close();}
});
test('academy student binding alone cannot stop the same exam presented by two registered students',()=>{
 const common={reuseScope:a.reuseScope,examDate:'2026-10-10'};
 assert.notEqual(academyBindingCandidate({...common,studentBinding:'PUBLIC_STUDENT_A'}),academyBindingCandidate({...common,studentBinding:'PUBLIC_STUDENT_B'}));
});
test('offline/closed registry cannot issue a fresh result; no CLEAR-independent availability claim',async()=>{
 const lab=setup();lab.close();await assert.rejects(lab.observe({application:a.application,proof:await proof()}),/LAB_CLOSED/);
});
