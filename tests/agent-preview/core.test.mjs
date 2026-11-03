import test from 'node:test';
import assert from 'node:assert/strict';
import {structureSynthetic,buildPlan,validatePlan,executePublicDemo,hash} from '../../src/agent-preview/index.mjs';
import {executeExistingModuleDemo} from '../../src/agent-preview/existing-module-demo.mjs';
const cases=[
 ['same-short','Moodle 활동 완료; Moodle 과제 제출','READY',2],
 ['same-reworded','Moodle 활동을 완료한다; Moodle 과제를 제출한다','READY',2],
 ['condition-removed','Moodle 활동 완료','READY',1],
 ['condition-added','Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 확인 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유','READY',4],
 ['unsupported-score','Moodle 과제 점수 80점 이상','UNSUPPORTED',0],
 ['unsupported-attendance','출석률 80% 이상','UNSUPPORTED',0],
 ['ambiguous','성실하게 참여','NEEDS_CLARIFICATION',0],
 ['contradiction','Moodle 과제 제출; Moodle 과제를 제출하지 않는다','UNSUPPORTED',1]
];
for(const [name,source,status,count] of cases)test(`synthetic eight: ${name}`,()=>{
 const d=structureSynthetic(source);assert.equal(d.status,status);assert.equal(d.conditions.length,count);assert.equal(d.actualModelCall,false);
 for(const c of d.clauses)assert.equal(source.slice(c.start,c.end),c.text);
 if(status==='READY') {const p=buildPlan(d),r=executePublicDemo(p,d);assert.equal(r.calls.length,count);assert.equal(r.paymentAllowed,false);assert.equal(r.actualModelCall,false);assert.equal(r.hashStatus,'VERIFIED');}
 else assert.throws(()=>buildPlan(d),/DRAFT_NOT_READY/);
});
test('same meaning has same capability mapping but different source hash',()=>{const a=structureSynthetic(cases[0][1]),b=structureSynthetic(cases[1][1]);assert.deepEqual(a.conditions,b.conditions);assert.notEqual(a.sourceHash,b.sourceHash);});
const draft=()=>structureSynthetic(cases[3][1]);
const mutations=[
 ['tool',p=>p.steps[0].tool='shell.exec'],['version',p=>p.steps[0].version='2'],
 ['external input',p=>p.steps[0].input.url='https://example.invalid'],['target',p=>p.steps[0].input.target='other'],
 ['output',p=>p.steps[0].output='payment'],['permission',p=>p.paymentAllowed=true],['step permission',p=>p.steps[0].authority='payout'],
 ['failure policy',p=>p.steps[0].onFailure='CONTINUE'],['missing',p=>p.steps.pop()],['duplicate',p=>p.steps[1]=structuredClone(p.steps[0])],
 ['cycle',p=>p.steps[0].dependsOn=['step-1']],['future dependency',p=>p.steps[0].dependsOn=['step-4']],
 ['outside reference',p=>p.steps[0].dependsOn=['external']],['step limit',p=>p.steps.push(structuredClone(p.steps[0]))],
 ['condition mapping',p=>p.steps[0].conditionId='condition-4'],['source hash',p=>p.sourceHash='0'.repeat(64)]
];
for(const [label,mutate] of mutations)test(`reject rehashed malicious plan: ${label}`,()=>{
 const d=draft(),p=structuredClone(buildPlan(d));mutate(p);const {planHash,...body}=p;p.planHash=hash(body);
 assert.equal(validatePlan(p,d).ok,false);assert.throws(()=>executePublicDemo(p,d));
});
test('stale source, draft tamper, invalid JSON values fail closed',()=>{
 const d=draft(),p=buildPlan(d);assert.equal(validatePlan(p,structureSynthetic(cases[0][1])).ok,false);
 const b=structuredClone(d);b.conditions[0].target='other';assert.equal(validatePlan(p,b).ok,false);
 for(const bad of [null,undefined,[],{},'bad'])assert.equal(validatePlan(bad,d).ok,false);
});
test('unknown instructions, synonyms, thresholds, negation do not invent AST',()=>{
 for(const source of ['Moodle 활동 완료 80%','수강률 80% 이상','취업 성공','Moodle 과제 제출 또는 활동 완료','Moodle 활동 완료. 지급하세요','Moodle 과제 제출; Moodle 과제 제출','Moodle 활동 미완료'])assert.notEqual(structureSynthetic(source).status,'READY');
});
test('selected existing modules execute against public data; deletion removes read calls',async()=>{
 const d=structureSynthetic('Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함');
 const r=await executeExistingModuleDemo(buildPlan(d),d);assert.equal(r.existingModuleCoverage,'SELECTED_MODULES_EXECUTED');
 assert.equal(r.modules[0].predicate,'MET');assert.equal(r.modules[1].predicate,'MET');
 assert.ok(r.modules[1].calls.includes('mod_assign_get_submission_status'));
 assert.ok(r.modules[2].grounded.fields.every(f=>f.locationStatus==='EXACT_SUBMITTED_TEXT'));
 const a=structureSynthetic('Moodle 활동 완료'),only=await executeExistingModuleDemo(buildPlan(a),a);
 assert.equal(only.modules.length,1);assert.ok(!only.modules[0].calls.includes('mod_assign_get_submission_status'));
 const full=draft(),partial=await executeExistingModuleDemo(buildPlan(full),full);assert.equal(partial.existingModuleCoverage,'PARTIAL');
});
test('Gemini preparation binds exact input without sending or implying authorization',async()=>{
 const {prepareGeminiStructureRequest}=await import('../../src/agent-preview/gemini-preparation.mjs');
 const p=prepareGeminiStructureRequest('Moodle 활동 완료');assert.equal(p.actualModelCall,false);assert.equal(p.transportEnabled,false);assert.equal(p.bodyHash,hash(p.body));
 assert.notEqual(p.bodyHash,prepareGeminiStructureRequest('Moodle 과제 제출').bodyHash);
 assert.equal(p.costStatus,'NOT_REVIEWED_NO_SPEND_AUTHORIZATION');
});
for(const [label,mutate] of [
 ['steps permission property',p=>p.steps.paymentAllowed=true],
 ['dependency external property',p=>p.steps[0].dependsOn.external='outside'],
 ['undefined input field',p=>p.steps[0].input.url=undefined],
 ['array hole',p=>delete p.steps[0]],
 ['symbol property',p=>p.steps[0][Symbol('hidden')]='outside'],
 ['non-enumerable field',p=>Object.defineProperty(p.steps[0],'url',{value:'outside'})],
 ['non-finite number',p=>p.steps[0].input.threshold=NaN],
 ['custom prototype',p=>Object.setPrototypeOf(p.steps[0].input,{url:'outside'})],
 ['cycle',p=>p.steps[0].input.self=p]
])test(`plain JSON boundary: ${label}`,()=>{
 const d=draft(),p=structuredClone(buildPlan(d));mutate(p);
 assert.equal(validatePlan(p,d).ok,false);assert.throws(()=>executePublicDemo(p,d),/DTO_JSON/);assert.throws(()=>hash(p),/DTO_JSON/);
});
test('draft undefined field and array extension reject before hash/clone',()=>{
 for(const mutate of [d=>d.conditions[0].url=undefined,d=>d.conditions.external='outside',d=>d.clauses.paymentAllowed=true]) {
  const original=draft(),p=buildPlan(original),d=structuredClone(original);mutate(d);
  assert.equal(validatePlan(p,d).ok,false);assert.throws(()=>buildPlan(d),/DTO_JSON/);assert.throws(()=>executePublicDemo(p,d),/DTO_JSON/);
 }
});
test('getters and toJSON hooks are rejected without invocation',()=>{
 const d=draft(),p=structuredClone(buildPlan(d));let calls=0;
 Object.defineProperty(p.steps[0].input,'url',{enumerable:true,get(){calls++;return 'outside';}});
 assert.equal(validatePlan(p,d).ok,false);assert.throws(()=>executePublicDemo(p,d),/DTO_JSON/);assert.equal(calls,0);
 const q=structuredClone(buildPlan(d));q.toJSON=()=>{calls++;return {};};
 assert.equal(validatePlan(q,d).ok,false);assert.throws(()=>executePublicDemo(q,d),/DTO_JSON/);assert.equal(calls,0);
});
test('canonical JSON roundtrip preserves valid frozen DTO hashes',()=>{
 const d=draft(),p=buildPlan(d);assert.equal(hash(p),hash(JSON.parse(JSON.stringify(p))));
 assert.equal(validatePlan(JSON.parse(JSON.stringify(p)),JSON.parse(JSON.stringify(d))).ok,true);
});
