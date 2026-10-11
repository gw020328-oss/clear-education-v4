import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticPolicy,syntheticHtml,syntheticExchange,verifySyntheticReceipt,validateSyntheticFields } from '../extraction.mjs';
const rows = [{id:'100001',score:780},{id:'100002',score:850,date:'2026-10-04'}];
const run = (role='score',html=syntheticHtml(rows,role),params=syntheticPolicy(role,'100002')) => verifySyntheticReceipt(params,syntheticExchange(params,html));
for(const role of ['registration','score']) test(`real HTTP provider extracts ${role} from synthetic redacted UTF-8 transcript`,()=>{
 const out=run(role); assert.equal(out.fields.registration_number,'100002'); assert.equal(out.fields.exam_date,'2026-10-04');
 assert.equal(out.fields.total_score,role==='score'?'850':undefined); validateSyntheticFields(out.fields,role);
 for(const marker of ['SYNTHETIC_PRIVATE_NAME','SYNTHETIC_COOKIE_CANARY','SYNTHETIC_SET_COOKIE_CANARY','SYNTHETIC_BODY_CANARY']) assert.ok(!Buffer.concat([out.request,out.response]).includes(Buffer.from(marker)));
 assert.deepEqual(Object.keys(out.fields).sort(),['exam_type','exam_date','registration_number',...(role==='score'?['total_score']:[])].sort());
});
test('row order never mixes fields or selects first row instead of requested exam',()=>{assert.deepEqual(run('score',syntheticHtml([...rows].reverse())).fields,run().fields);});
for(const [name,html] of [
 ['no rows',syntheticHtml([])],['missing target',syntheticHtml(rows.slice(0,1))],
 ['empty required value',syntheticHtml([{...rows[1],score:''}])],
 ['duplicate target',syntheticHtml([rows[1],rows[1]])],
 ['duplicate conflicting score',syntheticHtml([rows[1],{...rows[1],score:990}])],
 ['cross-row splice','<table id="exams"><tr><td>TOEIC</td><td>2026-10-04</td><td>100002</td></tr><tr><td>850</td></tr></table>'],
 ['hidden row fragment',syntheticHtml(rows).replace('<td>780</td>','************')],
 ['different test',syntheticHtml([{...rows[1],type:'TOEFL'}])],
 ['extra field',syntheticHtml(rows).replace('<td>850</td>','<td>850</td><td>INJECTED_NAME</td>')],
]) test(`provider rejects ${name}`,()=>assert.throws(()=>run('score',html)));
for(const status of ['302 Found','401 Unauthorized','500 Server Error']) test(`provider rejects source HTTP ${status}`,()=>{
 const p=syntheticPolicy('score','100002'); assert.throws(()=>verifySyntheticReceipt(p,syntheticExchange(p,syntheticHtml(rows),status)));
});
test('provider mandatory extraction throws before context injection can be reused',()=>{
 const p=syntheticPolicy('score','100002');const injected={extractedParameters:{total_score:'990'}};
 assert.throws(()=>verifySyntheticReceipt(p,syntheticExchange(p,syntheticHtml([]))));assert.equal(injected.extractedParameters.total_score,'990');
});
test('empty extraction is possible with weak policy: reproduce server merge risk without claiming TLS attestation',()=>{
 const p=syntheticPolicy('score','100002');p.responseMatches=[{type:'contains',value:'TOEIC'}];
 const out=run('score',syntheticHtml(rows),p);assert.deepEqual(out.fields,{});
 // Exact merge behavior from pinned assert-valid-claim-request.ts; NOT the full server verifier.
 const context={extractedParameters:{exam_type:'TOEIC',exam_date:'2026-10-04',registration_number:'100002',total_score:'990'}};
 if(Object.keys(out.fields).length) context.extractedParameters=out.fields;
 assert.equal(context.extractedParameters.total_score,'990');
 // A field schema alone cannot establish provenance. Only the pinned mandatory extraction policy can.
 assert.equal(validateSyntheticFields(context.extractedParameters,'score').total_score,'990');
});
test('required extraction returns complete source values replacing injected client values in pinned merge model',()=>{
 const out=run();const context={extractedParameters:{total_score:'990',candidate_name:'INJECTED'}};
 if(Object.keys(out.fields).length) context.extractedParameters=out.fields;
 assert.equal(context.extractedParameters.total_score,'850');assert.equal(context.extractedParameters.candidate_name,undefined);
});
for(const [name,field,value] of [['calendar','exam_date','2026-02-30'],['range','total_score','995'],['step','total_score','851'],['missing','total_score',undefined]]) test(`post-extraction validator rejects ${name}`,()=>{
 const f={...run().fields,[field]:value};assert.throws(()=>validateSyntheticFields(f,'score'));
});
test('altered URL and method do not match even synthetically valid transcript',()=>{
 const p=syntheticPolicy('score','100002'),e=syntheticExchange(p,syntheticHtml(rows));
 assert.throws(()=>verifySyntheticReceipt({...p,url:'https://other.invalid/score'},e));
 assert.throws(()=>verifySyntheticReceipt({...p,method:'POST'},e));
});

test('first-match redaction hides second table: provider success is not proof of list completeness',()=>{
 const p=syntheticPolicy('score','100002'),e=syntheticExchange(p,syntheticHtml(rows)+syntheticHtml(rows));
 assert.throws(()=>verifySyntheticReceipt(p,e,false));
 assert.equal(verifySyntheticReceipt(p,e,true).fields.total_score,'850');
});
