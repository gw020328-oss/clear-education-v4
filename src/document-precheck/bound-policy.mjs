import { exactKeys, array, freeze, requireRule as check } from '../policy/values.mjs';
import { validateContract, digest, same } from '../policy/mvp/contract.mjs';
import { compileMvpPolicy, requireMvpPolicy } from '../policy/mvp/compiler.mjs';
import { validateReviewPlan, reviewPlanDigest, submissionDigest, precheckCode, precheckObservation, markPrecheckCurrent, DOCUMENT_OBSERVATION_PROMPT_VERSION } from './precheck.mjs';

export const REVIEW_BINDING_VERSION = 'clear-review-binding.1';
const preparedHandles = new WeakSet(), boundHandles = new WeakSet(), previewHandles = new WeakSet(), acknowledgments = new WeakSet(), envelopes = new WeakMap();
const unique = values => check(new Set(values).size === values.length, 'REVIEW_DUPLICATE');
const scopeOf = policy => Object.fromEntries(['institutionId','productId','cohortId','policyVersion'].map(key=>[key,policy[key]]));
export const sourceBlocksDigest = blocks => digest('CLEAR-REVIEW-SOURCE-BLOCKS.1', blocks);
const sourceNamespace = 'review-plan.1.';
const ready = plan => plan.checks.every(item => item.basis !== 'OPEN' && !Object.values(item.options).includes(null) && item.options.duplicatePolicy !== 'OPEN');

