import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewFields} from '../../src/ai-policy/field-review.mjs';
const report=JSON.parse(await readFile(new URL('../../docs/ai-vision/gemini-recovery-evaluation.json',import.meta.url),'utf8'));
test('saved recovery observations reproduce normal improvement without weakening conflict/missing holds',()=>{
 for(const attempt of report.attempts){
  const raw=attempt.rawObservation,review=reviewFields({fields:raw.fields,questions:raw.questions,flags:raw.flags},attempt.fieldReview.fields.map(f=>f.fieldId));
  assert.deepEqual(review,attempt.fieldReview);assert.equal(attempt.result.paymentAllowed,false);
 }
 const find=(phase,id)=>report.attempts.find(a=>a.phase===phase&&a.caseId===id);
 assert.equal(find('baseline','T01').reviewedAssessment.status,'SEMANTIC_ERROR');
 const normal=find('revised','T01');assert.deepEqual(normal.rawObservation.questions,[]);assert.deepEqual(normal.rawObservation.flags,[]);assert.deepEqual(normal.result.fields.map(f=>f.value),['700','80','14']);
 const conflict=find('revised','T04');assert.ok(conflict.rawObservation.flags.some(f=>f.fieldIds===null));assert.ok(conflict.result.fields.every(f=>f.value===null));
 const vision=find('revised','V02');assert.equal(vision.task,'VISION_PRECHECK');assert.deepEqual(vision.result.fields.map(f=>f.value),['PERSON_A',null]);assert.equal(vision.fieldReview.status,'NEEDS_REVIEW');
});
test('saved generation reservations and usage stay inside the independent five-call USD0.03 approval',()=>{
 assert.equal(report.usage.generationCalls,5);assert.equal(report.usage.countCalls,5);assert.equal(report.attempts.length,5);
 assert.equal(report.attempts.reduce((n,a)=>n+BigInt(a.reservedNanoUsd),0n),16100000n);
 assert.ok(BigInt(report.usage.reservedNanoUsd)<=BigInt(report.approval.budgetNanoUsd));
 let known=0n;for(const a of report.attempts){const t=a.tokens;assert.equal(t.totalTokenCount,t.promptTokenCount+t.candidatesTokenCount+(t.thoughtsTokenCount??0));known+=BigInt(t.promptTokenCount)*300n+BigInt(t.candidatesTokenCount+(t.thoughtsTokenCount??0))*2500n;}
 assert.equal(known,2957300n);assert.equal(String(known),report.knownGenerationNanoUsd);assert.equal(report.billingInvoiceVerified,false);
});
