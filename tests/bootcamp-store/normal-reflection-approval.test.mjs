import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {normalApprovalFixture,put} from './normal-approval-fixture.mjs';
import {configureNormalAiAuthority} from '../../tools/bootcamp/normal-reflection-approval.mjs';
const approved=x=>existsSync(join(x.directory,'approval.json'));
const evidence=x=>existsSync(join(x.directory,'human-ai-approval-evidence.json'));

test('only the separately designated native cost approver can record one exact UI approval and one offline response',async t=>{
 const x=await normalApprovalFixture(t);assert.equal(x.control.brief(x.f.aliceContext).permitted,false);
 assert.throws(()=>x.control.approve(x.f.aliceContext,x.app,x.body(),'test-ai-forbidden'),/FORBIDDEN/);
 assert.equal(approved(x),false);assert.deepEqual(x.counts(),{fetches:0,keys:0});
 const shown=x.control.brief(x.actor);assert.equal(shown.approvalWallet,x.config.operatorWallet);
 assert.equal(shown.paymentConsentIncluded,false);assert.equal(JSON.stringify(shown).includes(x.source.text),false);
 const result=x.control.approve(x.actor,x.app,x.body(),'test-ai-explicit-one');
 assert.equal(result.status,'RECORDED');assert.equal(result.paymentConsentIncluded,false);
 const saved=JSON.parse(readFileSync(join(x.directory,'approval.json')));
 assert.equal(saved.runBindingHash,x.binding.bindingHash);assert.equal(saved.authorization.kind,'DIRECT_HUMAN_FRESH_NORMAL_ONE');
 assert.throws(()=>x.control.approve(x.actor,x.app,x.body(),'test-ai-second'),/ALREADY_RECORDED/);
 assert.deepEqual(x.counts(),{fetches:0,keys:0});
 const response=await x.run();assert.equal(response.report.status,'RECEIVED_CURRENT');response.close();
 assert.deepEqual(x.counts(),{fetches:1,keys:1});await assert.rejects(x.run(),/SPENT|RECOVERY/);
 assert.deepEqual(x.counts(),{fetches:1,keys:1});
});

test('missing owner designation grants neither role provider-cost authority',async t=>{
 const x=await normalApprovalFixture(t);const body=x.body();x.config.aiApprovalWallet=null;x.config.aiApprovalAuthoritySha256=null;
 for(const actor of [x.f.aliceContext,x.f.operatorContext]){
  assert.equal(x.control.brief(actor).permitted,false);
  assert.throws(()=>x.control.approve(actor,x.app,body,'test-ai-no-owner'),/AI_AUTHORITY_REQUIRED/);
 }
 assert.equal(approved(x),false);assert.equal(evidence(x),false);assert.deepEqual(x.counts(),{fetches:0,keys:0});
});

test('the same explicit native authority rule can designate the participant without granting the other role',async t=>{
 const x=await normalApprovalFixture(t,{approver:'participant'});assert.equal(x.control.brief(x.f.aliceContext).permitted,true);
 assert.equal(x.control.brief(x.f.operatorContext).permitted,false);
 assert.throws(()=>x.control.approve(x.f.operatorContext,x.app,x.body(),'test-ai-other-role'),/FORBIDDEN/);
 x.control.approve(x.actor,x.app,x.body(),'test-ai-designated-participant');assert.equal(approved(x),true);
 assert.deepEqual(x.counts(),{fetches:0,keys:0});
});

for(const name of ['host.json','run.used.json','price-review.json','approval-request.json'])
test('changed '+name+' stops the displayed grant before recording or dispatch',async t=>{
 const x=await normalApprovalFixture(t),body=x.body(),path=join(x.directory,name),record=JSON.parse(readFileSync(path));
 if(name==='host.json')record.origin='https://changed.invalid';
 if(name==='run.used.json')record.runId='normal-run-invented-different';
 if(name==='price-review.json')record.inputNanoUsdPerToken='999';
 if(name==='approval-request.json')record.sourceScope='DIFFERENT_EXTERNAL_DATA_SCOPE';
 put(path,record);assert.throws(()=>x.control.approve(x.actor,x.app,body,'test-ai-changed-owner'),/CHANGED|TARGET|BINDING|NORMAL_RUN_OWNER/);
 assert.equal(approved(x),false);assert.equal(evidence(x),false);assert.deepEqual(x.counts(),{fetches:0,keys:0});
});

for(const key of ['applicationId','bodySha256','planHash','contextHash','runBindingHash','codeHead','model','action','costAcknowledgment','extra'])
test('exact UI approval rejects changed '+key+' without a grant or model call',async t=>{
 const x=await normalApprovalFixture(t),body={...x.body(),[key]:'invented-different-value'};
 assert.throws(()=>x.control.approve(x.actor,x.app,body,'test-ai-changed'),/BC_NORMAL_AI_APPROVAL/);
 assert.equal(approved(x),false);assert.equal(evidence(x),false);assert.deepEqual(x.counts(),{fetches:0,keys:0});
});