// Creates a frozen candidate only. Never chooses the authority's pins/approval.
export function prepareReviewPolicy({ draft, plans, sourceBlocks, observationPlans = [] }) {
  validateContract('PolicyDraft', draft);
  const policy = structuredClone(draft), originalSources = structuredClone(draft.sources), blocks = structuredClone(sourceBlocks), items = structuredClone(plans);
  check(!originalSources.some(source=>source.sourceId.startsWith(sourceNamespace)), 'REVIEW_ALREADY_BOUND');
  array(items,32,'REVIEW_PLANS'); check(items.length>0,'REVIEW_PLANS'); unique(items.map(plan=>plan.ruleId));
  array(blocks,64,'REVIEW_SOURCE_BLOCKS'); check(blocks.length>0,'REVIEW_SOURCE_BLOCKS');
  for(const block of blocks){
    exactKeys(block,['sourceId','locator','text'],'REVIEW_SOURCE_BLOCKS');
    check(originalSources.some(source=>source.sourceId===block.sourceId&&source.locators.includes(block.locator))
      && typeof block.text==='string' && block.text.length>0 && block.text.length<=16000,'REVIEW_SOURCE_BLOCKS');
  }
  unique(blocks.map(block=>block.sourceId+':'+block.locator));
  const observations=structuredClone(observationPlans);array(observations,64,'REVIEW_OBSERVATION_PLAN');
  unique(observations.map(item=>item.ruleId+':'+item.method));
  for(const profile of observations){
    exactKeys(profile,['ruleId','method','fieldIds','promptVersion'],'REVIEW_OBSERVATION_PLAN');
    check(items.some(plan=>plan.ruleId===profile.ruleId)&&['TEXT_AI','VISION'].includes(profile.method)&&profile.promptVersion===DOCUMENT_OBSERVATION_PROMPT_VERSION,'REVIEW_OBSERVATION_PLAN');
    array(profile.fieldIds,32,'REVIEW_OBSERVATION_PLAN');check(profile.fieldIds.length>0,'REVIEW_OBSERVATION_PLAN');unique(profile.fieldIds);
    check(profile.fieldIds.every(id=>typeof id==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(id)),'REVIEW_OBSERVATION_PLAN');
  }
  const blockPin=sourceBlocksDigest(blocks), scope=scopeOf(policy), planBindings=[];
  for(const plan of items){
    const rule=policy.rules.find(rule=>rule.ruleId===plan.ruleId&&rule.requirementId===plan.requirementId);
    const requirement=policy.requirements.find(item=>item.requirementId===plan.requirementId);
    check(rule&&requirement&&['REVIEW','BLOG'].includes(requirement.kind),'REVIEW_RULE_SCOPE');
    validateReviewPlan(plan,reviewPlanDigest(plan),{ruleVersion:plan.version,ruleId:rule.ruleId,requirementId:rule.requirementId},policy);
    const refs=[...rule.sourceRefs,...plan.checks.flatMap(item=>item.sourceRefs)];
    check(refs.every(ref=>blocks.some(block=>block.sourceId===ref.sourceId&&block.locator===ref.locator)),'REVIEW_SOURCE_BLOCKS');
    const relevantBlocks=blocks.filter(block=>refs.some(ref=>block.sourceId===ref.sourceId&&block.locator===ref.locator));
    // No policyHash here: all commitments are built before the common compiler.
    const display=freeze({version:'clear-review-display.1',scope,rule:structuredClone(rule),requirement:structuredClone(requirement),
      plan:structuredClone(plan),kernelVersion:'clear-document-precheck.2',observationPlans:observations.filter(item=>item.ruleId===rule.ruleId),sourceBlocks:relevantBlocks,notice:'SYNTHETIC_PRECHECK_ONLY_UNVERIFIED_SOURCE'});
    const planHash=reviewPlanDigest(plan),displayHash=digest('CLEAR-REVIEW-DISPLAY.1',display);
    const manifest={version:REVIEW_BINDING_VERSION,scope,rule:structuredClone(rule),requirement:structuredClone(requirement),planHash,displayHash,
      sourceSetHash:digest('CLEAR-REVIEW-ORIGINAL-SOURCES.1',originalSources),capabilityHash:digest('CLEAR-REVIEW-CAPABILITIES.1',policy.capabilities),sourceBlocksDigest:blockPin};
    const manifestHash=digest('CLEAR-REVIEW-PLAN-MANIFEST.1',manifest);
    const internalSource={sourceId:sourceNamespace+manifestHash.slice(2,42),institutionId:policy.institutionId,productId:policy.productId,cohortId:policy.cohortId,
      capturedAt:Math.max(...originalSources.map(source=>source.capturedAt)),origin:'SYNTHETIC_ASSUMPTION',
      rawHash:digest('CLEAR-REVIEW-INTERNAL-SOURCE.1',manifest),normalizedHash:displayHash,normalizerVersion:'clear-review-display.1',applicability:'SYNTHETIC_ONLY',
      locators:['clear-review-plan.1/'+manifestHash.slice(2)]};
    validateContract('Source',internalSource);
    // Full manifest hash in the rule locator binds source bytes and the plan to
    // ruleHash too; the common compiler otherwise hashes references, not sources.
    rule.sourceRefs.push({sourceId:internalSource.sourceId,locator:internalSource.locators[0]}); policy.sources.push(internalSource);
    planBindings.push({requirementId:rule.requirementId,ruleId:rule.ruleId,planVersion:plan.version,planHash,displayHash,manifestHash,plan,display,observationPlans:display.observationPlans,internalSource});
  }
  validateContract('PolicyDraft',policy);
  const result=freeze({version:REVIEW_BINDING_VERSION,originalPolicy:structuredClone(draft),policy,sourceBlocks:blocks,sourceBlocksDigest:blockPin,planBindings,
    manifestHash:digest('CLEAR-REVIEW-POLICY-MANIFEST.1',planBindings.map(item=>item.manifestHash)),publishable:false,paymentAllowed:false});
  preparedHandles.add(result);return result;
}

