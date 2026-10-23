// Offline: real authentication, SQLite store and signature broker; invented wallets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {storeFixture,START} from './fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {RuleError} from '../../src/policy/values.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {createSourceDiagnostics} from '../../src/hackerrank-evidence/diagnostics.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';

async function fixture(t){
 t.mock.timers.enable({apis:['setInterval','setTimeout']});
 let time=START,cross=false,ticks=0,readError=null,patch=null,afterRead=()=>{},authError=null;
 const f=await storeFixture(t,{store:{now:()=>{if(cross&&++ticks===2){time++;cross=false;}return time;}}});
 const applicationId=f.create(),v=f.view(applicationId),H=x=>p0Hash('OFFLINE-PROJECTION',x);
 const diagnostics=createSourceDiagnostics({persist(){}}),pins={audience:'offline-projection-only',trustConfigHash:H('trust'),recipeHash:H('recipe'),
  expectedClaimOwner:'0x'+'11'.repeat(20),selectedCertificateId:null,dataMode:'RECLAIM_SIGNED_RECORD'};
 const ui=createNormalUiSession({authentication:{authorizeWorkflow(c,w){if(authError)throw authError;return f.service.authorizeWorkflow(c,w);}},
  participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),now:()=>time,diagnostics,
  getApplication(c,a){if(readError){afterRead();throw readError;}const view=f.store.getApplication(c,a);afterRead();return patch?{...view,...patch}:view;}});
 t.after(()=>ui.close());ui.bindParticipant(f.aliceContext,applicationId,pins);
 const expected={version:'clear-hackerrank-request.1',...pins,applicationId,participantId:v.participantId,participantWallet:f.alice.address.toLowerCase(),
  criterionId:'python-basic-certificate',policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,nonce:H('nonce'),issuedAt:START,expiresAt:START+900};delete expected.dataMode;
 let settled=false,error;const pending=ui.requestSignature(expected,requestMessage(expected));pending.then(()=>{settled=true;},e=>{settled=true;error=e;});
 const approval=ui.pendingSignature(f.aliceContext);
 const signature=await f.alice.signMessage(approval.message);
 return {f,ui,applicationId,expected,approval,signature,diagnostics,pending,get settled(){return settled;},get error(){return error;},
  cross(){ticks=0;cross=true;},setTime(n){time=n;f.setAuthenticationTime(n);},readError(e){readError=e;},patch(p){patch=p;},authError(e){authError=e;},afterRead(fn){afterRead=fn;},
  submit:(context=f.aliceContext,sig=signature)=>ui.submitSignature(context,{approvalId:approval.approvalId,signature:sig}),
  noEffects(){const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});try{
   for(const name of ['evidence','e3_procedures','e3_records','e3_prepared'])assert.equal(db.prepare('SELECT count(*) n FROM '+name).get().n,0);
  }finally{db.close();}assert.equal(diagnostics.snapshot().stages.ACCOUNT_COOKIE_READ.state,'NOT_OBSERVED');},
 };
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

