import {mkdir,lstat,realpath,open,readFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {atomicEvaluationCheckpoint} from '../../src/ai-policy/evaluation-ledger.mjs';
import {assessE6QualityResponse,sha} from './e6-quality-plan.mjs';
import {loadE6FreeBundle,FREE_LIMITS,FREE_KEY_SOURCE,FREE_MODEL,jsonSha} from './e6-free-plan.mjs';
const check=(c,code)=>{if(!c)throw Error(code);};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>jsonSha(a)===jsonSha(b);
const errors=new Set(['E6_FREE_TIMEOUT','E6_FREE_CURRENT','E6_FREE_APPROVAL','E6_FREE_PROJECT_CONFIRMATION',
  'E6_FREE_CREDENTIAL_INVALID','E6_FREE_RESPONSE','E6_FREE_MODEL','E6_FREE_USAGE_UNKNOWN','E6_FREE_OBSERVED_OUTPUT',
  'GEMINI_RATE_LIMIT','GEMINI_BILLING_ERROR','GEMINI_HTTP_FAILURE','GEMINI_NETWORK_FAILURE','GEMINI_REQUEST_ABORTED',
  'GEMINI_EMPTY_RESPONSE','GEMINI_RESPONSE_INVALID','GEMINI_RESPONSE_SIZE']);
export function validateE6FreeClearance({bundle,approval,projectConfirmation,codeState,day,execution}){
  check(same(bundle,loadE6FreeBundle()),'E6_FREE_PLAN_PIN');
  const p=bundle.plan,a=approval,v=projectConfirmation;
  check(['MOCK','ACTUAL'].includes(execution)&&a?.version==='clear-e6-free-user-approval.1'
    &&a.scope==='E6_PYTHON_FREE_TEXT_8_ONLY'&&a.approvedOn===day&&a.codeHead===codeState.head
    &&/^[a-f0-9]{40}$/.test(a.codeHead??'')&&codeState.clean===true&&a.planHash===p.planHash
    &&a.authorization?.kind===(execution==='ACTUAL'?'DIRECT_HUMAN_NEW_FREE_E6':'OFFLINE_TEST_ONLY')
    &&digest(a.authorization?.evidenceSha256)&&a.maxGenerationCalls===8&&a.maxCountCalls===0
    &&a.automaticRetries===0&&a.continuations===0&&a.paidFallbacks===0&&a.modelFallbacks===0
    &&a.keySourceId===FREE_KEY_SOURCE&&digest(a.projectScopeSha256)
    &&a.dataUseAcknowledgment==='PUBLIC_SYNTHETIC_TEXT_PRODUCT_IMPROVEMENT_ALLOWED','E6_FREE_APPROVAL');
  const pins={codeHead:a.codeHead,planHash:p.planHash,corpusSha256:p.corpusSha256,goldSha256:p.goldSha256,requestsSha256:p.requestsSha256};
  check(same(a.pins,pins),'E6_FREE_APPROVAL');
  check(v?.version==='clear-e6-free-project-confirmation.1'&&v.basis===(execution==='ACTUAL'?'HUMAN_UI_REVIEW_NOT_API_AUTHENTICATION':'OFFLINE_TEST_ONLY')
    &&digest(v.evidenceSha256)&&v.reviewedOn===day&&v.codeHead===a.codeHead&&v.planHash===p.planHash
    &&v.keySourceId===FREE_KEY_SOURCE&&v.projectScopeSha256===a.projectScopeSha256
    &&v.aiStudioBillingTier==='Free'&&v.billingAccountLinked===false&&v.googleCloudBillingEnabled===false
    &&v.keyBelongsToConfirmedProject===true&&v.rateLimits?.model===FREE_MODEL
    &&Number.isSafeInteger(v.rateLimits.rpm)&&v.rateLimits.rpm>=1
    &&Number.isSafeInteger(v.rateLimits.availableRpd)&&v.rateLimits.availableRpd>=8
    &&Number.isSafeInteger(v.rateLimits.tpm)&&v.rateLimits.tpm>0,'E6_FREE_PROJECT_CONFIRMATION');
  return {pins,approvalHash:jsonSha(a),projectConfirmationHash:jsonSha(v),
    scope:{keySourceId:FREE_KEY_SOURCE,projectScopeSha256:a.projectScopeSha256}};
}

// Free-only journal versions and directory; never reads or resets a paid ledger.
export async function withE6FreeStore(directory,action){
  const dir=resolve(directory);await mkdir(dir,{recursive:true,mode:0o700});const st=await lstat(dir);
  check(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(dir)===dir&&st.uid===process.getuid()&&(st.mode&0o077)===0,'E6_FREE_STORE');
  const path=resolve(dir,'execution.free.v1.lock'),token=randomUUID();let handle;
  try{handle=await open(path,'wx',0o600);}catch{throw Error('E6_FREE_BUSY_OR_RECOVERY_REQUIRED');}
  const syncDir=async()=>{const h=await open(dir,'r');try{await h.sync();}finally{await h.close();}};
  const assertLease=async()=>{const held=JSON.parse(await readFile(path,'utf8'));check(held.token===token,'E6_FREE_LEASE_OWNERSHIP');};
  try{
    await handle.writeFile(JSON.stringify({version:'clear-e6-free-lease.1',token,pid:process.pid}));await handle.sync();await handle.close();handle=null;await syncDir();
    return await action({async claim(identity){
      let h;try{h=await open(resolve(dir,'spent.free.v1.lock'),'wx',0o600);}catch{throw Error('E6_FREE_SPENT_OR_RECOVERY_REQUIRED');}
      try{await h.writeFile(JSON.stringify({version:'clear-e6-free-single-run.1',identity}));await h.sync();}finally{await h.close();}await syncDir();
    },async checkpoint(report){
      try{await assertLease();await atomicEvaluationCheckpoint(pathToFileURL(resolve(dir,'summary.free.v1.json')),report);await assertLease();}
      catch{throw Error('E6_FREE_CHECKPOINT_FAILED');}
    }});
  }finally{if(handle)await handle.close().catch(()=>{});await assertLease();await unlink(path);await syncDir();}
}

const waitDefault=ms=>new Promise(r=>setTimeout(r,ms));
export async function runE6Free({bundle,approval,projectConfirmation,codeState,day,execution='MOCK',store,transportFactory,
  currentCodeState=()=>codeState,currentDay=()=>day,currentControlHashes,nowMs=()=>Date.now(),wait=waitDefault,
  timeoutMs=FREE_LIMITS.timeoutMs}){
  bundle=structuredClone(bundle);approval=structuredClone(approval);projectConfirmation=structuredClone(projectConfirmation);
  const capturedCodeState=structuredClone(codeState);
  const clear=validateE6FreeClearance({bundle,approval,projectConfirmation,codeState:capturedCodeState,day,execution});
  const controls={approvalHash:clear.approvalHash,projectConfirmationHash:clear.projectConfirmationHash};
  const assertCurrent=async()=>{
    check(same(currentCodeState(),capturedCodeState)&&currentDay()===day,'E6_FREE_CURRENT');
    if(currentControlHashes)check(same(await currentControlHashes(),controls),'E6_FREE_CURRENT');
  };
  await assertCurrent();await store.claim({...clear.pins,...controls,projectScopeSha256:clear.scope.projectScopeSha256});
  const report={version:'clear-e6-free-run-summary.1',execution,syntheticOnly:true,pins:clear.pins,...controls,
    projectScopeSha256:clear.scope.projectScopeSha256,status:'STARTED',generationCalls:0,countCalls:0,
    cost:{conditionalUsd:'0',condition:'PROJECT_REMAINS_FREE_AND_UNLINKED_FOR_ENTIRE_RUN',
      basis:'HUMAN_CONFIRMED_FREE_UNLINKED_PROJECT',actualCharges:'N/A_NOT_INDEPENDENTLY_VERIFIED'},
    usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false,
    attempts:bundle.requests.map(r=>({caseId:r.caseId,requestSha256:r.bodySha256,status:'NOT_RUN',dispatchReserved:false}))};
  const checkpoint=async()=>{try{await store.checkpoint(structuredClone(report));}catch{throw Error('E6_FREE_CHECKPOINT_FAILED');}};
  await checkpoint();let transport,lastDispatch=null,lastClock=nowMs();
  const clock=()=>{const n=nowMs();check(Number.isSafeInteger(n)&&n>=lastClock,'E6_FREE_CURRENT');lastClock=n;return n;};
  for(let i=0;i<bundle.requests.length;i++){
    const request=bundle.requests[i],attempt=report.attempts[i];
    try{
      await assertCurrent();
      // Pacing is a conservative request policy, not a guarantee of free quota.
      while(lastDispatch!==null&&clock()-lastDispatch<FREE_LIMITS.minimumDispatchIntervalMs){
        await wait(Math.min(1000,FREE_LIMITS.minimumDispatchIntervalMs-(clock()-lastDispatch)));await assertCurrent();
      }
      validateE6FreeClearance({bundle,approval,projectConfirmation,codeState:capturedCodeState,day,execution});
      check(report.generationCalls<8,'E6_FREE_APPROVAL');
      attempt.status='DISPATCH_RESERVED';attempt.dispatchReserved=true;report.status='DISPATCH_RESERVED';report.generationCalls++;
      await checkpoint();await assertCurrent();
      if(!transport)transport=transportFactory(structuredClone(clear.scope));
      check(transport?.execution===execution,'E6_FREE_APPROVAL');lastDispatch=clock();
      const controller=new AbortController();let timer,response;
      try{response=await Promise.race([
        Promise.resolve().then(()=>transport.request(FREE_MODEL,'generateContent',structuredClone(request.body),controller.signal)),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('E6_FREE_TIMEOUT'));},timeoutMs);})]);}
      finally{clearTimeout(timer);}
      await assertCurrent();check(response?.modelVersion===FREE_MODEL,'E6_FREE_MODEL');
      const u=response.usageMetadata,tokens={};
      for(const k of ['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'])
        tokens[k]=Number.isSafeInteger(u?.[k])&&u[k]>=0?u[k]:null;
      attempt.tokens=tokens;attempt.tokenMeasurement='N/A_INCOMPLETE_USAGE';
      check(Object.values(tokens).every(v=>v!==null)&&tokens.totalTokenCount===tokens.promptTokenCount+tokens.candidatesTokenCount+tokens.thoughtsTokenCount,'E6_FREE_USAGE_UNKNOWN');
      attempt.tokenMeasurement='PROVIDER_REPORTED_NOT_BILLING_VERIFIED';
      // An observed excess stops subsequent requests; this is NOT a pre-charge cap.
      check(tokens.candidatesTokenCount+tokens.thoughtsTokenCount<=1024,'E6_FREE_OBSERVED_OUTPUT');
      const candidate=response.candidates?.[0],parts=candidate?.content?.parts;
      check(response.candidates?.length===1&&candidate.finishReason==='STOP'&&!response.promptFeedback?.blockReason
        &&Array.isArray(parts)&&parts.length>0&&parts.every(p=>typeof p.text==='string'&&!p.thought),'E6_FREE_RESPONSE');
      const text=parts.map(p=>p.text).join('');attempt.responseSha256=sha(text);let raw;
      try{raw=JSON.parse(text);}catch{throw Error('E6_FREE_RESPONSE');}
      check(raw&&Object.keys(raw).length===1&&Array.isArray(raw.topics)&&raw.topics.length===3,'E6_FREE_RESPONSE');
      const ids=bundle.gold.cases[0].topics.map(t=>t.topicId);
      check(new Set(raw.topics.map(t=>t?.topicId)).size===3&&raw.topics.every(t=>t&&Object.keys(t).sort().join(',')==='evidence,state,topicId'
        &&ids.includes(t.topicId)&&['PRESENT','MISSING','UNCERTAIN','CONFLICT'].includes(t.state)
        &&(t.state==='PRESENT'?t.evidence&&Object.keys(t.evidence).sort().join(',')==='quote,sourceId'
          &&typeof t.evidence.quote==='string'&&typeof t.evidence.sourceId==='string':t.evidence===null)),'E6_FREE_RESPONSE');
      const c=bundle.corpus.cases[i],g=bundle.gold.cases.find(g=>g.caseId===request.caseId);
      const a=await assessE6QualityResponse(c,raw,g,bundle.corpus.sourceId);
      attempt.status=a.status;attempt.assessment={errors:a.errors.length,falseHolds:a.errors.filter(e=>e.startsWith('FALSE_HOLD:')).length,normalControl:g.normalControl};
    }catch(e){
      if(e?.message==='E6_FREE_CHECKPOINT_FAILED')throw e;
      attempt.status=attempt.dispatchReserved?'UNKNOWN_STOPPED':'NOT_RUN';attempt.code=errors.has(e?.message)?e.message:'E6_FREE_UNKNOWN';
      report.status='UNKNOWN_STOPPED';await checkpoint();return report;
    }
    report.status='CASE_FINISHED';await checkpoint();
  }
  report.status='FINISHED';report.aggregate={cases:8,passed:report.attempts.filter(a=>a.status==='PASS').length,
    needsImprovement:report.attempts.filter(a=>a.status==='NEEDS_IMPROVEMENT').length,
    falseHolds:report.attempts.reduce((n,a)=>n+a.assessment.falseHolds,0)};
  await checkpoint();return report;
}
