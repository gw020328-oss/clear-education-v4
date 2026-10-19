// Separate paid-eight policy: no Free records, no hard-cash-cap attestation.
import {mkdir,lstat,realpath,open,readFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {atomicEvaluationCheckpoint} from '../../src/ai-policy/evaluation-ledger.mjs';
import {assessE6QualityResponse,sha} from './e6-quality-plan.mjs';
import {loadE6PaidEightBundle,PAID_EIGHT_LIMITS,PAID_EIGHT_MODEL,EXISTING_PAID_KEY_SOURCE,PAID_COST_ACK,jsonSha} from './e6-paid-eight-plan.mjs';
const check=(c,code)=>{if(!c)throw Error(code);};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>jsonSha(a)===jsonSha(b);
const errors=new Set(['E6_PAID8_TIMEOUT','E6_PAID8_CURRENT','E6_PAID8_APPROVAL','E6_PAID8_KEY_SOURCE',
  'E6_PAID8_RESPONSE','E6_PAID8_MODEL','E6_PAID8_USAGE_UNKNOWN','E6_PAID8_OBSERVED_OUTPUT',
  'E6_PAID8_OBSERVED_INPUT_STOP','E6_PAID8_OBSERVED_COST_STOP','GEMINI_KEY_MISSING',
  'GEMINI_RATE_LIMIT','GEMINI_BILLING_ERROR','GEMINI_HTTP_FAILURE','GEMINI_NETWORK_FAILURE','GEMINI_REQUEST_ABORTED',
  'GEMINI_EMPTY_RESPONSE','GEMINI_RESPONSE_INVALID','GEMINI_RESPONSE_SIZE']);
export function validateE6PaidEightClearance({bundle,approval,codeState,day,execution}){
  check(same(bundle,loadE6PaidEightBundle()),'E6_PAID8_PLAN_PIN');const a=approval,p=bundle.plan;
  const keys=['version','scope','approvedOn','codeHead','planHash','authorization','maxGenerationCalls','maxCountCalls',
    'automaticRetries','continuations','keySourceFallbacks','modelFallbacks','freeFallbacks','keySourceId','costAcknowledgment','pricingReview','pins'];
  check(a&&Object.keys(a).sort().join(',')===keys.sort().join(',')&&['MOCK','ACTUAL'].includes(execution)
    &&a.version==='clear-e6-paid-eight-user-approval.1'&&a.scope==='E6_EXISTING_PAID_KEY_EIGHT_GENERATIONS'
    &&a.approvedOn===day&&a.codeHead===codeState.head&&/^[a-f0-9]{40}$/.test(a.codeHead??'')&&codeState.clean===true
    &&a.planHash===p.planHash&&a.authorization?.kind===(execution==='ACTUAL'?'DIRECT_HUMAN_NEW_PAID_EIGHT_E6':'OFFLINE_TEST_ONLY')
    &&digest(a.authorization?.evidenceSha256)&&a.maxGenerationCalls===8&&a.maxCountCalls===0&&a.automaticRetries===0
    &&a.continuations===0&&a.keySourceFallbacks===0&&a.modelFallbacks===0&&a.freeFallbacks===0
    &&a.keySourceId===EXISTING_PAID_KEY_SOURCE&&a.costAcknowledgment===PAID_COST_ACK
    &&a.pricingReview?.reviewedOn===day&&a.pricingReview.inputNanoUsdPerToken==='300'
    &&a.pricingReview.outputIncludingThinkingNanoUsdPerToken==='2500'&&a.pricingReview.officialSource===p.officialPricingSource
    &&digest(a.pricingReview.evidenceSha256)
    &&a.pricingReview.basis===(execution==='ACTUAL'?'PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION':'OFFLINE_TEST_ONLY'),'E6_PAID8_APPROVAL');
  const pins={codeHead:a.codeHead,planHash:p.planHash,corpusSha256:p.corpusSha256,goldSha256:p.goldSha256,requestsSha256:p.requestsSha256};
  check(same(a.pins,pins),'E6_PAID8_APPROVAL');
  return {pins,approvalHash:jsonSha(a),scope:{keySourceId:EXISTING_PAID_KEY_SOURCE}};
}

// Paid-eight-only journal versions and directory; never reads/resets another ledger.
export async function withE6PaidEightStore(directory,action){
  const dir=resolve(directory);await mkdir(dir,{recursive:true,mode:0o700});const st=await lstat(dir);
  check(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(dir)===dir&&st.uid===process.getuid()&&(st.mode&0o077)===0,'E6_PAID8_STORE');
  const path=resolve(dir,'execution.paid-eight.v1.lock'),token=randomUUID();let handle;
  try{handle=await open(path,'wx',0o600);}catch{throw Error('E6_PAID8_BUSY_OR_RECOVERY_REQUIRED');}
  const syncDir=async()=>{const h=await open(dir,'r');try{await h.sync();}finally{await h.close();}};
  const assertLease=async()=>{const held=JSON.parse(await readFile(path,'utf8'));check(held.token===token,'E6_PAID8_LEASE_OWNERSHIP');};
  try{
    await handle.writeFile(JSON.stringify({version:'clear-e6-paid-eight-lease.1',token,pid:process.pid}));await handle.sync();await handle.close();handle=null;await syncDir();
    return await action({async claim(identity){
      let h;try{h=await open(resolve(dir,'spent.paid-eight.v1.lock'),'wx',0o600);}catch{throw Error('E6_PAID8_SPENT_OR_RECOVERY_REQUIRED');}
      try{await h.writeFile(JSON.stringify({version:'clear-e6-paid-eight-single-run.1',identity}));await h.sync();}finally{await h.close();}await syncDir();
    },async checkpoint(report){
      try{await assertLease();await atomicEvaluationCheckpoint(pathToFileURL(resolve(dir,'summary.paid-eight.v1.json')),report);await assertLease();}
      catch{throw Error('E6_PAID8_CHECKPOINT_FAILED');}
    }});
  }finally{if(handle)await handle.close().catch(()=>{});await assertLease();await unlink(path);await syncDir();}
}

const waitDefault=ms=>new Promise(r=>setTimeout(r,ms));
export async function runE6PaidEight({bundle,approval,codeState,day,execution='MOCK',store,transportFactory,
  currentCodeState=()=>codeState,currentDay=()=>day,currentApprovalHash,nowMs=()=>Date.now(),wait=waitDefault,
  timeoutMs=PAID_EIGHT_LIMITS.timeoutMs}){
  bundle=structuredClone(bundle);approval=structuredClone(approval);
  const capturedCodeState=structuredClone(codeState);
  const clear=validateE6PaidEightClearance({bundle,approval,codeState:capturedCodeState,day,execution});
  const controls={approvalHash:clear.approvalHash};
  const assertCurrent=async()=>{
    check(same(currentCodeState(),capturedCodeState)&&currentDay()===day,'E6_PAID8_CURRENT');
    if(currentApprovalHash)check(await currentApprovalHash()===clear.approvalHash,'E6_PAID8_CURRENT');
  };
  await assertCurrent();await store.claim({...clear.pins,...controls,keySourceId:clear.scope.keySourceId});
  const report={version:'clear-e6-paid-eight-run-summary.1',execution,syntheticOnly:true,pins:clear.pins,...controls,
    keySourceId:clear.scope.keySourceId,status:'STARTED',generationCalls:0,countCalls:0,
    cost:{mode:'REQUEST_LIMITED_ESTIMATE_NOT_HARD_CASH_CAP',scenarioNanoUsd:'27680000',
      knownCompletedUsageEstimateNanoUsd:'0',measurement:'NO_PROVIDER_USAGE_YET',invoiceVerified:false},
    usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false,
    attempts:bundle.requests.map(r=>({caseId:r.caseId,requestSha256:r.bodySha256,status:'NOT_RUN',dispatchReserved:false}))};
  const checkpoint=async()=>{try{await store.checkpoint(structuredClone(report));}catch{throw Error('E6_PAID8_CHECKPOINT_FAILED');}};
  await checkpoint();let transport,lastDispatch=null,lastClock=nowMs();
  const clock=()=>{const n=nowMs();check(Number.isSafeInteger(n)&&n>=lastClock,'E6_PAID8_CURRENT');lastClock=n;return n;};
  for(let i=0;i<bundle.requests.length;i++){
    const request=bundle.requests[i],attempt=report.attempts[i];
    try{
      await assertCurrent();
      // Pacing does not reserve quota or enforce a provider cash cap.
      while(lastDispatch!==null&&clock()-lastDispatch<PAID_EIGHT_LIMITS.minimumDispatchIntervalMs){
        await wait(Math.min(1000,PAID_EIGHT_LIMITS.minimumDispatchIntervalMs-(clock()-lastDispatch)));await assertCurrent();
      }
      validateE6PaidEightClearance({bundle,approval,codeState:capturedCodeState,day,execution});
      check(report.generationCalls<8,'E6_PAID8_APPROVAL');
      attempt.status='DISPATCH_RESERVED';attempt.dispatchReserved=true;report.status='DISPATCH_RESERVED';report.generationCalls++;
      report.cost.measurement='N/A_PENDING_OR_UNKNOWN_USAGE';
      await checkpoint();await assertCurrent();
      if(!transport)transport=transportFactory(structuredClone(clear.scope));
      check(transport?.execution===execution,'E6_PAID8_APPROVAL');lastDispatch=clock();
      const controller=new AbortController();let timer,response;
      try{response=await Promise.race([
        Promise.resolve().then(()=>transport.request(PAID_EIGHT_MODEL,'generateContent',structuredClone(request.body),controller.signal)),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('E6_PAID8_TIMEOUT'));},timeoutMs);})]);}
      finally{clearTimeout(timer);}
      await assertCurrent();check(response?.modelVersion===PAID_EIGHT_MODEL,'E6_PAID8_MODEL');
      const u=response.usageMetadata,tokens={};
      for(const k of ['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'])
        tokens[k]=Number.isSafeInteger(u?.[k])&&u[k]>=0?u[k]:null;
      attempt.tokens=tokens;attempt.tokenMeasurement='N/A_INCOMPLETE_USAGE';
      check(Object.values(tokens).every(v=>v!==null)&&tokens.totalTokenCount===tokens.promptTokenCount+tokens.candidatesTokenCount+tokens.thoughtsTokenCount,'E6_PAID8_USAGE_UNKNOWN');
      attempt.tokenMeasurement='PROVIDER_REPORTED_NOT_BILLING_VERIFIED';
      const estimate=BigInt(tokens.promptTokenCount)*300n+BigInt(tokens.candidatesTokenCount+tokens.thoughtsTokenCount)*2500n;
      attempt.tokenBasedGenerationEstimateNanoUsd=String(estimate);
      report.cost.knownCompletedUsageEstimateNanoUsd=String(BigInt(report.cost.knownCompletedUsageEstimateNanoUsd)+estimate);
      report.cost.measurement='PROVIDER_TOKEN_ESTIMATE_NOT_INVOICE';
      // These stop only LATER dispatch. The current call may already exceed $0.05.
      check(BigInt(report.cost.knownCompletedUsageEstimateNanoUsd)<50000000n,'E6_PAID8_OBSERVED_COST_STOP');
      check(tokens.promptTokenCount<=3000,'E6_PAID8_OBSERVED_INPUT_STOP');
      check(tokens.candidatesTokenCount+tokens.thoughtsTokenCount<=1024,'E6_PAID8_OBSERVED_OUTPUT');
      const candidate=response.candidates?.[0],parts=candidate?.content?.parts;
      check(response.candidates?.length===1&&candidate.finishReason==='STOP'&&!response.promptFeedback?.blockReason
        &&Array.isArray(parts)&&parts.length>0&&parts.every(p=>typeof p.text==='string'&&!p.thought),'E6_PAID8_RESPONSE');
      const text=parts.map(p=>p.text).join('');attempt.responseSha256=sha(text);let raw;
      try{raw=JSON.parse(text);}catch{throw Error('E6_PAID8_RESPONSE');}
      check(raw&&Object.keys(raw).length===1&&Array.isArray(raw.topics)&&raw.topics.length===3,'E6_PAID8_RESPONSE');
      const ids=bundle.gold.cases[0].topics.map(t=>t.topicId);
      check(new Set(raw.topics.map(t=>t?.topicId)).size===3&&raw.topics.every(t=>t&&Object.keys(t).sort().join(',')==='evidence,state,topicId'
        &&ids.includes(t.topicId)&&['PRESENT','MISSING','UNCERTAIN','CONFLICT'].includes(t.state)
        &&(t.state==='PRESENT'?t.evidence&&Object.keys(t.evidence).sort().join(',')==='quote,sourceId'
          &&typeof t.evidence.quote==='string'&&typeof t.evidence.sourceId==='string':t.evidence===null)),'E6_PAID8_RESPONSE');
      const c=bundle.corpus.cases[i],g=bundle.gold.cases.find(g=>g.caseId===request.caseId);
      const a=await assessE6QualityResponse(c,raw,g,bundle.corpus.sourceId);
      attempt.status=a.status;attempt.assessment={errors:a.errors.length,falseHolds:a.errors.filter(e=>e.startsWith('FALSE_HOLD:')).length,normalControl:g.normalControl};
    }catch(e){
      if(e?.message==='E6_PAID8_CHECKPOINT_FAILED')throw e;
      attempt.status=attempt.dispatchReserved?'UNKNOWN_STOPPED':'NOT_RUN';attempt.code=errors.has(e?.message)?e.message:'E6_PAID8_UNKNOWN';
      report.status='UNKNOWN_STOPPED';await checkpoint();return report;
    }
    report.status='CASE_FINISHED';await checkpoint();
  }
  report.status='FINISHED';report.aggregate={cases:8,passed:report.attempts.filter(a=>a.status==='PASS').length,
    needsImprovement:report.attempts.filter(a=>a.status==='NEEDS_IMPROVEMENT').length,
    falseHolds:report.attempts.reduce((n,a)=>n+a.assessment.falseHolds,0)};
  await checkpoint();return report;
}
