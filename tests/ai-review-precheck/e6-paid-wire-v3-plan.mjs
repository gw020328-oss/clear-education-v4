// Fresh eight-call proposal; never resumes or reinterprets the v1 run.
import {readFileSync} from 'node:fs';
import {loadE6PaidUsageV2Bundle,PAID_EIGHT_LIMITS,PAID_EIGHT_MODEL,EXISTING_PAID_KEY_SOURCE,PAID_COST_ACK,jsonSha} from './e6-paid-usage-v2-plan.mjs';
import {sha} from './e6-quality-plan.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {WIRE_V3_POLICY,WIRE_V3_POLICY_HASH} from './e6-wire-v3.mjs';
export {PAID_EIGHT_LIMITS,PAID_EIGHT_MODEL,EXISTING_PAID_KEY_SOURCE,PAID_COST_ACK,jsonSha};
export function prepareE6PaidWireV3Plan(){
  const old=loadE6PaidUsageV2Bundle();const {planHash:parentV2PlanHash,...prior}=old.plan;
  const requests=old.requests.map(r=>({...r,version:'clear-e6-paid-wire-v3-request.3'}));
  const plan={...prior,version:'clear-e6-paid-wire-v3-plan.3',scope:'E6_PAID_WIRE_V3_FRESH_EIGHT',status:'PREPARED_NOT_APPROVED_ROOT_REVIEW_PENDING',
    parentV2PlanHash,preparationBaselineHead:'6d084a9f93dbd1f4a015c2a6badb62ba70ee83ee',
    previousActualFetches:2,previousRunStatus:'UNKNOWN_STOPPED',resumePreviousRun:false,additionalGenerationCalls:8,
    usagePolicy:WIRE_V3_POLICY,usagePolicyHash:WIRE_V3_POLICY_HASH,
    usageImplementationSha256:sha(readFileSync(new URL('./e6-wire-v3.mjs',import.meta.url))),
    requestsSha256:sha(JSON.stringify(requests,null,2)+'\n'),providerBodiesSameAsPrevious:true,
    privateApprovalPath:'private/e6-python-paid-wire-v3/approval.json',journalDirectory:'artifacts/e6-python-paid-wire-v3-run'};
  return {plan:{...plan,planHash:p0Hash('E6-PAID-WIRE-V3-PLAN',plan)},requests,corpus:old.corpus,gold:old.gold};
}
export function loadE6PaidWireV3Bundle(){
  const b=prepareE6PaidWireV3Plan(),saved=JSON.parse(readFileSync(new URL('./e6-paid-wire-v3-approval-plan.json',import.meta.url),'utf8'));
  if(jsonSha(saved)!==jsonSha(b.plan))throw Error('E6_WV3_PLAN_PIN');return b;
}
