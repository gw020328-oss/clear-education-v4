// All hosts, approvals, keys and responses below are invented, in private temp dirs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {bootcampFixture,reflectionMock} from '../ai-review-precheck/bootcamp-fixture.mjs';
import {E6_OPERATIONS_HASH} from '../../src/document-precheck/review/e6-leased-reflection.mjs';
import {NORMAL_REFLECTION_MODEL,NORMAL_REFLECTION_COST_ACK} from '../../src/document-precheck/review/fixed-normal-reflection.mjs';
import {prepareFirstNormalReflectionPacket,runManagedNormalReflection,runManagedNormalReflectionOfflineFixture as run,isFirstNormalReflectionResult} from '../ai-review-precheck/first-normal-reflection-entry.mjs';
import {openOfflineNormalReflectionRun,normalReflectionJournalPath} from '../../tools/bootcamp/normal-reflection-run.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const put=(p,v)=>writeFileSync(p,JSON.stringify(v),{mode:0o600});
function root(t){const d=realpathSync(mkdtempSync(join(tmpdir(),'normal-run-offline-')));mkdirSync(join(d,'artifacts'),{mode:0o700});t.after(()=>rmSync(d,{recursive:true,force:true}));return d;}
function fixture(base,{name='normal-offline-one',applicationId='offline-application-one',evidence='b'.repeat(64),unknown=false}={}){
 const f=bootcampFixture();f.context.applicationId=applicationId;f.context.modelVersion=NORMAL_REFLECTION_MODEL;
 const directory=join(base,'var/bootcamp-normal-host',name);mkdirSync(directory,{recursive:true,mode:0o700});
 const codeState={head:'a'.repeat(40),clean:true},day='2026-10-24';
 const owner={version:'clear-bootcamp-normal-host-one-run.2',hostName:name,runId:'normal-run-'+randomUUID(),code:codeState};
 const host={participantWallet:'0x'+'11'.repeat(20),operatorWallet:'0x'+'22'.repeat(20),privacyKeyId:'hr-run.'+randomUUID(),origin:'https://127.0.0.1:9445'};
 put(join(directory,'run.used.json'),owner);put(join(directory,'host.json'),host);
 const state={context:f.context,decisionRef:null,messageFormat:2,operationsProfileHash:E6_OPERATIONS_HASH,rawAvailable:true,leaseExpiresAtMs:f.context.expiresAtMs};
 const packet=prepareFirstNormalReflectionPacket({context:f.context,text:f.text,decisionRef:null,messageFormat:2,leaseExpiresAtMs:state.leaseExpiresAtMs});
 const capability=openOfflineNormalReflectionRun(base,name),binding=capability.bind({packet,context:f.context});
 const approval={version:'clear-e6-paid-wire-v3-user-approval.3',scope:'FIRST_NORMAL_REFLECTION_ONE',approvedOn:day,codeHead:codeState.head,
  planHash:packet.planHash,contextHash:packet.contextHash,runBindingHash:binding.bindingHash,authorization:{kind:'DIRECT_HUMAN_FRESH_NORMAL_ONE',evidenceSha256:evidence},
  maxGenerationCalls:1,maxCountCalls:0,automaticRetries:0,continuations:0,keySourceFallbacks:0,modelFallbacks:0,freeFallbacks:0,
  keySourceId:'clear-e6-existing-server-gemini-env.1',costAcknowledgment:NORMAL_REFLECTION_COST_ACK,
  pricingReview:{reviewedOn:day,officialSource:'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite',inputNanoUsdPerToken:'300',outputIncludingThinkingNanoUsdPerToken:'2500',basis:'PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION',evidenceSha256:'c'.repeat(64)}};
 let fetches=0,keys=0,reads=0;const controller=new AbortController();
 const args={packet,approval,codeState,day,context:f.context,decisionRef:null,messageFormat:2,nowMs:()=>f.clock.value,
  currentCodeState:()=>codeState,currentDay:()=>day,currentApprovalHash:()=>hash(approval),resolveCurrent:()=>state,signal:controller.signal,
  lease:{isCurrent:()=>state.rawAvailable,async readBody(){reads++;return f.text;},release(){}},
  transportOptions:{keyReader:()=>{keys++;return 'offline-only-key';},fetchImpl:async()=>{
   fetches++;assert.ok(existsSync(join(directory,'ai-reflection/spent.paid-wire.v3.lock')));
   assert.ok(existsSync(join(base,'artifacts/e6-managed-normal-reflection-claims','approval-'+evidence+'.spent.json')));
   if(unknown)throw Error('offline unknown provider outcome');
   return new Response(JSON.stringify({modelVersion:NORMAL_REFLECTION_MODEL,usageMetadata:{promptTokenCount:300,candidatesTokenCount:200,totalTokenCount:500,serviceTier:'standard'},
    candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(await reflectionMock(f).observe())}]}}]}));}}};
 return {f,base,name,directory,owner,host,capability,binding,args,controller,counts:()=>({fetches,keys,reads}),spent:()=>existsSync(join(directory,'ai-reflection/spent.paid-wire.v3.lock'))};
}
test('fresh managed run isolates the legacy spent journal and consumes exactly one bound response',async t=>{
 const base=root(t),legacy=join(base,'artifacts/e6-first-normal-reflection-run');mkdirSync(legacy,{mode:0o700});const oldHost=join(base,'var/bootcamp-normal-host/normal-offline-legacy');mkdirSync(oldHost,{recursive:true,mode:0o700});const oldApproval={authorization:{evidenceSha256:'f'.repeat(64)}};put(join(oldHost,'approval.json'),oldApproval);put(join(legacy,'spent.paid-wire.v3.lock'),{identity:{approvalHash:hash(oldApproval),planHash:'legacy-plan',contextHash:'legacy-context'}});
 const before=readFileSync(join(legacy,'spent.paid-wire.v3.lock')),x=fixture(base),r=await run(x.capability,x.args);
 assert.equal(r.report.generationCalls,1);assert.equal(r.report.countCalls,0);assert.equal(r.report.status,'RECEIVED_CURRENT');assert.equal(isFirstNormalReflectionResult(r),false);r.close();
 assert.deepEqual(x.counts(),{fetches:1,keys:1,reads:1});assert.deepEqual(readFileSync(join(legacy,'spent.paid-wire.v3.lock')),before);
 const saved=JSON.parse(readFileSync(join(x.directory,'ai-reflection/summary.paid-wire.v3.json')));assert.equal(saved.runBindingHash,x.binding.bindingHash);
 assert.equal(saved.runId,x.owner.runId);assert.equal(saved.paymentAuthority,false);
 await assert.rejects(run(x.capability,x.args),/SPENT|RECOVERY|NORMAL_RESUME_BLOCKED/);assert.equal(x.counts().fetches,1);
 const reopened=openOfflineNormalReflectionRun(base,x.name);reopened.bind({packet:x.args.packet,context:x.args.context});
 await assert.rejects(run(reopened,x.args),/SPENT|RECOVERY|NORMAL_RESUME_BLOCKED/);assert.equal(x.counts().fetches,1);
});
test('changing only the run directory cannot reuse an approval or an application',async t=>{
 const base=root(t),a=fixture(base);(await run(a.capability,a.args)).close();
 const b=fixture(base,{name:'normal-offline-two',applicationId:'offline-application-two'});
 await assert.rejects(run(b.capability,b.args),/SPENT|RECOVERY|NORMAL_RESUME_BLOCKED/);assert.equal(b.counts().fetches,0);assert.equal(b.spent(),true);
 const c=fixture(base,{name:'normal-offline-three',evidence:'d'.repeat(64)});
 await assert.rejects(run(c.capability,c.args),/SPENT|RECOVERY|NORMAL_RESUME_BLOCKED/);assert.equal(c.counts().fetches,0);assert.equal(c.spent(),true);
 const d=fixture(base,{name:'normal-offline-four',applicationId:'offline-application-four',evidence:'e'.repeat(64)});
 (await run(d.capability,d.args)).close();assert.equal(d.counts().fetches,1);
});
test('clearing a synthetic per-run journal cannot bypass the global consumed claims',async t=>{
 const x=fixture(root(t));(await run(x.capability,x.args)).close();rmSync(join(x.directory,'ai-reflection'),{recursive:true});
 await assert.rejects(run(x.capability,x.args),/SPENT|RECOVERY|NORMAL_RESUME_BLOCKED/);assert.equal(x.counts().fetches,1);
});
test('unknown provider outcome remains spent even under a different host and approval',async t=>{
 const base=root(t),x=fixture(base,{unknown:true}),r=await run(x.capability,x.args);assert.equal(r.report.dispatchStatus,'UNKNOWN_STOPPED');r.close();
 assert.equal(x.counts().fetches,1);assert.equal(x.spent(),true);
 const other=fixture(base,{name:'normal-offline-other',evidence:'d'.repeat(64)});
 await assert.rejects(run(other.capability,other.args),/SPENT|RECOVERY|NORMAL_RESUME_BLOCKED/);assert.equal(other.counts().fetches,0);
});
test('cancellation after reservation burns the run without key access or dispatch',async t=>{
 const base=root(t),x=fixture(base);x.args.lease.readBody=async()=>{x.controller.abort();return x.f.text;};
 try{const r=await run(x.capability,x.args);r.close();}catch{}
 assert.equal(x.spent(),true);assert.equal(x.counts().keys,0);assert.equal(x.counts().fetches,0);
 const other=fixture(base,{name:'normal-offline-other',evidence:'d'.repeat(64)});
 await assert.rejects(run(other.capability,other.args),/SPENT|RECOVERY|NORMAL_RESUME_BLOCKED/);assert.equal(other.counts().fetches,0);
});
for(const mutation of ['missing-run','wrong-run','old-code','wrong-plan','wrong-model','two-calls'])test('rejects '+mutation+' approval before consuming or reading a key',async t=>{
 const x=fixture(root(t));if(mutation==='missing-run')delete x.args.approval.runBindingHash;
 if(mutation==='wrong-run')x.args.approval.runBindingHash='0'.repeat(64);
 if(mutation==='old-code')x.args.approval.codeHead='b'.repeat(40);
 if(mutation==='wrong-plan')x.args.approval.planHash='0x'+'00'.repeat(32);
 if(mutation==='wrong-model')x.args.packet={...x.args.packet,model:'other'};
 if(mutation==='two-calls')x.args.approval.maxGenerationCalls=2;
 await assert.rejects(async()=>run(x.capability,x.args),/NORMAL_/);assert.equal(x.spent(),false);assert.equal(x.counts().keys,0);
});
test('the immutable run binding rejects other application, input, model or owner',async t=>{
 const x=fixture(root(t));
 for(const packet of [{...x.args.packet,bodySha256:'0'.repeat(64)},{...x.args.packet,inputHash:'0x'+'00'.repeat(32)},{...x.args.packet,model:'other'}])
  assert.throws(()=>x.capability.bind({packet,context:x.args.context}),/NORMAL_RUN_ALREADY_BOUND/);
 assert.throws(()=>x.capability.bind({packet:x.args.packet,context:{...x.args.context,applicationId:'different-application'}}),/NORMAL_RUN_CONTEXT/);
 put(join(x.directory,'host.json'),{...x.host,participantWallet:'0x'+'33'.repeat(20)});
 await assert.rejects(run(x.capability,x.args),/NORMAL_RUN_CHANGED/);assert.equal(x.counts().keys,0);
});
test('owner mutation at the last dispatch guard stops without a key or model call',async t=>{
 const x=fixture(root(t)),read=x.args.lease.readBody;x.args.lease.readBody=async()=>{const s=await read();put(join(x.directory,'run.used.json'),{...x.owner,runId:'normal-run-'+randomUUID()});return s;};
 try{const r=await run(x.capability,x.args);r.close();}catch{}
 assert.equal(x.spent(),true);assert.equal(x.counts().keys,0);assert.equal(x.counts().fetches,0);
});
test('concurrent attempts for one approval cannot dispatch twice',async t=>{
 const base=root(t),a=fixture(base),b=fixture(base,{name:'normal-offline-two'});
 const results=await Promise.allSettled([run(a.capability,a.args),run(b.capability,b.args)]);
 for(const r of results)if(r.status==='fulfilled')r.value.close();
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.counts().fetches+b.counts().fetches,1);
});
test('live entry rejects fixture/forged capabilities and every transport or store override',async t=>{
 const x=fixture(root(t)),{transportOptions,...live}=x.args;
 await assert.rejects(async()=>runManagedNormalReflection(x.capability,live),/NORMAL_RUN_CAPABILITY/);
 for(const cap of [{},x.directory,{directory:x.directory}])await assert.rejects(async()=>runManagedNormalReflection(cap,live),/NORMAL_RUN_CAPABILITY/);
 assert.throws(()=>runManagedNormalReflection(x.capability,x.args),/NORMAL_LIVE_OVERRIDE_FORBIDDEN/);
 assert.throws(()=>runManagedNormalReflection(x.capability,{...live,store:{}}),/NORMAL_LIVE_OVERRIDE_FORBIDDEN/);
 for(const name of ['../escape','/absolute','x/y',''])assert.throws(()=>normalReflectionJournalPath(name),/NORMAL_RUN_NAME/);
 assert.equal(x.counts().keys,0);
});
test('a symlink host or legacy run record cannot mint a managed capability',t=>{
 const base=root(t),x=fixture(base);symlinkSync(x.directory,join(base,'var/bootcamp-normal-host','normal-alias'));
 assert.throws(()=>openOfflineNormalReflectionRun(base,'normal-alias'),/E5_PRIVATE_DIRECTORY/);
 put(join(x.directory,'run.used.json'),{...x.owner,version:'clear-bootcamp-normal-host-one-run.1'});
 assert.throws(()=>openOfflineNormalReflectionRun(base,x.name),/NORMAL_RUN_OWNER/);
});

