import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {readRecipientRegistration} from '../../src/bootcamp/recipient-registration-ui.mjs';
import {recipientHttp} from './recipient-http-fixture.mjs';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';
import {procedureFixture} from './procedure-fixture.mjs';
async function setup(t){const f=await procedureFixture(t),registration=f.configuration.procedurePorts.registration;
 f.configuration.procedurePorts.registration=(...args)=>({...registration(...args),version:'clear-bootcamp-procedure-registration-port.2'});f.restart();
 const app=f.create();await f.complete(app);f.store.registerCurrentMetForE4(f.aliceContext,app,f.body(app),f.key());
 const packet=()=>f.store.getRecipientRegistration(f.aliceContext,app);
 const sign=async(wallet=f.alice,payload=packet().payload)=>wallet.signTypedData(payload.domain,payload.types,payload.message);
 const submit=(signature,context=f.aliceContext)=>f.store.submitRecipientRegistration(context,app,f.body(app,{registrationTargetId:packet().registrationTargetId,signature},context),f.key());
 return {...f,get store(){return f.store;},app,packet,sign,submit};}
test('V2 owner-bound request is durable and signed once without leaking signature in reads',async t=>{
 const f=await setup(t),before=f.packet();assert.equal(before.status,'AWAITING_SIGNATURE');assert.equal(before.payload.message.participant.toLowerCase(),f.alice.address.toLowerCase());
 f.restart();assert.deepEqual(f.packet().payload,before.payload);
 const signature=await f.sign(),result=f.submit(signature);assert.equal(result.record.target.signatureAccepted,true);
 f.restart();const after=f.packet();assert.equal(after.status,'SIGNED');assert.equal(after.chainStatus,'NOT_OBSERVED');assert(!JSON.stringify(after).includes(signature));
 assert.throws(()=>f.submit(signature),/ALREADY_SIGNED/);
});
for(const change of ['signer','chain','contract','nonce','recipient','application'])test('registration rejects '+change+' substitution',async t=>{
 const f=await setup(t),p=structuredClone(f.packet().payload);
 if(change==='chain')p.domain.chainId=String(BigInt(p.domain.chainId)+1n);
 if(change==='contract')p.domain.verifyingContract=Wallet.createRandom().address;
 if(change==='nonce')p.message.nonce='0x'+'77'.repeat(32);
 if(change==='recipient')p.message.recipient=Wallet.createRandom().address;
 if(change==='application')p.message.applicationId='0x'+'88'.repeat(32);
 const signature=await f.sign(change==='signer'?Wallet.createRandom():f.alice,p);
 assert.throws(()=>f.submit(signature),/BC_RECIPIENT_REGISTRATION_SIGNATURE/);assert.equal(f.packet().signatureAccepted,false);
});
test('operator cannot submit participant signature and expired/source-changed requests stay closed',async t=>{
 const f=await setup(t),signature=await f.sign();assert.throws(()=>f.submit(signature,f.operatorContext),/FORBIDDEN/);
 f.setTime(Number(f.packet().payload.message.deadline));assert.throws(()=>f.submit(signature),/CURRENT_MET|SIGNATURE|SOURCE/);assert.equal(f.packet().signatureAccepted,false);
});

