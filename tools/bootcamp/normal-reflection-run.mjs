// Constructor-owned run capability. HTTP/approval inputs never choose a path.
import {executionErrorSummary} from '../../src/bootcamp/execution-diagnostics.mjs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {privateDirectory,readPrivate,atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {withE6PaidWireV3Store} from '../../tests/ai-review-precheck/e6-paid-wire-v3-runner.mjs';
import {validateReflectionContext,reflectionContextHash} from '../../src/document-precheck/review/bootcamp-reflection.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),runs=new WeakMap();
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error(code);};
const nameOk=n=>typeof n==='string'&&/^[a-z][a-z0-9-]{0,40}$/.test(n);
function rejectLegacyReuse(base,approval,packet){
 const legacy=join(base,'artifacts/e6-first-normal-reflection-run/spent.paid-wire.v3.lock');
 if(!existsSync(legacy))return;
 const identity=JSON.parse(readPrivate(legacy)).identity;
 check(/^[a-f0-9]{64}$/.test(identity?.approvalHash??''),'NORMAL_RUN_LEGACY_RECOVERY_REQUIRED');
 check(packet.planHash!==identity.planHash&&packet.contextHash!==identity.contextHash,'NORMAL_RUN_LEGACY_SPENT');
 // Find only the exact already-consumed approval, in the fixed managed host
 // namespace. Read approval metadata, never source bodies or session records.
 let evidence=null;
 for(const item of readdirSync(join(base,'var/bootcamp-normal-host'),{withFileTypes:true})){
  if(!item.isDirectory()||!nameOk(item.name))continue;
  const path=join(base,'var/bootcamp-normal-host',item.name,'approval.json');if(!existsSync(path))continue;
  let old;try{old=JSON.parse(readPrivate(path));}catch{continue;}
  if(hash(old)===identity.approvalHash)evidence=old.authorization?.evidenceSha256;
 }
 check(/^[a-f0-9]{64}$/.test(evidence??''),'NORMAL_RUN_LEGACY_RECOVERY_REQUIRED');
 check(approval.authorization?.evidenceSha256!==evidence,'NORMAL_RUN_LEGACY_SPENT');
}
export function normalReflectionJournalPath(hostName){
 check(nameOk(hostName),'NORMAL_RUN_NAME');return join(root,'var/bootcamp-normal-host',hostName,'ai-reflection');
}
function openRun(base,hostName,offline){
 check(nameOk(hostName),'NORMAL_RUN_NAME');
 const directory=privateDirectory(join(base,'var/bootcamp-normal-host',hostName));
 const read=()=>{
  const used=JSON.parse(readPrivate(join(directory,'run.used.json'))),host=JSON.parse(readPrivate(join(directory,'host.json')));
  check(used.version==='clear-bootcamp-normal-host-one-run.2'&&used.hostName===hostName
   &&/^normal-run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(used.runId??'')
   &&used.code?.clean===true&&/^[a-f0-9]{40}$/.test(used.code.head??'')
   &&/^0x[0-9a-f]{40}$/.test(host.participantWallet??'')&&!/^0x0+$/.test(host.participantWallet),'NORMAL_RUN_OWNER');
  return {version:'clear-normal-reflection-run.1',hostName,runId:used.runId,codeHead:used.code.head,participantWallet:host.participantWallet,
   hostIdentityHash:hash({origin:host.origin,privacyKeyId:host.privacyKeyId,participantWallet:host.participantWallet,operatorWallet:host.operatorWallet})};
 };
 const owner=read(),bindingPath=join(directory,'ai-reflection-binding.json');
 const state={directory,base,owner,offline,binding:null,busy:false,resumePermit:null,assertCurrent(){check(hash(read())===hash(owner),'NORMAL_RUN_CHANGED');}};
 const journalPath=join(directory,'ai-reflection'),attemptPath=join(journalPath,'attempt-state.json');
 const readAttempt=()=>existsSync(attemptPath)?JSON.parse(readPrivate(attemptPath)):null;
 const recovery=()=>{
  state.assertCurrent();if(state.binding)check(hash(JSON.parse(readPrivate(bindingPath)))===hash(state.binding),'NORMAL_RUN_CHANGED');const a=readAttempt();
  if(!a)return Object.freeze({status:'UNOBSERVED',resumeAllowed:false});
  check(a.version==='clear-normal-ai-attempt.1'&&a.bindingHash===state.binding?.bindingHash,'NORMAL_RUN_CHANGED');
  const busy=state.busy||existsSync(join(journalPath,'execution.paid-wire.v3.lock'));
  const status=busy?'BUSY':a.phase==='FAILED_BEFORE_CLAIM'&&!existsSync(join(journalPath,'spent.paid-wire.v3.lock'))?'NOT_SENT':
   a.phase==='RESERVED'?'APPROVAL_SPENT_NOT_SENT':a.phase==='RECEIVED'?'RESULT_RECORDED':'UNKNOWN';
  return Object.freeze({status,resumeAllowed:status==='NOT_SENT',attempt:a.attempt,approvalHash:a.approvalHash,code:a.code??null});
 };
 state.readAttempt=readAttempt;state.attemptPath=attemptPath;
 const capability=Object.freeze({recovery,authorizeResume(){
  const r=recovery();check(r.resumeAllowed&&!state.resumePermit,'NORMAL_RESUME_BLOCKED');state.resumePermit={attempt:r.attempt,approvalHash:r.approvalHash};
 },assertCurrent(){
  state.assertCurrent();if(state.binding)check(hash(JSON.parse(readPrivate(bindingPath)))===hash(state.binding),'NORMAL_RUN_CHANGED');
 },bind({packet,context}){
  state.assertCurrent();validateReflectionContext(context);
  check(packet.contextHash===reflectionContextHash(context),'NORMAL_RUN_CONTEXT');
  const binding={...owner,applicationId:context.applicationId,participantId:context.participantId,contextHash:packet.contextHash,planHash:packet.planHash,
   inputHash:packet.inputHash,bodySha256:packet.bodySha256,model:packet.model,leaseExpiresAtMs:packet.leaseExpiresAtMs,
   maxGenerationCalls:packet.maxGenerationCalls,maxCountCalls:packet.maxCountCalls,automaticRetries:packet.automaticRetries,fallbacks:packet.fallbacks};
  const record={...binding,bindingHash:hash(binding)};
  if(existsSync(bindingPath))check(hash(JSON.parse(readPrivate(bindingPath)))===hash(record),'NORMAL_RUN_ALREADY_BOUND');
  else atomicPrivate(bindingPath,record,{exclusive:true});
  state.binding=record;return Object.freeze(structuredClone(record));
 }});
 runs.set(capability,state);return capability;
}
export function openManagedNormalReflectionRun(hostName){return openRun(root,hostName,false);}
// Explicit offline seam: its capability is rejected by the live entry.
export function openOfflineNormalReflectionRun(base,hostName){privateDirectory(base);return openRun(base,hostName,true);}
export async function withManagedNormalReflectionStore(capability,{packet,context,approval,codeState},action,{offline=false}={}){
 const s=runs.get(capability);check(s&&s.offline===offline,'NORMAL_RUN_CAPABILITY');s.assertCurrent();
 approval=structuredClone(approval);const approvalHash=hash(approval);
 check(s.binding&&s.binding.codeHead===codeState.head,'NORMAL_RUN_NOT_BOUND');
 const expected=capability.bind({packet,context});
 check(approval.runBindingHash===expected.bindingHash,'NORMAL_RUN_APPROVAL');
 rejectLegacyReuse(s.base,approval,packet);
 const journal=privateDirectory(join(s.directory,'ai-reflection'),{create:true});
 check(!s.busy,'NORMAL_RESUME_BUSY');s.busy=true;
 try{return await withE6PaidWireV3Store(journal,async store=>{
  const old=s.readAttempt(),permit=s.resumePermit;s.resumePermit=null;
  check(!old||old.phase==='FAILED_BEFORE_CLAIM'&&permit?.attempt===old.attempt&&permit.approvalHash===approvalHash
   &&old.approvalHash===approvalHash&&!existsSync(join(journal,'spent.paid-wire.v3.lock')),'NORMAL_RESUME_BLOCKED');
  let record={version:'clear-normal-ai-attempt.1',bindingHash:expected.bindingHash,approvalHash,attempt:(old?.attempt??0)+1,phase:'ENTERED'};
  const mark=(phase,extra={})=>{record={...record,phase,...extra};atomicPrivate(s.attemptPath,record);};mark('ENTERED');
  try{return await action({
  async claim(identity){
   s.assertCurrent();check(hash(JSON.parse(readPrivate(join(s.directory,'ai-reflection-binding.json'))))===hash(expected),'NORMAL_RUN_CHANGED');
   check(identity.planHash===expected.planHash&&identity.contextHash===expected.contextHash&&identity.codeHead===expected.codeHead&&identity.approvalHash===approvalHash,'NORMAL_RUN_CONTEXT');
   // These durable, exclusive claims are deliberately never undone, including
   // partial reservation, cancellation and unknown provider outcomes.
   const global=privateDirectory(join(s.base,'artifacts/e6-managed-normal-reflection-claims'),{create:true});
   const evidence=approval.authorization?.evidenceSha256;check(/^[a-f0-9]{64}$/.test(evidence??''),'NORMAL_RUN_APPROVAL');
   const applicationHash=hash({applicationId:expected.applicationId});
   const reservation={version:'clear-normal-reflection-consumed.1',bindingHash:expected.bindingHash,runId:expected.runId,hostName:expected.hostName,
    applicationHash,authorizationEvidenceSha256:evidence,...identity};
   mark('RESERVED');
   await store.claim({...identity,runBindingHash:expected.bindingHash,runId:expected.runId,applicationHash,authorizationEvidenceSha256:evidence});
   try{
    atomicPrivate(join(global,'application-'+applicationHash+'.spent.json'),reservation,{exclusive:true});
    atomicPrivate(join(global,'approval-'+evidence+'.spent.json'),reservation,{exclusive:true});
   }catch{throw Error('NORMAL_RUN_SPENT_OR_RECOVERY_REQUIRED');}
  },
  async checkpoint(report){s.assertCurrent();
   // Write intent before any native transport/key access. Missing or partial history is never proof of non-dispatch.
   if(report.status==='DISPATCH_RESERVED')mark('DISPATCH_INTENT');
   else if(report.status==='RECEIVED')mark('RECEIVED');
   else if(report.status==='UNKNOWN_STOPPED')mark('UNKNOWN');
   await store.checkpoint({...report,runBindingHash:expected.bindingHash,runId:expected.runId});},
  });}catch(error){
   const phase=record.phase==='ENTERED'?'FAILED_BEFORE_CLAIM':record.phase==='RESERVED'?'RESERVED':record.phase==='RECEIVED'?'RECEIVED':'UNKNOWN';
   mark(phase,{code:executionErrorSummary(error).code});throw error;
  }
 });}finally{s.busy=false;}
}