test('legacy consumed authorization cannot be relabelled for a new managed run',async t=>{
 const base=root(t),oldHost=join(base,'var/bootcamp-normal-host/normal-offline-legacy'),legacy=join(base,'artifacts/e6-first-normal-reflection-run');
 mkdirSync(oldHost,{recursive:true,mode:0o700});mkdirSync(legacy,{mode:0o700});
 const oldApproval={authorization:{evidenceSha256:'b'.repeat(64)},codeHead:'f'.repeat(40)};
 put(join(oldHost,'approval.json'),oldApproval);put(join(legacy,'spent.paid-wire.v3.lock'),{identity:{approvalHash:hash(oldApproval),planHash:'legacy-plan',contextHash:'legacy-context'}});
 const x=fixture(base);await assert.rejects(run(x.capability,x.args),/NORMAL_RUN_LEGACY_SPENT/);assert.equal(x.spent(),false);assert.equal(x.counts().fetches,0);
 rmSync(join(oldHost,'approval.json'));x.args.approval.authorization.evidenceSha256='c'.repeat(64);
 await assert.rejects(run(x.capability,x.args),/NORMAL_RUN_LEGACY_RECOVERY_REQUIRED/);assert.equal(x.counts().keys,0);
});

test('checkpoint failure after reservation cannot be retried through a fresh journal',async t=>{
 const base=root(t),x=fixture(base);mkdirSync(join(x.directory,'ai-reflection'),{mode:0o700});mkdirSync(join(x.directory,'ai-reflection/summary.paid-wire.v3.json'),{mode:0o700});
 await assert.rejects(run(x.capability,x.args),/E6_WV3_CHECKPOINT_FAILED/);assert.equal(x.spent(),true);assert.equal(x.counts().keys,0);
 const y=fixture(base,{name:'normal-offline-two',evidence:'d'.repeat(64)});await assert.rejects(run(y.capability,y.args),/SPENT|RECOVERY|NORMAL_RESUME_BLOCKED/);assert.equal(y.counts().fetches,0);
});

