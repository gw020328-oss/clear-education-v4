import test from 'node:test';
import assert from 'node:assert/strict';
import {compileExample, exampleDraft} from '../../specs/m1/examples.mjs';
import {compileMvpPolicy} from '../../src/policy/mvp/compiler.mjs';
import {evaluateMvpEligibility} from '../../src/eligibility/mvp/evaluator.mjs';
import {evaluationExample} from '../../specs/m2/examples.mjs';
import {describeClaimBoundary} from './capabilities.mjs';
const kinds = route => route.predicates.map(p => p.kind).sort();
test('YBM score proof alone leaves common review/mock and complete learning requirements', () => {
  const p=describeClaimBoundary(compileExample('ybm'),100);
  assert.deepEqual(kinds(p.routes[0]),['EXAM','LEARNING','MOCK_TEST','REVIEW']);
  assert.equal(p.routes[0].predicates.find(x=>x.kind==='EXAM').coverage,'EXISTENTIAL');
  assert.equal(p.routes[0].predicates.find(x=>x.kind==='LEARNING').coverage,'COMPLETE_PERIOD');
  assert.equal(p.paymentAllowed,false); assert.equal(p.independentClaim,'NO_GO');
});
test('Siwon 100 attendance OR achievement does not union evidence or lose common review',()=>{
  const p=describeClaimBoundary(compileExample('siwon'),100);
  assert.deepEqual(kinds(p.routes.find(r=>r.routeId==='attendance')),['LEARNING','REVIEW']);
  assert.deepEqual(kinds(p.routes.find(r=>r.routeId==='achievement')),['BASELINE','EXAM','REVIEW']);
});
for(const tier of [50,200,300])test(`tier ${tier} keeps its own rule graph and no claim authority`,()=>{
  const p=describeClaimBoundary(compileExample('siwon'),tier);
  assert.equal(p.routes[0].predicates.some(x=>x.kind==='BASELINE'),tier!==50);
  assert.equal(p.claimAuthority,false);assert.equal(p.amountAuthority,'SYNTHETIC_QUOTE_NOT_CLAIM_AUTHORITY');
});
test('400 stays precheck-only and 500 is rejected',()=>{
  const c=compileExample('siwon'),p=describeClaimBoundary(c,400);
  assert.equal(p.support,'PRECHECK_ONLY');assert.equal(p.quote.amountAtoms,null);
  assert.ok(p.routes[0].predicates.find(x=>x.kind==='BLOG').blockers.includes('PRECHECK_IS_NOT_SOURCE_EVIDENCE'));
  assert.throws(()=>describeClaimBoundary(c,500),/UNSUPPORTED_TIER/);
});
test('existing M2 final synthetic entitlement does not resolve source or onchain authority',()=>{
  const {compiled,input}=evaluationExample('ybm');const r=evaluateMvpEligibility(compiled,input);
  assert.equal(r.settlement,'FINAL_SYNTHETIC');assert.ok(r.entitlement);assert.equal(r.entitlement.claimAuthority,false);
  assert.equal(r.paymentAllowed,false);
  const p=describeClaimBoundary(compiled,100);
  assert.equal(p.claimAuthority,false);assert.ok(p.globalBlockers.includes('POLICY_EXECUTION_ONCHAIN_UNBOUND'));
});
test('forged compiled copy is rejected; output frozen without changing original policy',()=>{
  const c=compileExample('ybm');assert.throws(()=>describeClaimBoundary(structuredClone(c),100),/MVP_COMPILED_REQUIRED/);
  const before=JSON.stringify(c),p=describeClaimBoundary(c,100);
  assert.throws(()=>{p.routes[0].predicates[0].blockers.length=0;},TypeError);
  assert.equal(JSON.stringify(c),before);
});
test('threshold/policy and amount changes remain visible in distinct commitments and quotes',()=>{
  const a=describeClaimBoundary(compileExample('ybm'),100),draft=exampleDraft('ybm');
  draft.rules.find(r=>r.ruleId==='score-target').threshold=850;draft.amount.netAtoms='100000001';
  const b=describeClaimBoundary(compileMvpPolicy(draft,{sources:structuredClone(draft.sources),capabilities:structuredClone(draft.capabilities)}),100);
  assert.notEqual(a.policyHash,b.policyHash);assert.notEqual(a.quote.amountAtoms,b.quote.amountAtoms);
  assert.notEqual(a.routes[0].predicates.find(p=>p.kind==='EXAM').ruleHash,b.routes[0].predicates.find(p=>p.kind==='EXAM').ruleHash);
  assert.equal(b.claimAuthority,false);
});
test('third profile uses its configured graph instead of hardcoded academy/800+80 rules',()=>{
  const p=describeClaimBoundary(compileExample('third'),75);
  assert.equal(p.routes[0].predicates.find(r=>r.kind==='EXAM').threshold,700);
  assert.equal(p.quote.amountAtoms,'42000000');assert.equal(p.paymentAllowed,false);
});
