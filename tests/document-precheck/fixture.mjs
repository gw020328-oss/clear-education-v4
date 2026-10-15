import { compileExample, exampleBinding } from '../../specs/m1/examples.mjs';
import { submissionDigest, reviewPlanDigest } from '../../src/document-precheck/precheck.mjs';

export function fixture(name = 'third', kind = 'REVIEW') {
  const compiled = compileExample(name), policy = compiled.policy;
  const requirement = policy.requirements.find(item => item.kind === kind);
  const rule = policy.rules.find(item => item.requirementId === requirement.requirementId);
  const submission = { submissionId: 'synthetic-submission', revision: 1, routeRevision: 1,
    posts: [{ postId: 'post-a', title: 'alpha synthetic', text: '가나다😀', tags: [], links: [], images: [] }] };
  const context = { binding: exampleBinding(compiled), requirementId: requirement.requirementId,
    ruleId: rule.ruleId, ruleVersion: 'synthetic-review.1', submissionId: submission.submissionId,
    submissionRevision: submission.revision, routeRevision: submission.routeRevision, inputHash: submissionDigest(submission), runId: 'synthetic-run-1' };
  const charCheck = { checkId: 'length', kind: 'CHAR_COUNT', scope: 'POST', basis: 'SYNTHETIC_ASSUMPTION', questionId: null,
    sourceRefs: structuredClone(rule.sourceRefs), options: { minimum: 4, unit: 'CODEPOINTS', space: 'INCLUDE', normalization: 'NONE' } };
  const plan = { version: context.ruleVersion, requirementId: context.requirementId, ruleId: context.ruleId, checks: [charCheck] };
  return { compiled, submission, context, plan };
}
export function rebind(value) {
  value.context.inputHash = submissionDigest(value.submission);
  value.context.submissionRevision = value.submission.revision;
  value.context.routeRevision = value.submission.routeRevision;
  return value;
}
export const pinned = value => ({ plan: value.plan, pinnedPlanHash: reviewPlanDigest(value.plan) });
export const image = (i = 0) => ({ imageId: 'image-' + i, byteLength: 1024, width: 100, height: 100 });