test('pre-claim durable state requires explicit capability resume; incomplete and spent records never authorize it',async t=>{
 const x=fixture(root(t));const original=x.args.currentApprovalHash;x.args.currentApprovalHash=()=>null;
 await assert.rejects(run(x.capability,x.args),/NORMAL_CURRENT/);assert.equal(x.capability.recovery().status,'NOT_SENT');assert.equal(x.spent(),false);
 await assert.rejects(run(x.capability,{...x.args,currentApprovalHash:original}),/NORMAL_RESUME_BLOCKED/);
 x.args.currentApprovalHash=original;x.capability.authorizeResume();assert.throws(()=>x.capability.authorizeResume(),/NORMAL_RESUME_BLOCKED/);
 (await run(x.capability,x.args)).close();assert.equal(x.counts().fetches,1);assert.equal(x.capability.recovery().status,'RESULT_RECORDED');
 assert.throws(()=>x.capability.authorizeResume(),/NORMAL_RESUME_BLOCKED/);
});

test('missing and interrupted dispatch metadata cannot establish a resumable unsent attempt',async t=>{
 const x=fixture(root(t));assert.equal(x.capability.recovery().status,'UNOBSERVED');assert.throws(()=>x.capability.authorizeResume(),/NORMAL_RESUME_BLOCKED/);
 mkdirSync(join(x.directory,'ai-reflection'),{mode:0o700});
 for(const phase of ['ENTERED','DISPATCH_INTENT','UNKNOWN']){
  put(join(x.directory,'ai-reflection/attempt-state.json'),{version:'clear-normal-ai-attempt.1',bindingHash:x.binding.bindingHash,approvalHash:hash(x.args.approval),attempt:1,phase});
  assert.equal(x.capability.recovery().status,'UNKNOWN');assert.throws(()=>x.capability.authorizeResume(),/NORMAL_RESUME_BLOCKED/);
 }
 assert.equal(x.counts().fetches,0);
});
