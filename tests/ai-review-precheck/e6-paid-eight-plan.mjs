// Request-limited paid diagnostic, deliberately NOT a verified cash-cap plan.
import {readFileSync} from 'node:fs';
import {loadE6FreeBundle,FREE_LIMITS,jsonSha,validateFreeRequestBytes} from './e6-free-plan.mjs';
import {sha} from './e6-quality-plan.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
export {jsonSha};
export const PAID_EIGHT_MODEL='gemini-3.5-flash-lite';
export const EXISTING_PAID_KEY_SOURCE='clear-e6-existing-server-gemini-env.1';
export const PAID_EIGHT_LIMITS=Object.freeze({...FREE_LIMITS,
  observedInputStopTokens:3000,observedGeneratedStopTokens:1024,observedCostStopNanoUsd:'50000000'});
export const PAID_COST_ACK='ESTIMATE_ONLY_NO_PROVIDER_HARD_CASH_CAP_IN_FLIGHT_MAY_EXCEED_USD_0_05';
export function prepareE6PaidEightPlan(){
  const base=loadE6FreeBundle();
  // Identical provider body bytes; a distinct paid request-manifest namespace.
  const requests=base.requests.map(r=>({version:'clear-e6-paid-eight-request.1',...r}));
  const plan={version:'clear-e6-paid-eight-plan.1',status:'PREPARED_NOT_APPROVED_ACTUAL_BLOCKED',checkedOn:'2026-10-19',
    service:'GEMINI_DEVELOPER_API_PAID_STANDARD',scope:'E6_EXISTING_PAID_KEY_EIGHT_GENERATIONS',
    model:PAID_EIGHT_MODEL,thinkingLevel:'MINIMAL',parentFreePlanHash:base.plan.planHash,
    originalPaidPlanHash:base.plan.parentPaidPlanHash,preparationBaselineHead:'74db9d1b4cf92aefda2d1b0d3a7588b7fe149e0c',
    corpusSha256:base.plan.corpusSha256,goldSha256:base.plan.goldSha256,promptSha256:base.plan.promptSha256,schemaHash:base.plan.schemaHash,
    requestsSha256:sha(JSON.stringify(requests,null,2)+'\n'),providerBodiesSameAsFree:true,limits:PAID_EIGHT_LIMITS,
    keySourceId:EXISTING_PAID_KEY_SOURCE,keySource:'EXPLICIT_EXISTING_SERVER_PROCESS_ENV_GEMINI_API_KEY',
    cost:{mode:'REQUEST_LIMITED_ESTIMATE_NOT_HARD_CASH_CAP',priceCheckedOn:'2026-10-19',requireSameDayPublicPriceReview:true,inputNanoUsdPerToken:'300',
      outputIncludingThinkingNanoUsdPerToken:'2500',scenarioInputTokensPerCase:3000,scenarioCombinedOutputTokensPerCase:1024,
      scenarioNanoUsd:'27680000',scenarioUsd:'0.02768',inputTokenCountMeasured:false,combinedThinkingCapVerified:false,
      providerHardCashCapVerified:false,invoiceVerified:false,requiredAcknowledgment:PAID_COST_ACK},
    automaticRetries:0,continuations:0,keySourceFallbacks:0,modelFallbacks:0,freeFallbacks:0,
    privateApprovalPath:'private/e6-python-paid-eight-v1/approval.json',journalDirectory:'artifacts/e6-python-paid-eight-run.v1',
    officialModelSource:'https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite',
    officialPricingSource:'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite',
    actualGenerationCalls:0,actualCountCalls:0,keyReads:0,modelQuality:'N/A_NOT_RUN',
    usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false};
  const bundle={plan:{...plan,planHash:p0Hash('E6-PAID-EIGHT-PLAN',plan)},requests,corpus:base.corpus,gold:base.gold};
  validateFreeRequestBytes(bundle);return bundle;
}
export function loadE6PaidEightBundle(){
  const b=prepareE6PaidEightPlan(),saved=JSON.parse(readFileSync(new URL('./e6-paid-eight-approval-plan.json',import.meta.url),'utf8'));
  if(jsonSha(saved)!==jsonSha(b.plan))throw Error('E6_PAID8_PLAN_PIN');return b;
}