test('real projection crossing a second boundary preserves human wait, requires a fresh read, and accepts once',async t=>{
 const x=await fixture(t);x.setTime(START+46);x.cross();
 assert.throws(()=>x.ui.participant(),/BC_VIEW_STALE/);await flush();assert.equal(x.settled,false);
 assert.equal(x.diagnostics.snapshot().signatureAcceptance,'UNKNOWN');
 // Advance two minutes of human wait with the existing periodic authority check.
 x.setTime(START+166);t.mock.timers.tick(120000);await flush();assert.equal(x.settled,false);
 assert.equal(x.ui.pendingSignature(x.f.aliceContext).approvalId,x.approval.approvalId);
 assert.equal(x.submit().status,'PARTICIPANT_SIGNATURE_ACCEPTED');assert.equal(await x.pending,x.signature);
 assert.equal(x.diagnostics.snapshot().signatureAcceptance,'ACCEPTED');
 assert.throws(()=>x.submit(),/BC_UI_SIGNATURE_NOT_PENDING/);x.noEffects();
});
test('timer-only projection conflict defers and a later successful poll can still accept',async t=>{
 const x=await fixture(t);x.cross();t.mock.timers.tick(250);await flush();assert.equal(x.settled,false);
 const d=x.diagnostics.snapshot();assert.equal(d.firstFailure,null);assert.equal(d.events.filter(e=>e.code==='BC_VIEW_STALE').length,1);
 t.mock.timers.tick(250);x.submit();await x.pending;x.noEffects();
});
test('submission during a projection conflict never accepts a stale snapshot',async t=>{
 const x=await fixture(t);x.cross();assert.throws(()=>x.submit(),/BC_VIEW_STALE/);await flush();assert.equal(x.settled,false);
 assert.equal(x.diagnostics.snapshot().signatureAcceptance,'UNKNOWN');x.submit();await x.pending;x.noEffects();
});
test('transient read followed by real logout cancels without accepting or proceeding',async t=>{
 const x=await fixture(t);x.cross();t.mock.timers.tick(250);await flush();assert.equal(x.settled,false);
 x.f.service.logout(x.f.aliceContext);t.mock.timers.tick(250);await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);
 const d=x.diagnostics.snapshot();assert.equal(d.firstFailure.code,'AUTH_REQUIRED');assert.equal(d.firstFailure.stage,'UI_SESSION_AUTHORITY');
 assert.equal(d.signatureAcceptance,'UNKNOWN');assert.throws(()=>x.submit(),/AUTH_REQUIRED/);x.noEffects();
});
test('real session expiry cancels a pending request without browser activity',async t=>{
 const x=await fixture(t);x.f.setAuthenticationTime(START+3600);t.mock.timers.tick(250);
 await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);assert.equal(x.diagnostics.snapshot().firstFailure.code,'AUTH_REQUIRED');x.noEffects();
});
test('real application cancellation is a binding failure, not a transient read',async t=>{
 const x=await fixture(t);x.f.store.cancel(x.f.aliceContext,x.applicationId,{expectedRevision:x.f.view(x.applicationId).revision},x.f.key());
 t.mock.timers.tick(250);await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);
 assert.equal(x.diagnostics.snapshot().firstFailure.code,'BC_UI_APPLICATION_CHANGED');x.noEffects();
});
test('changed app, policy, mapping or participant never survives a successful read',async t=>{
 for(const patch of [{applicationId:'application-other'},{policyHash:p0Hash('OFFLINE','changed')},{runtimeMappingHash:p0Hash('OFFLINE','mapping')},{participantId:'participant-other'}]){
  await t.test(Object.keys(patch)[0],async t=>{const x=await fixture(t);x.patch(patch);t.mock.timers.tick(250);
   await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);assert.equal(x.diagnostics.snapshot().firstFailure.stage,'UI_APPLICATION_BINDING');x.noEffects();});
 }
});
test('unknown and lookalike projection errors fail safely and preserve only a fixed diagnostic code',async t=>{
 for(const e of [Error('BC_VIEW_STALE'),Object.assign(Error('secret raw URL https://private.invalid/token'),{code:'BC_VIEW_STALE'}),new RuleError('BC_CLOCK_REVERSED'),Error('secret raw failure')]){
  await t.test(e instanceof RuleError?'clock':'unknown',async t=>{const x=await fixture(t);x.readError(e);t.mock.timers.tick(250);
   await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);const d=x.diagnostics.snapshot();assert.equal(d.firstFailure.stage,'UI_APPLICATION_PROJECTION');
   assert.equal(JSON.stringify(d).includes('secret raw'),false);assert.equal(d.signatureAcceptance,'UNKNOWN');x.noEffects();});
 }
});
test('the same stale code from authentication is permanent, not a projection deferral',async t=>{
 const x=await fixture(t);x.authError(new RuleError('BC_VIEW_STALE'));t.mock.timers.tick(250);
 await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);assert.equal(x.diagnostics.snapshot().firstFailure.stage,'UI_SESSION_AUTHORITY');x.noEffects();
});
test('authority lost while a projection read returns is revalidated before acceptance',async t=>{
 const x=await fixture(t);x.afterRead(()=>x.f.service.logout(x.f.aliceContext));assert.throws(()=>x.submit(),/AUTH_REQUIRED/);
 await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);assert.equal(x.diagnostics.snapshot().signatureAcceptance,'UNKNOWN');x.noEffects();
});
test('exact 300-second deadline still cancels even under repeated projection conflicts',async t=>{
 const x=await fixture(t);x.readError(new RuleError('BC_VIEW_STALE'));x.setTime(START+299);t.mock.timers.tick(250);await flush();assert.equal(x.settled,false);
 x.setTime(START+300);t.mock.timers.tick(250);await assert.rejects(x.pending,/BC_UI_SIGNATURE_EXPIRED/);
 assert.equal(x.diagnostics.snapshot().signatureAcceptance,'UNKNOWN');x.noEffects();
});
test('persistent projection conflicts cannot flood diagnostics or extend the original timeout',async t=>{
 const x=await fixture(t);x.readError(new RuleError('BC_VIEW_STALE'));t.mock.timers.tick(300000);
 await assert.rejects(x.pending,/BC_UI_SIGNATURE_EXPIRED/);const d=x.diagnostics.snapshot();assert.equal(d.truncated,false);
 assert.equal(d.events.filter(e=>e.state==='DEFERRED').length,1);assert.equal(d.signatureAcceptance,'UNKNOWN');x.noEffects();
});
test('wrong wallet, chain, session and signature do not accept after a transient read',async t=>{
 const x=await fixture(t);x.cross();t.mock.timers.tick(250);await flush();assert.equal(x.settled,false);
 const next=await x.f.login(x.f.alice);
 for(const context of [x.f.bobContext,x.f.operatorContext,{...x.f.aliceContext,chainId:1},next])assert.throws(()=>x.submit(context),/FORBIDDEN|SESSION_CONTEXT|WALLET_CONTEXT_CHANGED|BC_UI_CONTEXT_CHANGED/);
 assert.throws(()=>x.submit(x.f.aliceContext,{}),/BC_UI_SIGNATURE/);
 const wrong=await x.f.bob.signMessage(x.approval.message);assert.throws(()=>x.submit(x.f.aliceContext,wrong),/BC_UI_SIGNATURE/);
 assert.equal(x.diagnostics.snapshot().signatureAcceptance,'UNKNOWN');x.submit();await x.pending;x.noEffects();
});

