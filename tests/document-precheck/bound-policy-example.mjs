// Pure synthetic preview/acknowledgment example. No key, HTTP or real consent.
import { fixture } from './fixture.mjs';
import { exampleBinding } from '../../specs/m1/examples.mjs';
import { prepareReviewPolicy,compileBoundReviewPolicy,createReviewPreview,acknowledgeReviewPreview,precheckBoundCode,reviewPrecheckEnvelope } from '../../src/document-precheck/bound-policy.mjs';
const value=fixture('third'),draft=structuredClone(value.compiled.policy);
const blocks=draft.sources.flatMap(source=>source.locators.map(locator=>({sourceId:source.sourceId,locator,text:'SYNTHETIC: at least four Unicode codepoints, spaces included, normalization NONE. No real consent or official source verification.'})));
const candidate=prepareReviewPolicy({draft,plans:[value.plan],sourceBlocks:blocks});
// Explicit fixture authority, not authorization inferred from an AI candidate.
const authority={approvedManifestHash:candidate.manifestHash,sourcePins:structuredClone(candidate.policy.sources),capabilityPins:structuredClone(draft.capabilities),sourceBlockPin:candidate.sourceBlocksDigest};
const bound=compileBoundReviewPolicy(candidate,authority);value.context.binding=exampleBinding(bound.compiled);
const preview=createReviewPreview(bound,value.context.binding),ack=acknowledgeReviewPreview(preview,{expectedPreviewHash:preview.previewHash,displayedSnapshot:structuredClone(preview.snapshot)});
const envelope=precheckBoundCode(bound,ack,value.context,value.submission);
const review=reviewPrecheckEnvelope(bound,ack,envelope,{currentPolicy:bound,latestContext:value.context,submission:value.submission});
console.log(JSON.stringify({kind:'SYNTHETIC_REVIEW_POLICY_BINDING_EXAMPLE',actualModelCalls:0,basePolicyHash:value.compiled.policyHash,boundPolicyHash:bound.compiled.policyHash,
 ruleHash:envelope.ruleHash,planHash:envelope.planHash,displayHash:envelope.displayHash,manifestHash:envelope.manifestHash,preview,envelope,review,userConsentVerified:false,paymentAllowed:false},null,2));
