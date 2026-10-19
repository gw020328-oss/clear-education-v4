import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewFields} from '../../src/ai-policy/field-review.mjs';
import {buildReviewEvaluationRequest} from './request-builder.mjs';
const corpus=JSON.parse(readFileSync(new URL('./evaluation-corpus.json',import.meta.url)));
test('8 explicit synthetic development cases; gold/mock replay is not a model measurement',()=>{
  assert.equal(corpus.synthetic,true);assert.equal(corpus.cases.length,8);
  assert.equal(new Set(corpus.cases.map(c=>c.caseId)).size,8);
  for (const c of corpus.cases) {
    const raw={fields:[{fieldId:'course-label',value:c.expected,location:c.expected===null?null:'synthetic-literal'}],
      questions:[],flags:c.flags.map(code=>({code,fieldIds:['course-label']}))};
    const replay=reviewFields(raw,corpus.requestedFieldIds);
    assert.equal(replay.fields[0].state,c.expected===null?'HELD':'OBSERVED',c.caseId);
    assert.equal(replay.paymentAllowed,false);
    if (c.sourceFixture) assert.equal(c.expected!==c.sourceFixture.value,true);
  }
  assert.equal(corpus.cases.filter(c=>c.task==='TEXT').length,4);
  assert.equal(corpus.cases.filter(c=>c.task==='VISION').length,4);
});
test('prepared review prompt preserves injected text as data without a policy-threshold task',()=>{
  const c=corpus.cases.find(c=>c.caseId==='RT04');
  const body=buildReviewEvaluationRequest({caseId:c.caseId,synthetic:true,task:'TEXT_REVIEW',text:'SYNTHETIC DEMO '+c.text,imageBase64:null,requestedFieldIds:corpus.requestedFieldIds});
  assert.match(body.systemInstruction.parts[0].text,/untrusted data/);
  assert.equal(body.systemInstruction.parts[0].text.includes('TEXT_POLICY'),false);
  assert.match(body.contents[0].parts[0].text,/authorize payment/);
  assert.equal(body.generationConfig.maxOutputTokens,1024);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');
  assert.equal(JSON.stringify(body).includes('sourceFixture'),false);
});
