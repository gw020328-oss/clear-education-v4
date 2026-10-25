// Constructor-owned run capability. HTTP/approval inputs never choose a path.
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
 const state={directory,base,owner,offline,binding:null,assertCurrent(){check(hash(read())===hash(owner),'NORMAL_RUN_CHANGED');}};
 const capability=Object.freeze({assertCurrent(){
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
 return withE6PaidWireV3Store(journal,store=>action({
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
   await store.claim({...identity,runBindingHash:expected.bindingHash,runId:expected.runId,applicationHash,authorizationEvidenceSha256:evidence});
   try{
    atomicPrivate(join(global,'application-'+applicationHash+'.spent.json'),reservation,{exclusive:true});
    atomicPrivate(join(global,'approval-'+evidence+'.spent.json'),reservation,{exclusive:true});
   }catch{throw Error('NORMAL_RUN_SPENT_OR_RECOVERY_REQUIRED');}
  },
  async checkpoint(report){s.assertCurrent();await store.checkpoint({...report,runBindingHash:expected.bindingHash,runId:expected.runId});},
 }));
}
