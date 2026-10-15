import {freeze,requireRule as check} from '../policy/values.mjs';
import {digest,same} from '../policy/mvp/contract.mjs';
import {WORKFLOW_VERSION,LIMITS,validateRunContext,runContextHash,toPrecheckContext,verifyDocumentManifest,validateReviewSummary} from '../product-workflow/contract.mjs';
import {createReviewPreview} from './bound-policy.mjs';
import {precheckCode,precheckObservation,DOCUMENT_OBSERVATION_PROMPT_VERSION} from './precheck.mjs';

const statusReason={MISSING:'MISSING_INPUT',UNREADABLE:'UNREADABLE',POLICY_OPEN:'POLICY_OPEN',NEEDS_REVIEW:'NEEDS_SUPPLEMENT'};
const runReason={CANCELLED:'CANCELLED',TIMED_OUT:'TIMED_OUT',FAILED:'MODEL_FAILED',REFUSED:'MODEL_FAILED'};
function summarize(context,result,extra=[]){
  const records=result.records??(result.record?[result.record]:[]);
  let status=['POLICY_OPEN','UNREADABLE','NEEDS_REVIEW','MISSING'].find(s=>records.some(r=>r.reviewStatus===s))??'CHECKED';
  let reasons=[...extra];
  if(runReason[result.runStatus]){status='NEEDS_REVIEW';reasons.push({fieldId:null,code:runReason[result.runStatus]});}
  for(const group of result.details??[])for(const item of group.checks)if(item.status!=='CHECKED')reasons.push({fieldId:item.checkId,code:statusReason[item.status]??'NEEDS_SUPPLEMENT'});
  for(const f of result.fieldReview?.fields??[]){
    if(f.state==='OBSERVED')continue;
    const conflict=(result.fieldReview.flags??[]).some(flag=>typeof flag==='object'&&flag.code==='CONFLICT'&&(flag.fieldIds===null||flag.fieldIds.includes(f.fieldId)));
    reasons.push({fieldId:f.fieldId,code:conflict?'CONFLICT':f.state==='UNOBSERVED'?'MISSING_INPUT':'NEEDS_SUPPLEMENT'});
  }
  if(result.reason==='MODEL_OUTPUT_REJECTED')reasons.push({fieldId:null,code:'MODEL_FAILED'});
  if(extra.length&&status==='CHECKED')status='NEEDS_REVIEW';
  if(status!=='CHECKED'&&!reasons.length)reasons.push({fieldId:null,code:statusReason[status]??'NEEDS_SUPPLEMENT'});
  reasons=[...new Map(reasons.map(r=>[r.fieldId+':'+r.code,r])).values()];
  if(reasons.length>32)reasons=[{fieldId:null,code:'NEEDS_SUPPLEMENT'},...extra.filter(r=>r.code==='IMAGE_NOT_DECODED')];
  const value={version:WORKFLOW_VERSION,runContextHash:runContextHash(context),
    resultHash:digest('CLEAR-WORKFLOW-AI-RESULT.1',{runContextHash:runContextHash(context),result,limitations:extra}),
    reviewStatus:status,outcome:status==='CHECKED'?'PRECHECK_REQUIREMENTS_MET':status==='MISSING'?'NEEDS_SUPPLEMENT':'UNDETERMINED',reasons};
  validateReviewSummary(value);return freeze(value);
}
const stopped=(context,code)=>summarize(context,{runStatus:code,records:[]},[{fieldId:null,code}]);

// Trusted host supplies its issued context and reviewed in-process bound policy.
// This is not authentication, durable acceptance, upload or consent. No ledger,
// file persistence, provider lookup or paid transport is opened by this module.
export async function reviewWorkflowDocument({context,policy,submission,files},adapter,{signal,timeoutMs=1000,nowMs=()=>Date.now()}={}){
  const captured=structuredClone(context),input=structuredClone(submission);validateRunContext(captured);
  const s=captured.snapshot,preview=createReviewPreview(policy,s.binding);
  const plan=policy.planBindings.find(item=>item.ruleId===s.ruleId&&item.requirementId===s.requirementId);
  check(plan&&s.ruleHash===policy.compiled.ruleHashes[s.ruleId]&&s.planHash===plan.planHash&&s.planVersion===plan.planVersion
    &&s.displayHash===plan.displayHash&&s.reviewManifestHash===policy.manifestHash&&s.previewHash===preview.previewHash,'AI_WORKFLOW_POLICY_PIN');
  check(s.submissionId===input.submissionId&&s.submissionRevision===input.revision&&s.routeRevision===input.routeRevision,'AI_WORKFLOW_SUBMISSION_PIN');
  check(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'AI_WORKFLOW_TIMEOUT');
  verifyDocumentManifest(s.manifest,input,files);
  if(signal?.aborted)return stopped(captured,'CANCELLED');
  // Validate original bytes before allocating copies, then verify the copies too.
  const started=nowMs();check(Number.isSafeInteger(started)&&started>=0,'AI_WORKFLOW_CLOCK');
  const owned=[],observerCopies=[];
  try{
    for(const file of files)owned.push({...file,bytes:Buffer.from(file.bytes)});
    verifyDocumentManifest(s.manifest,input,owned);
    if(preview.status!=='READY_SYNTHETIC')return summarize(captured,{records:[{reviewStatus:'POLICY_OPEN'}]});
    const oldContext=toPrecheckContext(captured);let result;
    if(s.method==='CODE')result=precheckCode(policy.compiled,oldContext,input,{plan:plan.plan,pinnedPlanHash:plan.planHash});
    else{
      const profile=plan.observationPlans.find(p=>p.method===s.method);
      check(profile&&same(profile.fieldIds,s.fieldIds)&&profile.promptVersion===s.promptVersion&&s.promptVersion===DOCUMENT_OBSERVATION_PROMPT_VERSION,'AI_WORKFLOW_OBSERVATION_PIN');
      check(adapter?.execution==='MOCK'&&typeof adapter.observe==='function'&&adapter.modelVersion===s.modelVersion,'AI_WORKFLOW_MOCK_REQUIRED');
      result=await precheckObservation(policy.compiled,oldContext,input,{method:s.method,fieldIds:s.fieldIds,signal,timeoutMs,
        adapter:{execution:'MOCK',observe(request,options){
          const assets=[];for(const file of owned){const copy={...file,bytes:Buffer.from(file.bytes)};observerCopies.push(copy);assets.push(copy);}
          return adapter.observe({...request,assets,assetsHash:captured.assetsHash,runContextHash:runContextHash(captured)},options);
        }}});
    }
    verifyDocumentManifest(s.manifest,input,owned);
    if(observerCopies.length)verifyDocumentManifest(s.manifest,input,observerCopies);
    const ended=nowMs();check(Number.isSafeInteger(ended)&&ended>=started,'AI_WORKFLOW_CLOCK');
    if(signal?.aborted)return stopped(captured,'CANCELLED');
    if(ended-started>=LIMITS.rawRetentionSeconds*1000||ended-started>=LIMITS.runSeconds*1000)return stopped(captured,'TIMED_OUT');
    const limitations=s.method==='VISION'&&owned.length?[{fieldId:null,code:'IMAGE_NOT_DECODED'}]:[];
    return summarize(captured,result,limitations);
  }finally{
    // Zero copies we own. Caller buffers and libraries' independent copies are
    // outside our ownership; JS strings/GC and hard-kill erasure are not assured.
    for(const file of [...owned,...observerCopies])file.bytes.fill(0);
  }
}
