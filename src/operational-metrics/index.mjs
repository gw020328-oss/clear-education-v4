export const INPUT_VERSION = 'clear-operational-metrics-input.1';
export const SUMMARY_VERSION = 'clear-operational-metrics-summary.1';

const origins = { SYNTHETIC: ['FIXTURE'], MEASURED: ['VERIFIED_SERVER_EXPORT', 'OBSERVED_REVIEW'] };
const workKinds = ['REVIEW', 'LOGIN', 'SIGNATURE', 'PAYMENT_CONSENT', 'EXCEPTION'];
const kinds = ['VERIFIED', 'ATTEMPT', 'WAIT', 'HUMAN', 'CASE', 'MANDATORY', 'EXCEPTION'];
const scopeKeys = ['applicationRef', 'runId', 'epochRef', 'accessScopeRef', 'mode', 'source'];
const coverageKeys = ['verification', 'attempts', 'mandatory', 'exceptions', 'human'];
const require = (condition, code) => { if (!condition) throw new Error(code); };
const ref = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,95}$/i.test(value);
const ms = value => Number.isSafeInteger(value) && value >= 0;
const fields = (object, keys) => object && Object.keys(object).length === keys.length &&
  keys.every(key => Object.hasOwn(object, key));
const unique = (set, key) => {
  require(!set.has(key), 'METRIC_DUPLICATE');
  set.add(key);
};
function union(rows) {
  let total = 0;
  let end = 0;
  for (const row of [...rows].sort((a, b) => a.startMs - b.startMs)) {
    total += Math.max(0, row.endMs - Math.max(end, row.startMs));
    end = Math.max(end, row.endMs);
  }
  return total;
}