test('HTTP and normal-client bind exact owner CAS, CSRF and one signed operation with readback',async t=>{
 const f=await setup(t),http=await recipientHttp(t,{store:f.store,context:f.aliceContext,key:f.key}),api=createNormalBootcampClient(http);
 const p=await api.recipientRegistration(f.app),signature=await f.sign(),path='/bootcamp/v3/applications/'+f.app+'/recipient-registration';
 const body=f.body(f.app,{registrationTargetId:p.registrationTargetId,signature});
 assert.equal((await http.raw(path,{method:'POST',body,headers:{'x-csrf-token':'bad'}})).status,403);
 assert.equal((await http.raw(path,{actor:f.bobContext})).status,403);
 assert.equal((await http.raw(path,{method:'POST',body,actor:f.operatorContext})).status,403);
 assert.equal((await http.raw(path,{method:'POST',body:{...body,recipient:f.bob.address}})).status,409);
 const stale={...body,expectedLedgerSequence:body.expectedLedgerSequence-1};assert.equal((await http.raw(path,{method:'POST',body:stale})).status,409);
 const result=await api.submitRecipientRegistration(f.app,await api.recipientRegistration(f.app),signature,{idempotencyKey:f.key()});
 assert.equal(result.record.target.signatureAccepted,true);assert.equal(result.record.target.chainStatus,'NOT_OBSERVED');
 assert.deepEqual(await api.operation(f.app,result.record.operationId),result);
 assert.equal((await api.recipientRegistration(f.app)).status,'SIGNED');assert(!JSON.stringify(result).includes(signature));
});
test('same idempotency key recovers once; new key cannot reuse signature',async t=>{
 const f=await setup(t),sig=await f.sign(),body=f.body(f.app,{registrationTargetId:f.packet().registrationTargetId,signature:sig}),key=f.key();
 const first=f.store.submitRecipientRegistration(f.aliceContext,f.app,body,key);
 assert.deepEqual(f.store.submitRecipientRegistration(f.aliceContext,f.app,body,key),first);
 assert.throws(()=>f.submit(sig),/ALREADY_SIGNED/);
});
for(const scenario of ['logout','source-change','decision-change','session-change'])test('registration rejects '+scenario+' after wallet response',async t=>{
 const f=await setup(t),sig=await f.sign(),packet=f.packet();
 if(scenario==='logout')f.service.logout(f.aliceContext);
 if(scenario==='source-change')f.change(f.app,'activity-complete',{rawAvailable:false});
 if(scenario==='decision-change')await f.refreshEvidence(f.app,f.time+1);
 let context=f.aliceContext;
 if(scenario==='session-change')context=await f.login(f.alice);
 assert.throws(()=>f.store.submitRecipientRegistration(context,f.app,{expectedRevision:packet.applicationRevision,expectedLedgerSequence:packet.ledgerSequence,targetDecisionId:packet.decisionId,targetDecisionRevision:packet.decisionRevision,targetDecisionHash:packet.decisionHash,registrationTargetId:packet.registrationTargetId,signature:sig},f.key()),/AUTH_REQUIRED|BC_VIEW_STALE|CURRENT_MET|RECIPIENT_REGISTRATION_SESSION/);
});
test('logout in final port validation rolls signature write back',async t=>{
 const f=await setup(t),sig=await f.sign(),body=f.body(f.app,{registrationTargetId:f.packet().registrationTargetId,signature:sig});let calls=0;
 f.setHook(name=>{if(name==='funding'&&++calls===2)f.service.logout(f.aliceContext);});
 assert.throws(()=>f.store.submitRecipientRegistration(f.aliceContext,f.app,body,f.key()),/AUTH_REQUIRED/);assert.equal(calls,2);
 f.setHook(()=>{});assert.equal(f.store.getRecipientRegistration(f.operatorContext,f.app).signatureAccepted,false);
});

test('asynchronous registration read rejects logout before response',async t=>{
 const f=await setup(t);let observed=0;
 await assert.rejects(readRecipientRegistration({store:f.store,context:f.aliceContext,applicationId:f.app,authorize:(c,w)=>f.service.authorizeWorkflow(c,w),connection:{async refresh(){observed++;f.service.logout(f.aliceContext);},recipientRegistrationState(){throw Error('MUST_NOT_RETURN');}}}),/AUTH_REQUIRED/);assert.equal(observed,1);
});
test('existing V1 application cannot silently become V2 and retains its original target',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);
 const original=f.store.registerCurrentMetForE4(f.aliceContext,a,f.body(a),f.key());
 const read=()=>f.store.inspectRegistrationForE4(f.aliceContext,a,original.record.target.registrationTargetId).record;
 const before=read(),registration=f.configuration.procedurePorts.registration;
 f.configuration.procedurePorts.registration=(...args)=>({...registration(...args),version:'clear-bootcamp-procedure-registration-port.2'});f.restart();
 assert.throws(()=>f.store.registerCurrentMetForE4(f.aliceContext,a,f.body(a),f.key()),/BC_E3_REGISTRATION_IMMUTABLE/);
 f.configuration.procedurePorts.registration=registration;f.restart();assert.deepEqual(read(),before);assert.equal(f.store.getRecipientRegistration(f.aliceContext,a).status,'NOT_READY');
});
test('registration cannot change accepted right or recipient',async t=>{
 const f=await setup(t),sig=await f.sign();f.submit(sig);f.publish(f.app);f.setAccepted();
 assert.throws(()=>f.submit(sig),/CURRENT_MET/);assert.equal(f.store.getProcedure(f.aliceContext,f.app).procedure.status,'ACCEPTED_RIGHT_PRESERVED');
});
