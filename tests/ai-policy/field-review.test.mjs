import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reviewFields, createFieldReviewSession } from '../../src/ai-policy/field-review.mjs';
const field = (fieldId='score',value='700') => ({fieldId,value,location:'L1'});
const observation = () => ({fields:[field()],questions:[],flags:[]});
const context = (revision=1,runId='run-1',inputHash='a'.repeat(64)) => ({revision,runId,inputHash});

test('normal grounded observation is preserved without granting policy authority',()=>{
 const raw=observation(), result=reviewFields(raw,['score']);assert.equal(result.fields[0].value,'700');assert.equal(result.status,'OBSERVED_ONLY');assert.equal(result.publishable,false);assert.equal(result.automaticEligibility,false);assert.equal(result.paymentAllowed,false);assert.deepEqual(raw,observation());assert.ok(Object.isFrozen(result.provenance));
});
test('question/flag plus number always holds its explicit field; provenance and question remain',()=>{
 for(const kind of ['questions','flags']){const raw=observation();raw[kind]=[kind==='questions'?{questionId:'target-open',fieldIds:['score'],text:'700 or 800?'}:{code:'CONFLICT',fieldIds:['score']}];const result=reviewFields(raw,['score']);assert.equal(result.fields[0].value,null);assert.equal(result.fields[0].state,'HELD');assert.equal(result.provenance[0].observedValue,'700');assert.deepEqual(result[kind],raw[kind]);}
});
test('legacy strings and null scopes hold every field; no natural-language field guessing',()=>{
 for(const raw of [{fields:[field(),field('days','14')],questions:['700 or 800?'],flags:[]},{fields:[field(),field('days','14')],questions:[],flags:[{code:'UNCERTAIN',fieldIds:null}]}])assert.deepEqual(reviewFields(raw,['score','days']).fields.map(f=>f.value),[null,null]);
});
test('partial field conflict preserves unrelated observation without marking whole policy executable',()=>{
 const raw={fields:[field(),field('days','14')],questions:[{questionId:'score-open',fieldIds:['score'],text:'Which score?'}],flags:[]};const result=reviewFields(raw,['score','days']);assert.deepEqual(result.fields.map(f=>f.value),[null,'14']);assert.equal(result.status,'NEEDS_REVIEW');assert.equal(result.publishable,false);
});
test('number-only transport output is invalid; a structured number without signals remains unverified observation',()=>{
 assert.throws(()=>reviewFields(700,['score']),/AI_FIELD_REVIEW/);assert.throws(()=>reviewFields({...observation(),fields:[field('score',700)]},['score']),/AI_FIELD_REVIEW/);const result=reviewFields(observation(),['score']);assert.equal(result.fields[0].value,'700');assert.equal(result.publishable,false); // Undetected source conflicts cannot be discovered by this reducer.
});
test('unknown scopes, duplicate fields, missing provenance and extra authority fail closed',()=>{
 for(const mutate of [r=>{r.flags=[{code:'CONFLICT',fieldIds:['invented']}];},r=>{r.fields.push(field());},r=>{r.fields[0].location=null;},r=>{r.paymentAllowed=true;},r=>{r.questions=[{questionId:'q',fieldIds:[],text:'Ambiguous'}];}]){const raw=observation();mutate(raw);assert.throws(()=>reviewFields(raw,['score']),/AI_FIELD_REVIEW/);}
});
test('missing and null fields are held without fabricating a value or a source',()=>{
 const result=reviewFields({fields:[],questions:[],flags:[]},['score']);assert.equal(result.fields[0].value,null);assert.equal(result.fields[0].location,null);assert.equal(result.fields[0].state,'UNOBSERVED');
});
test('late revision and retry never overwrite current results, including a failed newer attempt',async()=>{
 const session=createFieldReviewSession(['score']),old=session.begin(context());let resolve;const delayed=new Promise(r=>{resolve=r;});const late=delayed.then(raw=>session.finish(old,raw));const newer=session.begin(context(2,'run-2','b'.repeat(64)));const current=session.finish(newer,observation());resolve(observation());assert.equal((await late).status,'STALE');assert.equal(session.isCurrent(current),true);
 const retry=session.begin(context(2,'run-3','b'.repeat(64)));assert.equal(session.isCurrent(current),false);assert.equal(session.finish(retry,700).status,'REJECTED');assert.equal(session.isCurrent(current),false);assert.throws(()=>session.finish(retry,observation()),/TICKET/);assert.throws(()=>session.begin(context()),/RUN_REUSE|REVISION/);assert.throws(()=>session.begin(context(2,'run-4','c'.repeat(64))),/REVISION/);
});
test('same-revision retry supersedes an in-flight result and caller mutation cannot alter pins',()=>{
 const session=createFieldReviewSession(['score']),input=context(),old=session.begin(input);input.revision=100;const retry=session.begin(context(1,'run-retry'));assert.equal(session.finish(old,observation()).status,'STALE');const raw=observation(),receipt=session.finish(retry,raw);raw.fields[0].value='999';assert.equal(receipt.review.fields[0].value,'700');assert.equal(session.isCurrent(receipt),true);assert.equal(session.isCurrent({...receipt}),false);assert.equal(session.isCurrent(structuredClone(receipt)),false);
});
test('stored ACTUAL T04 responses replay offline with held values and preserved evidence',async()=>{
 for(const filename of ['gemini-pilot-result.json','gemini-comparison-result.json']){const report=JSON.parse(await readFile(new URL('../../docs/ai-vision/'+filename,import.meta.url),'utf8'));const actual=report.attempts.find(a=>a.caseId==='T04'&&a.result);assert.equal(actual.result.fields.find(f=>f.fieldId==='score').value,'700');const result=reviewFields({fields:actual.result.fields,questions:actual.result.questions,flags:actual.result.flags},actual.result.fields.map(f=>f.fieldId));assert.equal(result.fields.find(f=>f.fieldId==='score').value,null);assert.ok(result.questions.length);assert.equal(result.provenance.find(f=>f.fieldId==='score').observedValue,'700');}
});