for(const key of ['hostName','origin','wallet','codeHead','scope'])test('altered native authority '+key+' cannot authorize a UI grant',async t=>{
 const x=await normalApprovalFixture(t),body=x.body();
 put(join(x.directory,'ai-approval-authority.json'),{...x.authority,[key]:'invented-different-value'});
 assert.throws(()=>x.control.approve(x.actor,x.app,body,'test-ai-authority-changed'),/AI_APPROVAL_AUTHORITY|AI_AUTHORITY_REQUIRED/);
 assert.equal(approved(x),false);assert.equal(evidence(x),false);
});

test('a native designation is immutable and is not a reusable role permission',async t=>{
 const x=await normalApprovalFixture(t),path=join(x.directory,'ai-approval-authority.json'),before=readFileSync(path);
 put(x.authorityPath,{...x.authority,wallet:x.config.participantWallet});
 assert.throws(()=>configureNormalAiAuthority({directory:x.directory,config:x.config,sourcePath:x.authorityPath,codeHead:x.code.head}),/IMMUTABLE/);
 assert.deepEqual(readFileSync(path),before);
});

for(const seconds of [95,96,240])test('AI approval at '+seconds+' seconds retains the original 240-second source deadline',async t=>{
 const x=await normalApprovalFixture(t),body=x.body();x.advance(seconds);x.touch();
 if(seconds===95){x.control.approve(x.actor,x.app,body,'test-ai-boundary');assert.equal(approved(x),true);}
 else{assert.throws(()=>x.control.approve(x.actor,x.app,body,'test-ai-late'),/REVIEW_WINDOW_REQUIRED|PREPARATION_STALE/);assert.equal(approved(x),false);}
 assert.equal(x.packet.leaseExpiresAtMs,(x.source.context.issuedAtMs+240000));assert.deepEqual(x.counts(),{fetches:0,keys:0});
});

test('one stale reader, revoked approver or changed source cannot record a paid approval',async t=>{
 for(const reason of ['reader','logout','participant-logout','source']){
  const x=await normalApprovalFixture(t),body=x.body();
  if(reason==='reader')x.advance(6);
  if(reason==='logout')x.f.service.logout(x.actor);
  if(reason==='participant-logout')x.f.service.logout(x.f.aliceContext);
  if(reason==='source')x.state.rawAvailable=false;
  assert.throws(()=>x.control.approve(x.actor,x.app,body,'test-ai-no-current'),/SCREENS_REQUIRED|AUTH_REQUIRED|PREPARATION_STALE/);
  assert.equal(approved(x),false);assert.equal(evidence(x),false);assert.deepEqual(x.counts(),{fetches:0,keys:0});
 }
});

test('a partial approval record is retained and cannot be overwritten or retried into a grant',async t=>{
 const x=await normalApprovalFixture(t),body=x.body(),path=join(x.directory,'human-ai-approval-evidence.json');
 put(path,{inventedPartialRecord:true});const before=readFileSync(path);
 assert.throws(()=>x.control.approve(x.actor,x.app,body,'test-ai-partial'),/ALREADY_RECORDED/);
 assert.deepEqual(readFileSync(path),before);assert.equal(approved(x),false);assert.deepEqual(x.counts(),{fetches:0,keys:0});
});

test('changed exact text after approval stops without a wire call; its spent reservation cannot be reused',async t=>{
 const x=await normalApprovalFixture(t);x.control.approve(x.actor,x.app,x.body(),'test-ai-original');x.source.text='invented changed text';
 const result=await x.run();assert.notEqual(result.report.status,'RECEIVED_CURRENT');result.close();
 assert.deepEqual(x.counts(),{fetches:0,keys:0});await assert.rejects(x.run(),/SPENT|RECOVERY/);
});

test('unknown provider response remains one spent call and never enables another UI approval',async t=>{
 const x=await normalApprovalFixture(t);x.control.approve(x.actor,x.app,x.body(),'test-ai-original');x.setUnknown();
 const result=await x.run();assert.equal(result.report.dispatchStatus,'UNKNOWN_STOPPED');result.close();
 assert.deepEqual(x.counts(),{fetches:1,keys:1});assert.throws(()=>x.control.approve(x.actor,x.app,x.body(),'test-ai-retry'),/ALREADY_RECORDED/);
 await assert.rejects(x.run(),/SPENT|RECOVERY/);assert.deepEqual(x.counts(),{fetches:1,keys:1});
});

test('a controlled 30-second model timeout cannot accept a late response or dispatch again',async t=>{
 const x=await normalApprovalFixture(t);x.control.approve(x.actor,x.app,x.body(),'test-ai-timeout');
 let entered,release;const started=new Promise(r=>entered=r),delayed=new Promise(r=>release=r);
 x.setWireWait(async()=>{entered();await delayed;});
 t.mock.timers.enable({apis:['setTimeout']});
 const pending=x.run();await started;x.advance(30);t.mock.timers.tick(30000);
 const result=await pending;assert.notEqual(result.report.status,'RECEIVED_CURRENT');result.close();
 release();await new Promise(r=>setImmediate(r));t.mock.timers.reset();
 assert.deepEqual(x.counts(),{fetches:1,keys:1});await assert.rejects(x.run(),/SPENT|RECOVERY/);
 assert.equal(x.packet.leaseExpiresAtMs,x.source.context.issuedAtMs+240000);
});
