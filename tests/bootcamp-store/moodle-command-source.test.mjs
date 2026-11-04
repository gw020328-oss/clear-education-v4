import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {storeFixture,START} from './fixture.mjs';
import {commandFixture} from './moodle-command-fixture.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';

async function setup(t,{afterFile=()=>{}}={}) {
 const f=await storeFixture(t),applicationId=f.create(),v=f.view(applicationId),H=x=>p0Hash('NATIVE-SOURCE-FIXTURE',x);
 const x=await commandFixture({authentication:f.service,contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
 t.after(()=>x.owner.close());
 const pins={audience:'offline-native-source',trustConfigHash:H('trust'),recipeHash:H('recipe'),expectedClaimOwner:'0x'+'11'.repeat(20),selectedCertificateId:null,dataMode:'RECLAIM_SIGNED_RECORD'};
 const file=join(f.directory,'native-context.json');
 let expireSignature=false;
 const scope={...x.scope,assert(){if(expireSignature)x.advance(5);x.scope.assert();}};
 const ui=createNormalUiSession({authentication:{...f.service,authorizeWorkflow(c,w){const actor=f.service.authorizeWorkflow(c,w);x.scope.assertContext(c);return actor;}},
  participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),getApplication:(c,a)=>f.store.getApplication(c,a),now:()=>f.time,commandScope:scope,
  beforeBind(candidate){atomicPrivate(file,{applicationId:candidate.applicationId},{exclusive:true,beforePublish:()=>scope.beforeFile()});scope.afterFile();afterFile(x);}});
 t.after(()=>ui.close());
 const command=resource=>({method:'POST',path:'/bootcamp/v4/applications/'+applicationId+'/'+resource,body:{},idempotencyKey:null});
 const bind=async()=>{const input=await x.grant(command('source-session'));return x.scope.run(input,()=>{ui.bindParticipant(f.aliceContext,applicationId,pins);x.scope.filesCommitted();});};
 const expected={version:'clear-hackerrank-request.1',...pins,applicationId,participantId:v.participantId,participantWallet:f.alice.address.toLowerCase(),criterionId:'python-basic-certificate',policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,nonce:H('nonce'),issuedAt:START,expiresAt:START+240};delete expected.dataMode;
 return {f,x,ui,file,pins,command,bind,expected,expireSignature(){expireSignature=true;}};
}

test('native source binding publishes exclusively and consumes its exact command once',async t=>{
 const z=await setup(t);await z.bind();assert(existsSync(z.file));assert.equal(z.ui.participant().wallet,z.f.aliceContext.wallet);
 z.x.lastReservation.finish();await assert.rejects(z.bind(),/MOODLE_COMMAND_UNAVAILABLE/);
});

test('source context expiry after temp fsync prevents publish and memory binding',async t=>{
 const z=await setup(t),fs=(await import('node:fs')).default,{syncBuiltinESMExports}=await import('node:module');
 const original=fs.fsyncSync;let calls=0;
 try{fs.fsyncSync=fd=>{const r=original(fd);if(++calls===1)z.x.advance(5);return r;};syncBuiltinESMExports();
  await assert.rejects(z.bind(),/EXPIRED/);
 }finally{fs.fsyncSync=original;syncBuiltinESMExports();}
 assert.equal(calls,1);assert.equal(existsSync(z.file),false);assert.throws(()=>z.ui.participant(),/PARTICIPANT_REQUIRED/);
 assert.throws(()=>z.x.lastReservation.finish(),/NOT_COMMITTED/);
});

test('partial source publication stays unknown and cannot bind memory or overwrite context',async t=>{
 const z=await setup(t,{afterFile:x=>x.advance(5)});await assert.rejects(z.bind(),/EXPIRED/);
 assert(existsSync(z.file));assert.throws(()=>z.ui.participant(),/PARTICIPANT_REQUIRED/);
 assert.throws(()=>z.x.lastReservation.finish(),/NOT_COMMITTED/);await assert.rejects(z.bind(),/MOODLE_COMMAND_UNAVAILABLE/);
});

for(const expired of [false,true])test('source signature command '+(expired?'cannot resolve the waiter after final-fence expiry':'consumes before the waiter can continue and cannot replay'),async t=>{
 const z=await setup(t);await z.bind();let resolutions=0;
 const pending=z.ui.requestSignature(z.expected,requestMessage(z.expected));pending.then(()=>resolutions++,()=>{});
 const view=z.ui.pendingSignature(z.f.aliceContext),signature=await z.f.alice.signMessage(view.message);
 const command={...z.command('source-signature'),body:{approvalId:view.approvalId,signature}},input=await z.x.grant(command);
 if(expired)z.expireSignature();
 const run=()=>z.x.scope.run(input,()=>z.ui.submitSignature(z.f.aliceContext,command.body));
 if(expired){await assert.rejects(run(),/EXPIRED/);assert.equal(resolutions,0);z.ui.close();await assert.rejects(pending,/CLOSED/);assert.throws(()=>z.x.lastReservation.finish(),/NOT_COMMITTED/);}
 else{assert.equal((await run()).status,'PARTICIPANT_SIGNATURE_ACCEPTED');assert.equal(await pending,signature);assert.equal(resolutions,1);z.x.lastReservation.finish();}
 await assert.rejects(run(),/BINDING/);
});