export function summarizeOperationalMetrics(input) {
  require(fields(input, ['version', 'scope', 'coverage', 'events']) &&
    input.version === INPUT_VERSION && Array.isArray(input.events), 'METRIC_INPUT');
  const { scope, coverage, events } = input;
  require(fields(scope, scopeKeys) && scopeKeys.every(key => ref(scope[key])) &&
    Object.hasOwn(origins, scope.mode) && origins[scope.mode].includes(scope.source), 'METRIC_SCOPE');
  require(fields(coverage, coverageKeys) &&
    coverageKeys.every(key => typeof coverage[key] === 'boolean'), 'METRIC_COVERAGE');
  if (scope.source === 'VERIFIED_SERVER_EXPORT') require(!coverage.human, 'METRIC_COVERAGE');
  if (scope.source === 'OBSERVED_REVIEW') {
    require(!coverage.verification && !coverage.attempts && !coverage.mandatory &&
      !coverage.exceptions, 'METRIC_COVERAGE');
  }

  const ids = new Set();
  const logical = new Set();
  const operations = new Map();
  const people = new Map();
  const conditions = new Map();
  const groups = Object.fromEntries(kinds.map(kind => [kind, []]));
  let lastEnd = 0;
  for (const row of events) {
    require(row && kinds.includes(row.kind), 'METRIC_KIND');
    const extra = {
      ATTEMPT: ['operationRef', 'attempt', 'outcome', 'automation', 'conditionRef'],
      VERIFIED: ['conditionRef', 'automation'],
      HUMAN: ['personRef', 'workKind'],
      MANDATORY: ['actionRef', 'workKind'],
      EXCEPTION: ['actionRef'],
      WAIT: [], CASE: [],
    }[row.kind];
    require(fields(row, ['id', 'scope', 'kind', 'startMs', 'endMs', ...extra]) && ref(row.id), 'METRIC_EVENT');
    require(fields(row.scope, scopeKeys) && scopeKeys.every(key => row.scope[key] === scope[key]), 'METRIC_SCOPE_MIX');
    require(ms(row.startMs) && ms(row.endMs) && row.endMs >= row.startMs &&
      row.endMs >= lastEnd, 'METRIC_CLOCK');
    lastEnd = row.endMs;
    unique(ids, row.id);
    groups[row.kind].push(row);
    if (row.kind === 'ATTEMPT') {
      require(ref(row.operationRef) && Number.isSafeInteger(row.attempt) && row.attempt > 0 &&
        ['FAILED', 'SUCCEEDED'].includes(row.outcome) && typeof row.automation === 'boolean' &&
        (row.conditionRef === null || ref(row.conditionRef)), 'METRIC_ATTEMPT');
      const prior = operations.get(row.operationRef);
      if (prior) require(prior.outcome === 'FAILED' && prior.attempt + 1 === row.attempt &&
        prior.endMs <= row.startMs && prior.automation === row.automation &&
        prior.conditionRef === row.conditionRef, 'METRIC_ATTEMPT_SEQUENCE');
      else require(!coverage.attempts || row.attempt === 1, 'METRIC_ATTEMPT_SEQUENCE');
      operations.set(row.operationRef, row);
    } else if (row.kind === 'VERIFIED') {
      require(ref(row.conditionRef) && typeof row.automation === 'boolean', 'METRIC_CONDITION');
      unique(logical, 'condition:' + row.conditionRef);
      conditions.set(row.conditionRef, row.automation);
    } else if (row.kind === 'HUMAN') {
      require(scope.source !== 'VERIFIED_SERVER_EXPORT' && ref(row.personRef) &&
        workKinds.includes(row.workKind) && row.endMs > row.startMs, 'METRIC_HUMAN');
      const rows = people.get(row.personRef) ?? [];
      rows.push(row);
      people.set(row.personRef, rows);
    } else if (row.kind === 'CASE') {
      unique(logical, 'case');
    } else if (row.kind === 'MANDATORY' || row.kind === 'EXCEPTION') {
      require(ref(row.actionRef) && (row.kind === 'EXCEPTION' ||
        workKinds.slice(1, 4).includes(row.workKind)), 'METRIC_ACTION');
      unique(logical, 'action:' + row.actionRef);
    }
    require(scope.source !== 'OBSERVED_REVIEW' || ['HUMAN', 'CASE', 'WAIT'].includes(row.kind),
      'METRIC_SOURCE');
  }
  const caseWindow = groups.CASE[0];
  if (caseWindow) require(events.every(row => row.startMs >= caseWindow.startMs &&
    row.endMs <= caseWindow.endMs), 'METRIC_CASE_WINDOW');
  require(!coverage.human || caseWindow, 'METRIC_COVERAGE');
  const personMs = [...people.values()].reduce((total, rows) => total + union(rows), 0);
  require(ms(personMs), 'METRIC_OVERFLOW');
  const attempts = groups.ATTEMPT;
  const counts = (rows, complete, value = rows.length) => rows.length || complete ? value : null;
  return {
    version: SUMMARY_VERSION,
    scope: { ...scope, type: 'APPLICATION_RUN' },
    coverage: { ...coverage, caseCompletion: Boolean(caseWindow) },
    eventCount: events.length,
    verification: {
      applicationsWithVerifiedConditions: counts(groups.VERIFIED, coverage.verification, conditions.size ? 1 : 0),
      verifiedConditions: counts(groups.VERIFIED, coverage.verification),
      automatedVerifiedConditions: counts(groups.VERIFIED, coverage.verification,
        [...conditions.values()].filter(Boolean).length),
      conditions: [...conditions].map(([conditionRef, automated]) => ({ conditionRef, automated })),
    },
    operations: {
      logical: counts(attempts, coverage.attempts, operations.size),
      attempts: counts(attempts, coverage.attempts),
      retries: counts(attempts, coverage.attempts, attempts.filter(row => row.attempt > 1).length),
      failedAttempts: counts(attempts, coverage.attempts, attempts.filter(row => row.outcome === 'FAILED').length),
      automatedCompleted: counts(attempts, coverage.attempts,
        [...operations.values()].filter(row => row.automation && row.outcome === 'SUCCEEDED').length),
    },
    interventions: {
      mandatory: counts(groups.MANDATORY, coverage.mandatory),
      exceptions: counts(groups.EXCEPTION, coverage.exceptions),
    },
    time: {
      overallElapsedMs: caseWindow ? caseWindow.endMs - caseWindow.startMs : null,
      recordedVerificationWallMs: groups.VERIFIED.length ? union(groups.VERIFIED) : null,
      recordedWaitingWallMs: groups.WAIT.length ? union(groups.WAIT) : null,
      recordedPersonMs: people.size || coverage.human ? personMs : null,
    },
  };
}

export { recordReview, compareReviewWork } from './review.mjs';
