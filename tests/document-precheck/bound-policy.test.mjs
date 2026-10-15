import test from 'node:test';
import assert from 'node:assert/strict';
import { compileMvpPolicy } from '../../src/policy/mvp/compiler.mjs';
import { fixture, rebind, image } from './fixture.mjs';
import { exampleBinding } from '../../specs/m1/examples.mjs';
import { digest, validateContract } from '../../src/policy/mvp/contract.mjs';
import { prepareReviewPolicy, compileBoundReviewPolicy, createReviewPreview, acknowledgeReviewPreview, precheckBoundCode, precheckBoundObservation, reviewPrecheckEnvelope } from '../../src/document-precheck/bound-policy.mjs';
function candidate(mutate=()=>{},name='third'){
 const v=fixture(name),draft=structuredClone(v.compiled.policy),plan=structuredClone(v.plan),ref=draft.sources[0];
 // Explicit synthetic fixture authority; never normalize an official input in the module.
 draft.sources.forEach(source=>{source.origin='SYNTHETIC_ASSUMPTION';source.applicability='SYNTHETIC_ONLY';});
 v.compiled=compileMvpPolicy(draft,{sources:structuredClone(draft.sources),capabilities:structuredClone(draft.capabilities)});
 const observationPlans=[{ruleId:plan.ruleId,method:'VISION',fieldIds:['image-type'],promptVersion:'clear-document-observe.1'}];
 const blocks=draft.sources.flatMap(source=>source.locators.map(locator=>({sourceId:source.sourceId,locator,text:'SYNTHETIC review criterion: count four Unicode codepoints.'})));

 mutate({draft,plan,blocks,observationPlans});return {v,prepared:prepareReviewPolicy({draft,plans:[plan],sourceBlocks:blocks,observationPlans})};
}
// This fixture is the synthetic authority. Production must obtain these pins
// from its reviewed state; preparation does not automatically approve a plan.
const authority=p=>({approvedManifestHash:p.manifestHash,sourcePins:structuredClone(p.policy.sources),capabilityPins:structuredClone(p.policy.capabilities),sourceBlockPin:p.sourceBlocksDigest});
function setup(mutate=()=>{},name='third'){
 const {v,prepared}=candidate(mutate,name),bound=compileBoundReviewPolicy(prepared,authority(prepared));
 v.context.binding=exampleBinding(bound.compiled);v.context.ruleVersion=prepared.planBindings[0].planVersion;const preview=createReviewPreview(bound,v.context.binding);
 const ack=acknowledgeReviewPreview(preview,{expectedPreviewHash:preview.previewHash,displayedSnapshot:structuredClone(preview.snapshot)});
 return {v,prepared,bound,preview,ack};
}
for(const name of ['ybm','siwon','third'])test(`${name} binds plan to real policy/rule hash and exact displayed preview`,()=>{
 const {v,prepared,bound,ack}=setup(()=>{},name);assert.notEqual(bound.compiled.policyHash,v.compiled.policyHash);assert.notEqual(bound.compiled.ruleHashes[v.context.ruleId],v.compiled.ruleHashes[v.context.ruleId]);
 assert.equal(prepared.planBindings[0].internalSource.origin,'SYNTHETIC_ASSUMPTION');assert.equal(prepared.planBindings[0].internalSource.applicability,'SYNTHETIC_ONLY');
 const envelope=precheckBoundCode(bound,ack,v.context,v.submission);const accepted=reviewPrecheckEnvelope(bound,ack,envelope,{currentPolicy:bound,latestContext:v.context,submission:v.submission});
 assert.equal(accepted.current,true);assert.equal(accepted.outcome,'PRECHECK_REQUIREMENTS_MET');assert.equal(accepted.userConsentVerified,false);assert.equal(accepted.automaticEligibility,false);assert.equal(accepted.paymentAllowed,false);validateContract('DocumentPrecheck',accepted.records[0]);
});
test('plan/display/source text/source pin/rule/cohort changes alter common compiler hashes',()=>{
 const baseline=setup(),ruleId=baseline.v.context.ruleId;
 for(const mutate of [
  ({plan})=>{plan.checks[0].options.minimum=5;},({plan})=>{plan.version='synthetic-review.2';},
  ({blocks})=>{blocks[0].text+=' Different source text.';},({draft})=>{draft.sources[0].rawHash=digest('CHANGED-SYNTHETIC','source');},
  ({draft})=>{draft.rules.find(r=>r.ruleId===ruleId).sourceRefs[0].locator=draft.sources[0].locators[0];draft.policyVersion='policy.2';},
  ({draft})=>{draft.cohortId='another-cohort';draft.sources.forEach(s=>{s.cohortId='another-cohort';});},
  ({plan})=>{plan.checks[0].options.space='EXCLUDE';},
  ({observationPlans})=>{observationPlans[0].fieldIds=['another-field'];},
  ({draft,blocks})=>{const rule=draft.rules.find(r=>r.ruleId===ruleId),ref=rule.sourceRefs[0];const locator='synthetic-rule-revision';draft.sources.find(s=>s.sourceId===ref.sourceId).locators.push(locator);rule.sourceRefs[0]={sourceId:ref.sourceId,locator};blocks.push({sourceId:ref.sourceId,locator,text:'SYNTHETIC revised rule basis.'});},
 ]){
  const {prepared}=candidate(mutate),changed=compileBoundReviewPolicy(prepared,authority(prepared));
  assert.notEqual(changed.compiled.policyHash,baseline.bound.compiled.policyHash);assert.notEqual(changed.compiled.ruleHashes[ruleId],baseline.bound.compiled.ruleHashes[ruleId]);
 }
});
test('no automatic approval or mixing newly proposed plans with old authority pins',()=>{
 const old=candidate().prepared,newer=candidate(({plan})=>{plan.checks[0].options.minimum=5;}).prepared;
 assert.throws(()=>compileBoundReviewPolicy(newer,authority(old)),/REVIEW_APPROVAL_PIN/);
 assert.throws(()=>compileBoundReviewPolicy(newer,{...authority(newer),sourcePins:authority(old).sourcePins}),/REVIEW_SOURCE_PIN/);
 assert.throws(()=>compileBoundReviewPolicy(old,{...authority(old),sourceBlockPin:digest('WRONG','source')}),/REVIEW_APPROVAL_PIN/);
 assert.throws(()=>compileBoundReviewPolicy(structuredClone(old),authority(old)),/PREPARED_REQUIRED/);
});
test('display tampering and an OPEN plan cannot be acknowledged as fixed criteria',()=>{
 const {preview}=setup(),displayed=structuredClone(preview.snapshot);displayed.criteria[0].display.plan.checks[0].options.minimum=999;
 assert.throws(()=>acknowledgeReviewPreview(preview,{expectedPreviewHash:preview.previewHash,displayedSnapshot:displayed}),/DISPLAY_MISMATCH/);
 const {prepared}=candidate(({plan})=>{plan.checks[0].options.minimum=null;});const bound=compileBoundReviewPolicy(prepared,authority(prepared)),open=createReviewPreview(bound,exampleBinding(bound.compiled));
 assert.equal(open.status,'POLICY_OPEN');assert.throws(()=>acknowledgeReviewPreview(open,{expectedPreviewHash:open.previewHash,displayedSnapshot:open.snapshot}),/PREVIEW_OPEN/);
});
test('old plan/policy/source results, old acknowledgment, changed input and late retry are held',()=>{
 const old=setup(),envelope=precheckBoundCode(old.bound,old.ack,old.v.context,old.v.submission),newer=setup(({plan})=>{plan.checks[0].options.minimum=5;});
 // Each mutation gets a fresh receipt so sticky stale from the first mutation
 // cannot hide a missing independent context/input check.
 const checkHeld=(currentPolicy,latestContext,submission,ack=old.ack)=>{const fresh=precheckBoundCode(old.bound,old.ack,old.v.context,old.v.submission),r=reviewPrecheckEnvelope(old.bound,ack,fresh,{currentPolicy,latestContext,submission});assert.equal(r.current,false);assert.equal(r.outcome,'UNDETERMINED');assert.ok(r.records.every(x=>!x.current&&x.reviewStatus==='NEEDS_REVIEW'&&x.observations.every(f=>f.value===null)));};
 checkHeld(newer.bound,newer.v.context,newer.v.submission);
 for(const key of ['submissionRevision','routeRevision','runId']){const latest=structuredClone(old.v.context);latest[key]=typeof latest[key]==='number'?latest[key]+1:'new-retry';checkHeld(old.bound,latest,old.v.submission);}
 const changed=structuredClone(old.v.submission);changed.posts[0].text+=' changed';checkHeld(old.bound,old.v.context,changed);
 checkHeld(old.bound,old.v.context,old.v.submission,newer.ack);
 assert.throws(()=>precheckBoundCode(newer.bound,old.ack,newer.v.context,newer.v.submission),/ACK_SCOPE/);
 assert.throws(()=>reviewPrecheckEnvelope(old.bound,old.ack,structuredClone(envelope),{currentPolicy:old.bound,latestContext:old.v.context,submission:old.v.submission}),/ENVELOPE_REQUIRED/);
});
test('late observation after policy/source revision cannot become a current CHECKED result',async()=>{
 const old=setup();old.v.submission.posts[0].images=[image()];rebind(old.v);let resolve;
 const pending=precheckBoundObservation(old.bound,old.ack,old.v.context,old.v.submission,{method:'VISION',fieldIds:['image-type'],adapter:{execution:'MOCK',observe:()=>new Promise(r=>{resolve=r;})}});
 await Promise.resolve();const newer=setup(({blocks})=>{blocks[0].text+=' revision 2';});
 resolve({reviewStatus:'CHECKED',observations:[{fieldId:'image-type',value:'RELATED',locator:'post/post-a/image/image-0',quote:null}]});
 const envelope=await pending,result=reviewPrecheckEnvelope(old.bound,old.ack,envelope,{currentPolicy:newer.bound,latestContext:newer.v.context,submission:newer.v.submission});
 assert.equal(result.current,false);assert.equal(result.records[0].reviewStatus,'NEEDS_REVIEW');assert.equal(result.records[0].observations[0].value,null);
});

