import { INPUT_VERSION, recordReview } from '../../src/operational-metrics/index.mjs';

export const emptyCoverage = {
  verification: false, attempts: false, mandatory: false, exceptions: false, human: false,
};
export const scope = {
  applicationRef: 'demo-application', runId: 'demo-run', epochRef: 'demo-clock',
  accessScopeRef: 'demo-access', mode: 'SYNTHETIC', source: 'FIXTURE',
};
export const event = (id, kind, startMs, endMs, extra = {}, eventScope = scope) =>
  ({ id, kind, startMs, endMs, scope: eventScope, ...extra });

const attempt = { operationRef: 'verify-activity', conditionRef: 'activity', automation: true };
export const operationalInput = {
  version: INPUT_VERSION, scope,
  coverage: { ...emptyCoverage, verification: true, attempts: true, mandatory: true },
  events: [
    event('login', 'MANDATORY', 0, 100, { actionRef: 'login-step', workKind: 'LOGIN' }),
    event('first', 'ATTEMPT', 100, 400, { ...attempt, attempt: 1, outcome: 'FAILED' }),
    event('second', 'ATTEMPT', 500, 700, { ...attempt, attempt: 2, outcome: 'SUCCEEDED' }),
    event('verified', 'VERIFIED', 100, 700, { conditionRef: 'activity', automation: true }),
  ],
};

export function reviewArm(caseRef, method, finalMs) {
  const runId = method === 'MANUAL' ? 'manual-' + caseRef : 'assisted-' + caseRef;
  const runScope = { ...scope, runId, epochRef: 'clock-' + runId };
  const review = recordReview({
    scope: runScope, personRef: 'demo-reviewer',
    marks: [
      { action: 'START', atMs: 0 }, { action: 'PAUSE', atMs: 100 },
      { action: 'RESUME', atMs: 200 }, { action: 'END', atMs: finalMs },
    ],
  });
  return {
    method, caseRef, policyRef: 'demo-policy', evidenceRef: 'evidence-' + caseRef,
    completionScopeRef: 'review-output', qualityRubricRef: 'demo-rubric', qualityPassed: true,
    input: {
      version: INPUT_VERSION, scope: runScope, coverage: { ...emptyCoverage, human: review.complete },
      events: [...review.intervals, event('complete', 'CASE', 0, finalMs, {}, runScope)],
    },
  };
}

export const reviewPairs = ['normal', 'insufficient', 'ambiguous'].map(caseRef => ({
  caseRef, baseline: reviewArm(caseRef, 'MANUAL', 800), assisted: reviewArm(caseRef, 'CLEAR_ASSISTED', 550),
}));
