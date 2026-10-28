// Public fixed synthetic preparation only; no environment, private file or transport.
import {readFileSync} from 'node:fs';
import {prepareE6QualityPlan,loadE6QualityCorpus,sha} from './e6-quality-plan.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
export const FREE_KEY_SOURCE='clear-e6-python-free-only-file.1';
export const FREE_MODEL='gemini-3.5-flash-lite';
export const FREE_LIMITS=Object.freeze({sourceUtf8Bytes:2048,requestUtf8Bytes:8192,generationCalls:8,
  countCalls:0,maxOutputTokens:1024,timeoutMs:45000,minimumDispatchIntervalMs:60000});
export const jsonSha=v=>sha(JSON.stringify(v));
export function validateFreeRequestBytes(bundle){
  if(bundle.corpus.cases.some(c=>Buffer.byteLength(c.text,'utf8')>FREE_LIMITS.sourceUtf8Bytes))throw Error('E6_FREE_SOURCE_BYTES');
  for(const r of bundle.requests){const bytes=Buffer.byteLength(JSON.stringify(r.body),'utf8');
    if(bytes>FREE_LIMITS.requestUtf8Bytes||bytes!==r.utf8Bytes||jsonSha(r.body)!==r.bodySha256)throw Error('E6_FREE_REQUEST_BYTES');
  }
}
export function prepareE6FreePlan(){
  const paid=prepareE6QualityPlan(),loaded=loadE6QualityCorpus();
  const requests=paid.requests.map(r=>{
    const body=structuredClone(r.body);delete body.generationConfig.temperature;delete body.generationConfig.candidateCount;
    const utf8Bytes=Buffer.byteLength(JSON.stringify(body),'utf8');
    if(utf8Bytes>FREE_LIMITS.requestUtf8Bytes)throw Error('E6_FREE_REQUEST_BYTES');
    return {caseId:r.caseId,body,utf8Bytes,bodySha256:jsonSha(body)};
  });
  for(const c of loaded.corpus.cases)if(Buffer.byteLength(c.text,'utf8')>FREE_LIMITS.sourceUtf8Bytes)throw Error('E6_FREE_SOURCE_BYTES');
  const plan={version:'clear-e6-python-free-plan.1',status:'PREPARED_NOT_APPROVED_ACTUAL_BLOCKED',checkedOn:'2026-10-19',
    service:'GEMINI_DEVELOPER_API_FREE_TIER_NO_BILLING',model:FREE_MODEL,thinkingLevel:'MINIMAL',
    parentPaidPlanHash:paid.plan.planHash,paidRunnerBaselineHead:'e9ea4547d795ee833a8175c02c0cc23b21a7d823',
    commonDependencyHead:'249f4bd2088cea687333f02fb2e18add2c15efcd',
    corpusSha256:loaded.corpusSha256,goldSha256:loaded.goldSha256,
    promptSha256:paid.plan.promptSha256,schemaHash:paid.plan.schemaHash,
    requestsSha256:sha(JSON.stringify(requests,null,2)+'\n'),caseCount:8,
    limits:FREE_LIMITS,removedGenerationParameters:['temperature','candidateCount'],
    inputTokenMeasurement:'N/A_NO_COUNT_CALLS',combinedOutputThinkingBillingCap:'UNVERIFIED_NOT_A_CASH_GUARD',
    cost:{usd:'0',condition:'SAME_KEY_PROJECT_FREE_TIER_AND_BILLING_ACCOUNT_UNLINKED',
      independentlyAuthenticatedByRunner:false,capacityOrCompletionGuaranteed:false},
    keySourceId:FREE_KEY_SOURCE,privateDirectory:'private/e6-python-free-tier-v1',
    journalDirectory:'artifacts/e6-python-free-tier-run.v1',automaticRetries:0,continuations:0,paidFallbacks:0,modelFallbacks:0,
    productImprovementDataUse:'FREE_TIER_YES_PUBLIC_SYNTHETIC_TEXT_ONLY',
    actualGenerationCalls:0,actualCountCalls:0,keyReads:0,modelQuality:'N/A_NOT_RUN',
    usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false};
  const bundle={plan:{...plan,planHash:p0Hash('E6-FREE-PLAN',plan)},requests,corpus:loaded.corpus,gold:loaded.gold};
  validateFreeRequestBytes(bundle);return bundle;
}
export function loadE6FreeBundle(){
  const bundle=prepareE6FreePlan();
  const committed=JSON.parse(readFileSync(new URL('./e6-free-approval-plan.json',import.meta.url),'utf8'));
  if(jsonSha(bundle.plan)!==jsonSha(committed))throw Error('E6_FREE_PLAN_PIN');
  return bundle;
}
