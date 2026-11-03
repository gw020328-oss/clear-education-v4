import { summarizeOperationalMetrics } from './index.mjs';

export function recordReview({ scope, personRef, workKind = 'REVIEW', marks }) {
  let state = 'IDLE';
  let startMs;
  let lastMs = 0;
  const intervals = [];
  const transitions = {
    IDLE: { START: 'WORKING' },
    WORKING: { PAUSE: 'PAUSED', END: 'DONE' },
    PAUSED: { RESUME: 'WORKING', END: 'DONE' },
    DONE: {},
  };
  for (const { action, atMs } of marks) {
    const next = Object.hasOwn(transitions[state], action) && transitions[state][action];
    if (!next || !Number.isSafeInteger(atMs) || atMs < lastMs) throw new Error('REVIEW_MARK');
    if (state === 'WORKING') {
      if (atMs === startMs) throw new Error('REVIEW_MARK');
      intervals.push({
        id: 'work-' + personRef + '-' + (intervals.length + 1),
        scope, kind: 'HUMAN', personRef, workKind, startMs, endMs: atMs,
      });
    }
    if (next === 'WORKING') startMs = atMs;
    state = next;
    lastMs = atMs;
  }
  return { complete: state === 'DONE', intervals };
}

const matchKeys = ['caseRef', 'policyRef', 'evidenceRef', 'completionScopeRef', 'qualityRubricRef'];

export function compareReviewWork({ baseline, assisted }) {
  const left = baseline ? summarizeOperationalMetrics(baseline.input) : null;
  const right = assisted ? summarizeOperationalMetrics(assisted.input) : null;
  const mode = left && right && left.scope.mode === right.scope.mode ? left.scope.mode : null;
  const unavailable = reason => ({
    version: 'clear-review-work-comparison.1', mode, reason,
    baselinePersonMs: null, assistedPersonMs: null, humanWorkReductionPercent: null,
  });
  if (!left || !right) return unavailable('MISSING_ARM');
  if (!mode || left.scope.source !== right.scope.source ||
    left.scope.applicationRef !== right.scope.applicationRef ||
    left.scope.accessScopeRef !== right.scope.accessScopeRef ||
    left.scope.runId === right.scope.runId) return unavailable('SCOPE_MISMATCH');
  if (baseline.method !== 'MANUAL' || assisted.method !== 'CLEAR_ASSISTED' ||
    baseline.qualityPassed !== true || assisted.qualityPassed !== true ||
    !matchKeys.every(key => typeof baseline[key] === 'string' && /^[a-z0-9][a-z0-9_-]{0,95}$/i.test(baseline[key]) &&
      baseline[key] === assisted[key])) return unavailable('NOT_COMPARABLE');
  if (!left.coverage.human || !right.coverage.human) return unavailable('INCOMPLETE_COVERAGE');
  const baselinePersonMs = left.time.recordedPersonMs;
  const assistedPersonMs = right.time.recordedPersonMs;
  if (!baselinePersonMs) return unavailable('ZERO_BASELINE');
  return {
    version: 'clear-review-work-comparison.1', mode, reason: null,
    baselinePersonMs, assistedPersonMs,
    humanWorkReductionPercent: (baselinePersonMs - assistedPersonMs) / baselinePersonMs * 100,
  };
}
