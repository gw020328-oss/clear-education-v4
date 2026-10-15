import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContract } from '../../src/policy/mvp/contract.mjs';
import { evaluateMvpEligibility } from '../../src/eligibility/mvp/evaluator.mjs';
import { evaluationExample } from '../../specs/m2/examples.mjs';
import { precheckCode } from '../../src/document-precheck/precheck.mjs';
import { fixture, pinned } from '../document-precheck/fixture.mjs';

test('a CHECKED DocumentPrecheck remains rejected as M2 Evidence for every profile',()=>{
 for(const name of ['ybm','siwon','third']){
  const value=fixture(name),record=precheckCode(value.compiled,value.context,value.submission,pinned(value)).records[0];
  assert.equal(record.reviewStatus,'CHECKED');validateContract('DocumentPrecheck',record);
  assert.throws(()=>validateContract('Evidence',record),/MVP_SCHEMA/);
  const {compiled,input}=evaluationExample(name);input.evidence.push(record);
  assert.throws(()=>evaluateMvpEligibility(compiled,input),/MVP_SCHEMA/);
  assert.equal(record.automaticEligibility,false);assert.equal(record.paymentAllowed,false);
 }
});