test('observation method/fields must match the criteria shown before acknowledgment',async()=>{
 const {v,bound,ack}=setup();let calls=0;
 await assert.rejects(precheckBoundObservation(bound,ack,v.context,v.submission,{method:'VISION',fieldIds:['invented'],adapter:{execution:'MOCK',observe(){calls++;}}}),/OBSERVATION_SCOPE/);
 await assert.rejects(precheckBoundObservation(bound,ack,v.context,v.submission,{method:'TEXT_AI',fieldIds:['image-type'],adapter:{execution:'MOCK',observe(){calls++;}}}),/OBSERVATION_SCOPE/);assert.equal(calls,0);
});

test('an internal synthetic plan source cannot repair a base rule missing synthetic basis',()=>{
 const {prepared}=candidate(({draft,plan,blocks})=>{
  const source={...structuredClone(draft.sources[0]),sourceId:'official-only',origin:'OFFICIAL_SNAPSHOT',applicability:'OPEN'};draft.sources.push(source);
  const refs=source.locators.map(locator=>({sourceId:source.sourceId,locator}));draft.rules.find(rule=>rule.ruleId===plan.ruleId).sourceRefs=refs;plan.checks.forEach(check=>{check.sourceRefs=structuredClone(refs);});
  blocks.push(...source.locators.map(locator=>({sourceId:source.sourceId,locator,text:'SYNTHETIC test of an unverified official snapshot.'})));
 });
 assert.throws(()=>compileBoundReviewPolicy(prepared,authority(prepared)),/MVP_RULE_BASIS/);
});

