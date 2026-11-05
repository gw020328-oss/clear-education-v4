// Candidate unit tests only. No browser, network or paid calls.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {toPanelProposal} from './condition-proposal.candidate.mjs';
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const source = '  😀 지정 강의를 완료하세요 ;\n 과제를 제출하세요  ';
function fixture(text=source) {
  const clauses = [...text.matchAll(/[^;\n]+/gu)].flatMap(match => {
    const quote = match[0].trim(); if (!quote) return [];
    const start = match.index + match[0].indexOf(quote);
    return [{quote,start,end:start+quote.length}];
  }).map((c,i) => ({...c,clauseId:`clause-${i+1}`,status:'SUPPORTED',
    capability:i===0 ? 'MOODLE_ACTIVITY_COMPLETION.1' : 'MOODLE_ASSIGNMENT_SUBMISSION.1',
    tool:i===0 ? 'moodle.activity.public' : 'moodle.assignment.public',question:null,serverGuard:null}));
  return {version:'clear-external-preview-draft.1',draftId:'01234567-89ab-4cde-8fab-0123456789ab',expiresAt:2000,
    bodyHash:'b'.repeat(64),actualModelCall:false,automaticEligibility:false,paymentAllowed:false,
    modelCall:{succeeded:true,replied:true,errorCode:null,execution:'OFFLINE_TEST_TRANSPORT',bodyHash:'b'.repeat(64)},
    proposal:{version:'clear-condition-proposal.1',executionMode:'MODEL_PROPOSAL',scope:'PRECONFIGURATION_ONLY',
      automaticEligibility:false,paymentAllowed:false,toolSelection:'MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL',
      sourceHash:hash(text),proposalHash:'c'.repeat(64),draftHash:'d'.repeat(64),
      status:'OPERATOR_REVIEW_REQUIRED',heldClauses:0,operatorCanApprove:true,clauses}};
}
const options = {expectedBodyHash:'b'.repeat(64),now:1000};
test('raw source, whitespace, clause order and UTF-16 emoji offsets are preserved', async () => {
  const got = await toPanelProposal(source,fixture(),options);
  assert.equal(got.canonicalText,source); assert.equal(got.serverBinding.sourceText,source);
  assert.equal(got.clauses[0].start,2); assert.equal(source.slice(got.clauses[0].start,got.clauses[0].end),got.clauses[0].original);
  assert.equal(got.complete,true); assert.equal(got.operatorCanApprove,true); assert.equal(got.canExecute,false);
});
test('one sentence stays one clause; no splitting into multiple capabilities', async () => {
  const text = '강의수강 후기적기 과제제출', f = fixture(text), row = f.proposal.clauses[0];
  Object.assign(row,{status:'NEEDS_CLARIFICATION',capability:null,tool:null,question:'조항을 명시적으로 나누세요',
    serverGuard:{kinds:['MULTIPLE_CONDITIONS'],modelStatus:'SUPPORTED',modelCapability:'MOODLE_ACTIVITY_COMPLETION.1'}});
  Object.assign(f.proposal,{status:'NEEDS_CLARIFICATION',heldClauses:1,operatorCanApprove:false});
  const got = await toPanelProposal(text,f,options);
  assert.equal(got.clauses.length,1); assert.equal(got.clauses[0].held,true); assert.equal(got.canExecute,false);
  assert.equal(got.clauses[0].capability,null); assert.equal(got.clauses[0].serverGuard.kinds[0],'MULTIPLE_CONDITIONS');
});
test('mixed supported/unsupported result blocks the whole model proposal', async () => {
  const f=fixture(); Object.assign(f.proposal.clauses[1],{status:'UNSUPPORTED',capability:null,tool:null,question:'미지원'});
  Object.assign(f.proposal,{status:'UNSUPPORTED',heldClauses:1,operatorCanApprove:false});
  const got=await toPanelProposal(source,f,options);
  assert.equal(got.readable,1); assert.equal(got.canExecute,false); assert.equal(got.complete,false);
});
test('execution stays display-only unless the accepted D single-activity contract matches', async () => {
  const opts={...options,executionContract:'D_SINGLE_ACTIVITY_OFFLINE.1'};
  assert.equal((await toPanelProposal(source,fixture(),opts)).canExecute,false);
  const text='지정 강의를 완료하세요';
  assert.equal((await toPanelProposal(text,fixture(text),opts)).canExecute,true);
  await assert.rejects(toPanelProposal(text,fixture(text),{...options,executionContract:'PUBLIC_FIXTURE_MULTI'}));
});
test('changed source and body invalidate old proposal, including trailing whitespace', async () => {
  await assert.rejects(toPanelProposal(source+' ',fixture(),options), /PROPOSAL_SOURCE_BINDING/);
  await assert.rejects(toPanelProposal(source,fixture(),{...options,expectedBodyHash:'a'.repeat(64)}), /PROPOSAL_BODY_BINDING/);
});
test('quote mismatch, missing row and wrong code-selected tool reject', async () => {
  for (const mutate of [f=>f.proposal.clauses[0].start++,f=>f.proposal.clauses.pop(),f=>f.proposal.clauses[0].tool='shell.exec']) {
    const f=fixture(); mutate(f); await assert.rejects(toPanelProposal(source,f,options));
  }
});
test('exact expiry and inconsistent approval flags reject', async () => {
  await assert.rejects(toPanelProposal(source,fixture(),{...options,now:2000}), /EXPIRED/);
  const f=fixture(); f.proposal.operatorCanApprove=false; await assert.rejects(toPanelProposal(source,f,options));
});
test('actual model provenance stays separate from tool execution and cannot contradict transport', async () => {
  const f=fixture(); f.modelCall.execution='ACTUAL'; await assert.rejects(toPanelProposal(source,f,options));
  f.actualModelCall=true; const got=await toPanelProposal(source,f,options);
  assert.equal(got.provenance.actualModelCall,true); assert.equal(got.clauses[0].source,'Gemini 실제 응답');
  assert.equal(Object.hasOwn(got,'actualMoodleQuery'),false); // No tool ran in a display converter.
});
test('no proposal on failure, unknown protocol and untrusted readiness reject', async () => {
  for (const f of [{stage:'MODEL_CALL_FAILED',proposal:null},{...fixture(),version:'unknown'},
    {...fixture(),proposal:{...fixture().proposal,status:'READY'}}]) await assert.rejects(toPanelProposal(source,f,options));
});
test('returned binding and held metadata are frozen and detached from incoming DTO', async () => {
  const f=fixture(),got=await toPanelProposal(source,f,options);
  f.proposal.clauses[0].quote='changed'; f.modelCall.execution='ACTUAL';
  assert.notEqual(got.clauses[0].original,'changed'); assert.equal(got.provenance.modelCall.execution,'OFFLINE_TEST_TRANSPORT');
  assert.throws(()=>{got.serverBinding.proposalHash='bad';},TypeError);
});