test('removing the participant role in the real authentication service cancels without a browser request',async t=>{
 const x=await fixture(t);x.f.restartAuthentication({participants:[x.f.bob.address]});t.mock.timers.tick(250);
 await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);assert.equal(x.diagnostics.snapshot().firstFailure.code,'AUTH_REQUIRED');x.noEffects();
});

test('logout inside a conflicting projection read is not deferred',async t=>{
 const x=await fixture(t);x.readError(new RuleError('BC_VIEW_STALE'));x.afterRead(()=>x.f.service.logout(x.f.aliceContext));
 assert.throws(()=>x.ui.participant(),/AUTH_REQUIRED/);await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);
 assert.equal(x.diagnostics.snapshot().firstFailure.code,'AUTH_REQUIRED');assert.equal(x.diagnostics.snapshot().signatureAcceptance,'UNKNOWN');x.noEffects();
});

test('an uninspectable thrown value cannot bypass safe cancellation',async t=>{
 const x=await fixture(t);x.readError(new Proxy({},{getPrototypeOf(){throw Error('synthetic trap');},getOwnPropertyDescriptor(){throw Error('synthetic trap');}}));
 t.mock.timers.tick(250);await assert.rejects(x.pending,/BC_UI_CONTEXT_UNAVAILABLE/);
 assert.equal(x.diagnostics.snapshot().firstFailure.code,'UNKNOWN_ERROR');x.noEffects();
});