// Caller must review the candidate, then supply independent approval/pins. This
// is not operator authentication; no default approval and no automatic repinning.
export function compileBoundReviewPolicy(prepared,authority){
  check(preparedHandles.has(prepared),'REVIEW_PREPARED_REQUIRED');
  exactKeys(authority,['approvedManifestHash','sourcePins','capabilityPins','sourceBlockPin'],'REVIEW_AUTHORITY');
  check(authority.approvedManifestHash===prepared.manifestHash&&authority.sourceBlockPin===prepared.sourceBlocksDigest,'REVIEW_APPROVAL_PIN');
  check(same(authority.sourcePins,prepared.policy.sources),'REVIEW_SOURCE_PIN');
  // The internal SYNTHETIC source must never legitimize an otherwise invalid
  // base (e.g. an official-only rule missing the common synthetic basis).
  compileMvpPolicy(prepared.originalPolicy,{sources:authority.sourcePins.filter(source=>!source.sourceId.startsWith(sourceNamespace)),capabilities:authority.capabilityPins});
  const compiled=compileMvpPolicy(prepared.policy,{sources:authority.sourcePins,capabilities:authority.capabilityPins});
  const result=freeze({version:REVIEW_BINDING_VERSION,compiled,manifestHash:prepared.manifestHash,sourceBlocksDigest:prepared.sourceBlocksDigest,
    planBindings:prepared.planBindings,publishable:false,automaticEligibility:false,paymentAllowed:false});
  boundHandles.add(result);return result;
}
const policyReady = bound => bound.compiled.policy.sources.every(source=>source.applicability==='SYNTHETIC_ONLY')&&bound.planBindings.every(item=>ready(item.plan));
function requireBound(bound){check(boundHandles.has(bound),'REVIEW_BOUND_REQUIRED');return requireMvpPolicy(bound.compiled);}
function bindingScope(bound,binding){
  const policy=requireBound(bound);validateContract('Binding',binding);
  check(binding.policyHash===bound.compiled.policyHash&&binding.policyVersion===policy.policyVersion&&binding.productId===policy.productId&&binding.cohortId===policy.cohortId,'REVIEW_BINDING_SCOPE');
}
export function createReviewPreview(bound,binding){
  bindingScope(bound,binding);
  const snapshot=freeze({version:'clear-review-preview.1',binding:structuredClone(binding),manifestHash:bound.manifestHash,
    sourceSetHash:bound.compiled.sourceSetHash,sourceBlocksDigest:bound.sourceBlocksDigest,
    criteria:bound.planBindings.map(item=>({ruleId:item.ruleId,ruleHash:bound.compiled.ruleHashes[item.ruleId],planHash:item.planHash,displayHash:item.displayHash,display:item.display}))});
  const result=freeze({version:'clear-review-preview.1',status:policyReady(bound)?'READY_SYNTHETIC':'POLICY_OPEN',snapshot,
    previewHash:digest('CLEAR-REVIEW-PREVIEW.1',snapshot),userConsentVerified:false,paymentAllowed:false});
  previewHandles.add(result);return result;
}
// Exact displayed DTO acknowledgment only; no signature, HTTP, DB or real consent.
export function acknowledgeReviewPreview(preview,{expectedPreviewHash,displayedSnapshot}){
  check(previewHandles.has(preview)&&preview.status==='READY_SYNTHETIC','REVIEW_PREVIEW_OPEN');
  check(expectedPreviewHash===preview.previewHash&&same(displayedSnapshot,preview.snapshot)
    &&digest('CLEAR-REVIEW-PREVIEW.1',displayedSnapshot)===expectedPreviewHash,'REVIEW_DISPLAY_MISMATCH');
  const result=freeze({version:'clear-review-ack.1',status:'SYNTHETIC_ACK_ONLY',previewHash:preview.previewHash,
    binding:preview.snapshot.binding,manifestHash:preview.snapshot.manifestHash,userConsentVerified:false,paymentAllowed:false});
  acknowledgments.add(result);return result;
}
function runScope(bound,ack,context){
  bindingScope(bound,context.binding);
  check(acknowledgments.has(ack)&&same(ack.binding,context.binding)&&ack.manifestHash===bound.manifestHash,'REVIEW_ACK_SCOPE');
  const item=bound.planBindings.find(item=>item.ruleId===context.ruleId&&item.requirementId===context.requirementId&&item.planVersion===context.ruleVersion);
  check(item&&ready(item.plan)&&policyReady(bound),'REVIEW_PLAN_SCOPE');return item;
}
function methodHash(item,method){
  const profile=method==='CODE'?{method:'CODE',kernelVersion:'clear-document-precheck.2',planHash:item.planHash}:item.observationPlans.find(profile=>profile.method===method);
  check(profile,'REVIEW_OBSERVATION_SCOPE');return digest('CLEAR-REVIEW-METHOD.1',profile);
}
function wrap(bound,ack,context,submission,item,result){
  const method=(result.records??[result.record])[0].method;
  const value=freeze({version:'clear-review-envelope.1',context:structuredClone(context),policyHash:bound.compiled.policyHash,
    ruleHash:bound.compiled.ruleHashes[item.ruleId],manifestHash:bound.manifestHash,planVersion:item.planVersion,planHash:item.planHash,
    displayHash:item.displayHash,method,methodSpecHash:methodHash(item,method),sourceBlocksDigest:bound.sourceBlocksDigest,previewHash:ack.previewHash,inputHash:submissionDigest(submission),
    result,automaticEligibility:false,paymentAllowed:false});
  envelopes.set(value,{bound,stale:false});return value;
}
export function precheckBoundCode(bound,ack,context,submission){
  const item=runScope(bound,ack,context),result=precheckCode(bound.compiled,context,submission,{plan:item.plan,pinnedPlanHash:item.planHash});
  return wrap(bound,ack,context,submission,item,result);
}
export async function precheckBoundObservation(bound,ack,context,submission,options){
  const item=runScope(bound,ack,context),capturedContext=structuredClone(context),capturedSubmission=structuredClone(submission);
  const profile=item.observationPlans.find(profile=>profile.method===options.method);
  check(profile&&same(profile.fieldIds,options.fieldIds)&&profile.promptVersion===DOCUMENT_OBSERVATION_PROMPT_VERSION,'REVIEW_OBSERVATION_SCOPE');
  const result=await precheckObservation(bound.compiled,capturedContext,capturedSubmission,options);
  return wrap(bound,ack,capturedContext,capturedSubmission,item,result);
}
// The currentPolicy/latestContext resolver is trusted caller input, not an HTTP
// payload. A stale envelope cannot be reused by copying it or an older record.
export function reviewPrecheckEnvelope(bound,ack,envelope,{currentPolicy,latestContext,submission}){
  requireBound(bound);requireBound(currentPolicy);
  const receipt=envelopes.get(envelope);check(receipt?.bound===bound,'REVIEW_ENVELOPE_REQUIRED');
  check(acknowledgments.has(ack),'REVIEW_ACK_SCOPE');
  const item=bound.planBindings.find(item=>item.ruleId===envelope.context.ruleId);
  const current=!receipt.stale&&bound.compiled.policyHash===currentPolicy.compiled.policyHash&&bound.manifestHash===currentPolicy.manifestHash&&same(ack.binding,envelope.context.binding)&&ack.manifestHash===envelope.manifestHash&&ack.previewHash===envelope.previewHash
    &&envelope.policyHash===bound.compiled.policyHash&&envelope.ruleHash===bound.compiled.ruleHashes[item.ruleId]
    &&envelope.methodSpecHash===methodHash(item,envelope.method)&&envelope.planHash===item.planHash&&envelope.planVersion===item.planVersion&&envelope.displayHash===item.displayHash
    &&envelope.manifestHash===bound.manifestHash&&envelope.sourceBlocksDigest===bound.sourceBlocksDigest&&ready(item.plan)&&policyReady(bound)
    &&same(envelope.context,latestContext)&&envelope.inputHash===submissionDigest(submission);
  if(!current)receipt.stale=true;
  const records=envelope.result.records??[envelope.result.record];
  return freeze({version:'clear-review-acceptance.1',current,status:current?'CURRENT_PRECHECK_ONLY':'NEEDS_REVIEW',
    outcome:current?envelope.result.outcome:'UNDETERMINED',records:records.map(record=>markPrecheckCurrent(current?record:{...record,current:false},latestContext)),
    userConsentVerified:false,automaticEligibility:false,paymentAllowed:false});
}
