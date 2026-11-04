import assert from 'node:assert/strict';
import {sourceClauses} from '@clear/preview-core';
import {prepareGeminiStructureRequest} from '@clear/preview-core/modules';
import {inspectFixtureReply, executeReviewedGeminiPreview} from '@clear/preview-core/gemini';

const cases = [
  ['Moodle에서 첫 학습 활동을 마쳐야 한다', ['MOODLE_ACTIVITY_COMPLETION.1']],
  ['Moodle에서 첫 학습 활동을 마쳐야 한다; Moodle에 과제를 내야 한다; HackerRank Python (Basic) 인증서 보유',
    ['MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1', 'HACKERRANK_CERTIFICATE_HOLDING.1']]
];
for (const [sourceText, capabilities] of cases) {
  const {bodyHash} = prepareGeminiStructureRequest(sourceText);
  const clauses = sourceClauses(sourceText).map(({text, start, end}, i) => ({
    quote: text, start, end, status: 'SUPPORTED', capability: capabilities[i], question: null
  }));
  const packet = {
    sourceText, bodyHash,
    reply: {candidates: [{finishReason: 'STOP', content: {role: 'model', parts: [{text: JSON.stringify({clauses})}]}}]}
  };
  const {draft} = inspectFixtureReply(packet);
  assert.equal(draft.status, 'OPERATOR_REVIEW_REQUIRED');
  const result = await executeReviewedGeminiPreview(packet, draft.proposalHash, {fixture: true});
  assert.equal(result.plan.steps.length, capabilities.length);
  assert.equal(result.execution.modules.length, capabilities.length);
  assert.equal(result.execution.paymentAllowed, false);
  assert.equal(result.execution.modules.some(m => m.calls?.includes('mod_assign_get_submission_status')), capabilities.length > 1);
  assert.equal(result.execution.modules.some(m => m.syntheticSignaturesVerified === true), capabilities.length > 1);
  console.log(JSON.stringify({bodyHash, provenance: result.provenance, tools: result.execution.calls}));
}
