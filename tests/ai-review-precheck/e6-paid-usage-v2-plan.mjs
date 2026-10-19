// Fresh eight-call proposal; never resumes or reinterprets the v1 run.
import {readFileSync} from 'node:fs';
import {loadE6PaidEightBundle,PAID_EIGHT_LIMITS,PAID_EIGHT_MODEL,EXISTING_PAID_KEY_SOURCE,PAID_COST_ACK,jsonSha} from './e6-paid-eight-plan.mjs';
import {sha} from './e6-quality-plan.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {USAGE_V2_POLICY,USAGE_V2_POLICY_HASH} from './e6-usage-compat-v2.mjs';
export {PAID_EIGHT_LIMITS,PAID_EIGHT_MODEL,EXISTING_PAID_KEY_SOURCE,PAID_COST_ACK,jsonSha};
export function prepareE6PaidUsageV2Plan(){
  const old=loadE6PaidEightBundle();const {planHash:parentPaidPlanHash,...prior}=old.plan;
  const requests=old.requests.map(r=>({...r,version:'clear-e6-paid-usage-v2-request.2'}));
  const plan={...prior,version:'clear-e6-paid-usage-v2-plan.2',scope:'E6_PAID_USAGE_V2_FRESH_EIGHT',
    parentPaidPlanHash,preparationBaselineHead:'92d48daf5b3989ccced070177eae652d1347e211',
    previousActualFetches:1,previousRunStatus:'UNKNOWN_STOPPED',resumePreviousRun:false,additionalGenerationCalls:8,
    usagePolicy:USAGE_V2_POLICY,usagePolicyHash:USAGE_V2_POLICY_HASH,
    usageImplementationSha256:sha(readFileSync(new URL('./e6-usage-compat-v2.mjs',import.meta.url))),
    requestsSha256:sha(JSON.stringify(requests,null,2)+'\n'),providerBodiesSameAsPrevious:true,
    privateApprovalPath:'private/e6-python-paid-usage-v2/approval.json',journalDirectory:'artifacts/e6-python-paid-usage-v2-run'};
  return {plan:{...plan,planHash:p0Hash('E6-PAID-USAGE-V2-PLAN',plan)},requests,corpus:old.corpus,gold:old.gold};
}
export function loadE6PaidUsageV2Bundle(){
  const b=prepareE6PaidUsageV2Plan(),saved=JSON.parse(readFileSync(new URL('./e6-paid-usage-v2-approval-plan.json',import.meta.url),'utf8'));
  if(jsonSha(saved)!==jsonSha(b.plan))throw Error('E6_UV2_PLAN_PIN');return b;
}
