// Fresh v3 proposal; preserves v1/v2 code, approvals, journals and failed results.
import {mkdir,lstat,realpath,open,readFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {atomicEvaluationCheckpoint} from '../../src/ai-policy/evaluation-ledger.mjs';
import {loadE6PaidWireV3Bundle,PAID_EIGHT_LIMITS,PAID_EIGHT_MODEL,EXISTING_PAID_KEY_SOURCE,PAID_COST_ACK,jsonSha} from './e6-paid-wire-v3-plan.mjs';
import {assessReceivedResponseV3,safeRawUsage} from './e6-wire-v3.mjs';
const check=(c,code)=>{if(!c)throw Error(code);};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>jsonSha(a)===jsonSha(b);
const errors=new Set(['E6_WV3_TIMEOUT','E6_WV3_CURRENT','E6_WV3_APPROVAL','E6_WV3_MODEL',
 'GEMINI_KEY_MISSING','GEMINI_RATE_LIMIT','GEMINI_BILLING_ERROR','GEMINI_HTTP_FAILURE','GEMINI_NETWORK_FAILURE',
 'GEMINI_REQUEST_ABORTED','GEMINI_EMPTY_RESPONSE','GEMINI_RESPONSE_INVALID','GEMINI_RESPONSE_SIZE']);
export function validateE6PaidWireV3Clearance({bundle,approval,codeState,day,execution}){
  check(same(bundle,loadE6PaidWireV3Bundle()),'E6_WV3_PLAN_PIN');const a=approval,p=bundle.plan;
  const keys=['version','scope','approvedOn','codeHead','planHash','authorization','maxGenerationCalls','maxCountCalls',
    'automaticRetries','continuations','keySourceFallbacks','modelFallbacks','freeFallbacks','keySourceId','costAcknowledgment','pricingReview','pins'];
  check(a&&Object.keys(a).sort().join(',')===keys.sort().join(',')&&['MOCK','ACTUAL'].includes(execution)
    &&a.version==='clear-e6-paid-wire-v3-user-approval.3'&&a.scope==='E6_PAID_WIRE_V3_FRESH_EIGHT'
    &&a.approvedOn===day&&a.codeHead===codeState.head&&/^[a-f0-9]{40}$/.test(a.codeHead??'')&&codeState.clean===true
    &&a.planHash===p.planHash&&a.authorization?.kind===(execution==='ACTUAL'?'DIRECT_HUMAN_NEW_PAID_WIRE_V3_FRESH_EIGHT':'OFFLINE_TEST_ONLY')
    &&digest(a.authorization?.evidenceSha256)&&a.maxGenerationCalls===8&&a.maxCountCalls===0&&a.automaticRetries===0
    &&a.continuations===0&&a.keySourceFallbacks===0&&a.modelFallbacks===0&&a.freeFallbacks===0
    &&a.keySourceId===EXISTING_PAID_KEY_SOURCE&&a.costAcknowledgment===PAID_COST_ACK
    &&a.pricingReview?.reviewedOn===day&&a.pricingReview.inputNanoUsdPerToken==='300'
    &&a.pricingReview.outputIncludingThinkingNanoUsdPerToken==='2500'&&a.pricingReview.officialSource===p.officialPricingSource
    &&digest(a.pricingReview.evidenceSha256)
    &&a.pricingReview.basis===(execution==='ACTUAL'?'PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION':'OFFLINE_TEST_ONLY'),'E6_WV3_APPROVAL');
  const pins={codeHead:a.codeHead,planHash:p.planHash,corpusSha256:p.corpusSha256,goldSha256:p.goldSha256,requestsSha256:p.requestsSha256,usagePolicyHash:p.usagePolicyHash};
  check(same(a.pins,pins),'E6_WV3_APPROVAL');
  return {pins,approvalHash:jsonSha(a),scope:{keySourceId:EXISTING_PAID_KEY_SOURCE}};
}

// Paid-eight-only journal versions and directory; never reads/resets another ledger.
export async function withE6PaidWireV3Store(directory,action){
  const dir=resolve(directory);await mkdir(dir,{recursive:true,mode:0o700});const st=await lstat(dir);
  check(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(dir)===dir&&st.uid===process.getuid()&&(st.mode&0o077)===0,'E6_WV3_STORE');
  const path=resolve(dir,'execution.paid-wire.v3.lock'),token=randomUUID();let handle;
  try{handle=await open(path,'wx',0o600);}catch{throw Error('E6_WV3_BUSY_OR_RECOVERY_REQUIRED');}
  const syncDir=async()=>{const h=await open(dir,'r');try{await h.sync();}finally{await h.close();}};
  const assertLease=async()=>{const held=JSON.parse(await readFile(path,'utf8'));check(held.token===token,'E6_WV3_LEASE_OWNERSHIP');};
  try{
    await handle.writeFile(JSON.stringify({version:'clear-e6-paid-wire-v3-lease.3',token,pid:process.pid}));await handle.sync();await handle.close();handle=null;await syncDir();
    return await action({async claim(identity){
      let h;try{h=await open(resolve(dir,'spent.paid-wire.v3.lock'),'wx',0o600);}catch{throw Error('E6_WV3_SPENT_OR_RECOVERY_REQUIRED');}
      try{await h.writeFile(JSON.stringify({version:'clear-e6-paid-wire-v3-single-run.3',identity}));await h.sync();}finally{await h.close();}await syncDir();
    },async checkpoint(report){
      try{await assertLease();await atomicEvaluationCheckpoint(pathToFileURL(resolve(dir,'summary.paid-wire.v3.json')),report);await assertLease();}
      catch{throw Error('E6_WV3_CHECKPOINT_FAILED');}
    }});
  }finally{if(handle)await handle.close().catch(()=>{});await assertLease();await unlink(path);await syncDir();}
}

function aggregate(report){
 const scored=report.attempts.filter(a=>a.assessment),normal=scored.filter(a=>a.assessment.normalControl);
 const sum=key=>scored.reduce((n,a)=>n+a.assessment[key],0),topics=sum('scoredTopics'),correct=sum('correctTopicStates');
 return {plannedCases:8,scorableCases:scored.length,passed:scored.filter(a=>a.status==='PASS').length,
  needsImprovement:scored.filter(a=>a.status==='NEEDS_IMPROVEMENT').length,notRun:report.attempts.filter(a=>a.status==='NOT_RUN').length,
  scoredTopics:topics,correctTopicStates:correct,topicAccuracy:topics?correct/topics:null,
  expectedPresentTopicsAssessed:sum('expectedPresentTopics'),groundedPresentTopics:sum('groundedPresentTopics'),
  assessedNormalControls:normal.length,assessedNormalControlTopics:normal.reduce((n,a)=>n+a.assessment.scoredTopics,0),
  falseHoldTopics:normal.length?normal.reduce((n,a)=>n+a.assessment.falseHoldTopics,0):null,
  falseHoldCases:normal.length?normal.reduce((n,a)=>n+a.assessment.falseHoldCases,0):null};
}
const waitDefault=ms=>new Promise(r=>setTimeout(r,ms));
export async function runE6PaidWireV3({bundle,approval,codeState,day,execution='MOCK',store,transportFactory,
  currentCodeState=()=>codeState,currentDay=()=>day,currentApprovalHash,nowMs=()=>Date.now(),wait=waitDefault,
  timeoutMs=PAID_EIGHT_LIMITS.timeoutMs}){
  bundle=structuredClone(bundle);approval=structuredClone(approval);
  const capturedCodeState=structuredClone(codeState);
  const clear=validateE6PaidWireV3Clearance({bundle,approval,codeState:capturedCodeState,day,execution});
  const controls={approvalHash:clear.approvalHash};
  const assertCurrent=async()=>{
    check(same(currentCodeState(),capturedCodeState)&&currentDay()===day,'E6_WV3_CURRENT');
    if(currentApprovalHash)check(await currentApprovalHash()===clear.approvalHash,'E6_WV3_CURRENT');
  };
  await assertCurrent();await store.claim({...clear.pins,...controls,keySourceId:clear.scope.keySourceId});
  const report={version:'clear-e6-paid-wire-v3-run-summary.3',execution,syntheticOnly:true,pins:clear.pins,...controls,
    keySourceId:clear.scope.keySourceId,status:'STARTED',generationCalls:0,countCalls:0,
    cost:{mode:'REQUEST_LIMITED_ESTIMATE_NOT_HARD_CASH_CAP',scenarioNanoUsd:'27680000',
      knownCompletedUsageEstimateNanoUsd:'0',unknownUsageReservedCalls:0,measurement:'NO_PROVIDER_USAGE_YET',invoiceVerified:false,providerHardCashCapVerified:false},
    usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false,
    attempts:bundle.requests.map(r=>({caseId:r.caseId,requestSha256:r.bodySha256,status:'NOT_RUN',dispatchReserved:false}))};
  const checkpoint=async()=>{try{await store.checkpoint(structuredClone(report));}catch{throw Error('E6_WV3_CHECKPOINT_FAILED');}};
  await checkpoint();let transport,lastDispatch=null,lastClock=nowMs();
  const clock=()=>{const n=nowMs();check(Number.isSafeInteger(n)&&n>=lastClock,'E6_WV3_CURRENT');lastClock=n;return n;};
  for(let i=0;i<bundle.requests.length;i++){
    const request=bundle.requests[i],attempt=report.attempts[i];
    try{
      await assertCurrent();
      // Pacing does not reserve quota or enforce a provider cash cap.
      while(lastDispatch!==null&&clock()-lastDispatch<PAID_EIGHT_LIMITS.minimumDispatchIntervalMs){
        await wait(Math.min(1000,PAID_EIGHT_LIMITS.minimumDispatchIntervalMs-(clock()-lastDispatch)));await assertCurrent();
      }
      validateE6PaidWireV3Clearance({bundle,approval,codeState:capturedCodeState,day,execution});
      check(report.generationCalls<8,'E6_WV3_APPROVAL');
      attempt.status='DISPATCH_RESERVED';attempt.dispatchReserved=true;report.status='DISPATCH_RESERVED';report.generationCalls++;
      report.cost.measurement='N/A_PENDING_OR_UNKNOWN_USAGE';
      await checkpoint();await assertCurrent();
      if(!transport)transport=transportFactory(structuredClone(clear.scope));
      check(transport?.execution===execution,'E6_WV3_APPROVAL');lastDispatch=clock();
      const controller=new AbortController();let timer,response;
      try{response=await Promise.race([
        Promise.resolve().then(()=>transport.request(PAID_EIGHT_MODEL,'generateContent',structuredClone(request.body),controller.signal)),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('E6_WV3_TIMEOUT'));},timeoutMs);})]);}
      finally{clearTimeout(timer);}
      await assertCurrent();check(response?.modelVersion===PAID_EIGHT_MODEL,'E6_WV3_MODEL');
      const evaluated=await assessReceivedResponseV3({response,corpusCase:bundle.corpus.cases[i],
        goldCase:bundle.gold.cases.find(g=>g.caseId===request.caseId),sourceId:bundle.corpus.sourceId});
      attempt.tokens=safeRawUsage(response.usageMetadata);attempt.quality=evaluated.quality;attempt.usage=evaluated.usage;
      attempt.status=evaluated.quality.status;
      if(evaluated.quality.assessment)attempt.assessment=evaluated.quality.assessment;
      if(evaluated.usage.status==='CONDITIONAL_BOUND'){
        const estimate=BigInt(evaluated.usage.conditionalGenerationEstimateNanoUsd);
        report.cost.knownCompletedUsageEstimateNanoUsd=String(BigInt(report.cost.knownCompletedUsageEstimateNanoUsd)+estimate);
        report.cost.measurement='DERIVED_COMBINED_BOUND_NOT_INVOICE';
      }else{report.cost.measurement='N/A_PENDING_OR_UNKNOWN_USAGE';report.cost.unknownUsageReservedCalls++;}
      let stopCode=!evaluated.nextDispatchAllowed?(evaluated.usage.code??evaluated.quality.code):null;
      if(!stopCode&&BigInt(report.cost.knownCompletedUsageEstimateNanoUsd)>=50000000n)stopCode='E6_WV3_OBSERVED_COST_STOP';
      if(!stopCode&&attempt.tokens.promptTokenCount>3000)stopCode='E6_WV3_OBSERVED_INPUT_STOP';
      if(!stopCode&&evaluated.usage.derived.combinedGeneratedUpperBoundTokens>1024)stopCode='E6_WV3_OBSERVED_OUTPUT';
      if(stopCode){attempt.nextDispatchAllowed=false;attempt.stopCode=stopCode;report.status='PARTIAL_STOPPED';
        report.aggregate=aggregate(report);await checkpoint();return report;}
      attempt.nextDispatchAllowed=true;
    }catch(e){
      if(e?.message==='E6_WV3_CHECKPOINT_FAILED')throw e;
      if(attempt.dispatchReserved)report.cost.unknownUsageReservedCalls++;
      attempt.status=attempt.dispatchReserved?'UNKNOWN_STOPPED':'NOT_RUN';attempt.code=errors.has(e?.message)?e.message:'E6_WV3_UNKNOWN';
      report.status='UNKNOWN_STOPPED';report.aggregate=aggregate(report);await checkpoint();return report;
    }
    report.status='CASE_FINISHED';await checkpoint();
  }
  report.status='FINISHED';report.aggregate=aggregate(report);
  await checkpoint();return report;
}
