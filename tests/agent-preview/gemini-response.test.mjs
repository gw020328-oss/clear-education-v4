import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceClauses, TOOL_MANIFEST} from '../../src/agent-preview/index.mjs';
import {prepareGeminiStructureRequest} from '../../src/agent-preview/gemini-preparation.mjs';
import {inspectFixtureReply, executeReviewedGeminiPreview, requestGeminiPreview} from '../../src/agent-preview/gemini-response.mjs';

function packet(sourceText, indices) {
  const rows = sourceClauses(sourceText).map(({text, start, end}, i) => ({
    quote: text, start, end, status: 'SUPPORTED', capability: TOOL_MANIFEST[indices[i]].capability, question: null
  }));
  return {
    sourceText, bodyHash: prepareGeminiStructureRequest(sourceText).bodyHash,
    reply: {candidates: [{finishReason: 'STOP', content: {role: 'model', parts: [{text: JSON.stringify({clauses: rows})}]}}]}
  };
}

test('reviewed model classifications of novel wording change executed Moodle modules', async () => {
  const sources = [
    packet('첫 Moodle 활동은 완료로 표시되어야 한다', [0]),
    packet('첫 Moodle 활동은 완료로 표시되어야 한다; Moodle에서 과제 제출 기록을 남긴다', [0, 1])
  ];
  for (const [index, input] of sources.entries()) {
    const inspected = inspectFixtureReply(input);
    assert.equal(inspected.draft.status, 'OPERATOR_REVIEW_REQUIRED');
    assert.equal((await executeReviewedGeminiPreview(input, 'stale', {fixture: true})).execution, null);
    const result = await executeReviewedGeminiPreview(input, inspected.draft.proposalHash, {fixture: true});
    assert.equal(result.execution.modules.length, index + 1);
    assert.equal(result.execution.modules.some(m => m.calls.includes('mod_assign_get_submission_status')), index === 1);
    assert.equal(result.execution.paymentAllowed, false);
    assert.equal(result.provenance, 'OFFLINE_RESPONSE_FIXTURE');
  }
});

test('strict model reply rejects omission, wrong quote, wrong capability, duplicates, truncation and stale request', () => {
  for (const mutate of [
    p => p.bodyHash = 'stale',
    p => p.reply.candidates[0].finishReason = 'MAX_TOKENS',
    p => p.reply.candidates[0].content.parts[0].text = '{"clauses":[],"clauses":[]}',
    p => p.reply.candidates[0].content.parts[0].text = '{"clauses":[]}',
    p => p.reply.candidates[0].content.parts[0].text = p.reply.candidates[0].content.parts[0].text.replace('Moodle 활동 완료', '출석률'),
    p => p.reply.candidates[0].content.parts[0].text = p.reply.candidates[0].content.parts[0].text.replace(TOOL_MANIFEST[0].capability, TOOL_MANIFEST[1].capability)
  ]) {
    const input = packet('Moodle 활동 완료', [0]);
    mutate(input);
    assert.throws(() => inspectFixtureReply(input));
  }
});

test('unresolved model status cannot execute, and host seam dispatches once only when provided', async () => {
  const input = packet('적극적인 학습', [0]);
  const part = input.reply.candidates[0].content.parts[0];
  const rows = JSON.parse(part.text);
  Object.assign(rows.clauses[0], {status:'NEEDS_CLARIFICATION', capability:null, question:'무엇을 완료해야 하나요?'});
  part.text = JSON.stringify(rows);
  const review = inspectFixtureReply(input);
  assert.equal((await executeReviewedGeminiPreview(input, review.draft.proposalHash)).plan, null);
  await assert.rejects(requestGeminiPreview(input.sourceText), /GEMINI_HOST_APPROVAL_REQUIRED/);
  let calls = 0;
  const result = await requestGeminiPreview(input.sourceText, {
    approvalRef: 'offline-test', claimAndDispatch: async wire => {
      calls++;
      assert.equal(wire.method, 'generateContent');
      assert.equal(wire.bodyHash, input.bodyHash);
      return input.reply;
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.draft.status, 'NEEDS_CLARIFICATION');
});

test('official optional role and final text signature preserve the reviewed proposal', async () => {
  const input = packet('Moodle 활동 완료', [0]);
  const baseline = inspectFixtureReply(input).draft;
  const content = input.reply.candidates[0].content;
  Object.assign(content.parts[0], {thoughtSignature: 'AQID', thought: false});
  for (const role of ['model', '', undefined]) {
    if (role === undefined) delete content.role;
    else content.role = role;
    const result = await executeReviewedGeminiPreview(input, baseline.proposalHash, {fixture: true});
    assert.deepEqual(result.execution.calls, ['moodle.activity.public']);
    assert.equal(result.execution.paymentAllowed, false);
    assert.equal(JSON.stringify(result).includes('AQID'), false);
  }
});

test('final text compatibility still rejects thoughts, tools, extra parts and unexpected roles', () => {
  for (const mutate of [
    c => c.role = 'user',
    c => c.role = null,
    c => c.parts[0].thought = true,
    c => c.parts[0].thought = 'false',
    c => c.parts[0].thoughtSignature = {},
    c => c.parts[0].thoughtSignature = '',
    c => c.parts[0].functionCall = {name: 'pay'},
    c => c.parts[0].inlineData = {mimeType: 'application/json', data: 'AQID'},
    c => c.parts.push({text: '{}'}),
    c => c.parts[0] = {thoughtSignature: 'AQID'}
  ]) {
    const input = packet('Moodle 활동 완료', [0]);
    mutate(input.reply.candidates[0].content);
    assert.throws(() => inspectFixtureReply(input), /GEMINI_RESPONSE_PARTS/);
  }
});