test('OPEN source applicability stays visible but cannot be acknowledged as fixed criteria',()=>{
 const {prepared}=candidate(({draft,blocks})=>{
  const original=draft.sources[0],synthetic={...structuredClone(original),sourceId:'synthetic-backup'};draft.sources.push(synthetic);
  original.origin='OFFICIAL_SNAPSHOT';original.applicability='OPEN';
  const ref={sourceId:synthetic.sourceId,locator:synthetic.locators[0]};draft.rules.forEach(rule=>rule.sourceRefs.push(structuredClone(ref)));
  blocks.push(...synthetic.locators.map(locator=>({sourceId:synthetic.sourceId,locator,text:'SYNTHETIC backup basis, no official verification.'})));
 });
 const bound=compileBoundReviewPolicy(prepared,authority(prepared)),preview=createReviewPreview(bound,exampleBinding(bound.compiled));
 assert.equal(preview.status,'POLICY_OPEN');assert.throws(()=>acknowledgeReviewPreview(preview,{expectedPreviewHash:preview.previewHash,displayedSnapshot:preview.snapshot}),/PREVIEW_OPEN/);
});

test('original profiles with OPEN official applicability stay blocked without silently repinning',()=>{
 for(const name of ['ybm','siwon']){const value=fixture(name),draft=structuredClone(value.compiled.policy),blocks=draft.sources.flatMap(source=>source.locators.map(locator=>({sourceId:source.sourceId,locator,text:'SYNTHETIC preview of an unresolved official source.'})));
 const prepared=prepareReviewPolicy({draft,plans:[value.plan],sourceBlocks:blocks}),bound=compileBoundReviewPolicy(prepared,authority(prepared)),preview=createReviewPreview(bound,exampleBinding(bound.compiled));
 assert.equal(preview.status,'POLICY_OPEN');assert.equal(draft.sources.some(source=>source.applicability==='OPEN'),true);assert.throws(()=>acknowledgeReviewPreview(preview,{expectedPreviewHash:preview.previewHash,displayedSnapshot:preview.snapshot}),/PREVIEW_OPEN/);}
});

test('a stale receipt cannot be revived and cannot cross participant bindings',()=>{
 const old=setup(),envelope=precheckBoundCode(old.bound,old.ack,old.v.context,old.v.submission),newer=setup(({plan})=>{plan.version='synthetic-review.2';});
 assert.equal(reviewPrecheckEnvelope(old.bound,old.ack,envelope,{currentPolicy:newer.bound,latestContext:newer.v.context,submission:newer.v.submission}).current,false);
 assert.equal(reviewPrecheckEnvelope(old.bound,old.ack,envelope,{currentPolicy:old.bound,latestContext:old.v.context,submission:old.v.submission}).current,false);
 const context=structuredClone(old.v.context);context.binding.subjectRef=digest('SYNTHETIC','another participant');
 assert.throws(()=>precheckBoundCode(old.bound,old.ack,context,old.v.submission),/ACK_SCOPE/);
});
