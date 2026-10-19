import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bytesDigest} from '../../src/product-workflow/contract.mjs';
import {groundLegacyReview,validateGroundedReview} from '../../src/document-precheck/review/grounding.mjs';
import {buildReviewRequestV2} from './request-builder-v2.mjs';
import {assessGroundedReview} from './assess-grounding.mjs';
const actual=JSON.parse(readFileSync(new URL('./actual-evaluation-20261016.json',import.meta.url)));
const corpus=JSON.parse(readFileSync(new URL('./evaluation-corpus.json',import.meta.url)));
const ids=['course-label'],text=[{sourceId:'review-text',kind:'TEXT',text:'SYNTHETIC Review. Course: ALPHA.'}];
const field=(state='OBSERVED',value='ALPHA',evidence={kind:'TEXT_QUOTE',sourceId:'review-text',quote:'ALPHA'})=>({
  fieldId:'course-label',state,value,evidence,inspectedSourceIds:['review-text']});
test('actual text observations gain only uniquely matched original spans; missing state is not invented',()=>{
  for(const a of actual.attempts.filter(a=>a.caseId.startsWith('RT'))){
    const c=corpus.cases.find(c=>c.caseId===a.caseId),s=[{sourceId:'review-text',kind:'TEXT',text:c.text}];
    const f=groundLegacyReview(a.rawObservation,ids,s).fields[0];
    assert.equal(f.candidateValue,c.expected);
    if(c.expected!==null){assert.equal(f.state,'OBSERVED_ONLY');assert.equal(s[0].text.slice(f.evidence.start,f.evidence.end),c.expected);}
    else{assert.equal(f.state,'UNDETERMINED');assert.equal(f.reason,'REASON_NOT_PROVIDED');assert.equal(f.evidence,null);assert.ok(f.supplement.length>0);}
  }
});
test('ambiguous repeated or absent text cannot acquire a fabricated span',()=>{
  const raw=structuredClone(actual.attempts[0].rawObservation);
  for(const body of ['ALPHA and ALPHA','no course label here']){
    const f=groundLegacyReview(raw,ids,[{sourceId:'review-text',kind:'TEXT',text:body}]).fields[0];
    assert.equal(f.evidence,null);assert.equal(f.locationStatus,'LOCATION_UNVERIFIED');assert.equal(f.candidateValue,'ALPHA');
  }
});
test('legacy scoped hold remains held and is not erased by a matching quote',()=>{
  const raw=structuredClone(actual.attempts[0].rawObservation);raw.flags=[{code:'CONFLICT',fieldIds:ids}];
  const f=groundLegacyReview(raw,ids,text).fields[0];
  assert.equal(f.state,'NEEDS_REVIEW');assert.equal(f.reason,'OBSERVATION_HELD');
});
test('v2 normal text has a deterministic exact span and no unnecessary supplement',()=>{
  const r=validateGroundedReview({fields:[field()]},ids,text),f=r.fields[0];
  assert.equal(text[0].text.slice(f.evidence.start,f.evidence.end),'ALPHA');assert.equal(f.reason,null);assert.equal(f.supplement,null);
  assert.equal(r.paymentAllowed,false);assert.equal(r.sourceAuthenticity,'UNVERIFIED');
});
test('v2 missing, unreadable and unknown produce distinct fixed requests with no invented evidence',()=>{
  for(const state of ['MISSING','UNREADABLE','UNDETERMINED','CONFLICT']){
    const f=validateGroundedReview({fields:[field(state,null,null)]},ids,text).fields[0];
    assert.equal(f.state,state);assert.equal(f.reason,state);assert.equal(f.evidence,null);assert.ok(f.supplement.length>0);
    assert.equal(f.locationStatus,'NO_LEGIBLE_EVIDENCE');
  }
  const unreadable=validateGroundedReview({fields:[field('UNREADABLE',null,null)]},ids,text).fields[0];
  assert.match(unreadable.supplement,/선명한/);
  assert.throws(()=>validateGroundedReview({fields:[field('UNREADABLE',null,{kind:'TEXT_QUOTE',sourceId:'review-text',quote:'invented'})]},ids,text),/NO_LEGIBLE_EVIDENCE/);
});
test('foreign source, fabricated quote, offsets/rows and ambiguous literal are rejected',()=>{
  const f=field();f.evidence.sourceId='other-source';assert.throws(()=>validateGroundedReview({fields:[f]},ids,text),/SOURCE_PIN/);
  const invented=field();invented.evidence.quote='BETA';assert.throws(()=>validateGroundedReview({fields:[invented]},ids,text),/TEXT_SPAN/);
  const row=field();row.evidence.row=2;assert.throws(()=>validateGroundedReview({fields:[row]},ids,text),/EVIDENCE/);
  assert.throws(()=>validateGroundedReview({fields:[field()]},ids,[{...text[0],text:'ALPHA ALPHA'}]),/AMBIGUOUS_OR_ABSENT/);
});
test('image is bound to exact original bytes only; no invented row/region or OCR byte guarantee',()=>{
  const bytes=Buffer.from('SYNTHETIC_IMAGE_BYTES'),sources=[{sourceId:'review-image',kind:'IMAGE',bytes,sha256:bytesDigest(bytes)}];
  const f={...field(),inspectedSourceIds:['review-image'],evidence:{kind:'IMAGE_ASSET',sourceId:'review-image',quote:null}};
  const result=validateGroundedReview({fields:[f]},ids,sources).fields[0];
  assert.equal(result.candidateValue,'ALPHA');assert.equal(result.locationStatus,'ASSET_BOUND_CONTENT_UNVERIFIED');assert.equal(result.supplement,null);
  assert.equal(Object.hasOwn(result.evidence,'row'),false);assert.equal(Object.hasOwn(result.evidence,'start'),false);
  assert.throws(()=>validateGroundedReview({fields:[f]},ids,[{...sources[0],bytes:Buffer.from('OTHER')}]),/IMAGE_PIN/);
  const legacy=groundLegacyReview(actual.attempts.find(a=>a.caseId==='RV01').rawObservation,ids,sources).fields[0];
  assert.equal(legacy.candidateValue,'ALPHA');assert.equal(legacy.evidence,null);assert.equal(legacy.locationStatus,'LOCATION_UNVERIFIED');
});
test('v2 schema/prompt requires explicit states and has no free-form location or invented unreadable quote',()=>{
  const request=buildReviewRequestV2({caseId:'RT01',text:'SYNTHETIC Course ALPHA.'});
  const schema=request.generationConfig.responseSchema.properties.fields.items;
  assert.ok(schema.required.includes('state'));assert.ok(schema.required.includes('inspectedSourceIds'));
  assert.equal(Object.hasOwn(schema.properties,'location'),false);assert.match(request.systemInstruction.parts[0].text,/value and evidence MUST be null/);
  assert.match(request.systemInstruction.parts[0].text,/untrusted data/);
});
test('v2 synthetic normal controls and fixture conflict do not regress',()=>{
  for(const c of corpus.cases){
    const vision=c.task==='VISION',bytes=Buffer.from('SYNTHETIC_'+c.caseId);
    const sources=vision?[{sourceId:'review-image',kind:'IMAGE',bytes,sha256:bytesDigest(bytes)}]:[{sourceId:'review-text',kind:'TEXT',text:c.text}];
    const state=c.expected===null?c.flags[0]:'OBSERVED';
    const f={fieldId:'course-label',state,value:c.expected,inspectedSourceIds:[sources[0].sourceId],evidence:c.expected===null?null:
      vision?{kind:'IMAGE_ASSET',sourceId:'review-image',quote:null}:{kind:'TEXT_QUOTE',sourceId:'review-text',quote:c.expected}};
    const observed=validateGroundedReview({fields:[f]},ids,sources).fields[0];
    assert.equal(observed.candidateValue,c.expected);
    if(['RT01','RT02','RV01'].includes(c.caseId)){assert.equal(observed.state,'OBSERVED');assert.equal(observed.supplement,null);}
    if(c.sourceFixture)assert.equal(observed.candidateValue!==c.sourceFixture.value,true);
  }
});
test('v2 evaluator rejects literal-only passes with missing or wrong reason/evidence',()=>{
  assert.equal(assessGroundedReview({fields:[field()]},[],ids,text).status,'NEEDS_IMPROVEMENT');
  const gold=[{fieldId:'course-label',state:'UNREADABLE',value:null}];
  const unknown=assessGroundedReview({fields:[field('UNDETERMINED',null,null)]},gold,ids,text);
  assert.equal(unknown.status,'NEEDS_IMPROVEMENT');assert.ok(unknown.errors.includes('STATE:course-label'));
  const explicit=assessGroundedReview({fields:[field('UNREADABLE',null,null)]},gold,ids,text);
  assert.equal(explicit.status,'PASS');
  const malformed=field();malformed.evidence.quote='not-in-source';
  assert.equal(assessGroundedReview({fields:[malformed]},[{fieldId:'course-label',state:'OBSERVED',value:'ALPHA'}],ids,text).status,'NEEDS_IMPROVEMENT');
});
