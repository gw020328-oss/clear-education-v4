// TEST NOTATION ONLY: neither the M0/M1/M2 DTO nor a proposed product API.
// Outcomes are review targets. No evaluator, real source or payment is called.
export function calendarLabels(start, count) {
  const day = new Date(start + 'T12:00:00Z');
  return Array.from({ length: count }, () => {
    const result = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
    return result;
  });
}

const start = '2026-10-14';
function baseline(kind) {
  const progress = kind === 'PROGRESS', days = progress ? 100 : 90;
  const dates = calendarLabels(start, days);
  return {
    authority: 'TEST_VECTOR_ONLY', mode: 'SYNTHETIC',
    officialPolicyConfirmed: false, productConnected: false, paymentAuthorized: false,
    assumptionProfile: progress ? 'synthetic-progress-and-strict-speed.1' : 'synthetic-effective-ms.1',
    ruleKind: kind, selectedRoute: 'ATTENDANCE', timeZone: 'Asia/Seoul',
    startDate: start, periodDays: days,
    asOf: progress ? '2027-01-22T00:05:00+09:00' : '2027-01-12T00:05:00+09:00',
    source: {
      complete: 'COMPLETE', expectedRevision: 'r1', currentRevision: 'r1',
      snapshotConsistency: 'CONFIRMED_FOR_SYNTHETIC_FIXTURE', correction: 'UNCHANGED',
      subject: 'MATCHED', institution: 'MATCHED', course: 'MATCHED', policy: 'MATCHED',
      inventory: 'MATCHED', pageChain: 'COMPLETE', sameRevisionContent: 'UNCHANGED',
    },
    // M1/M2 must provide actual policy meaning. These choices are synthetic.
    assumptions: {
      timeThresholdBps: progress ? null : 9000, progressThresholdBps: progress ? 6000 : null,
      maxRateMilli: progress ? 1400 : null, fractionRule: 'EXACT_MILLISECONDS',
      closeMeaning: 'EXPLICIT_SYNTHETIC_FINISH_ACK', progressMeaning: progress ? 'APPROVED_SYNTHETIC_PROGRESS' : null,
    },
    history: dates.map((date, index) => ({
      sourceRecordRef: 'synthetic-record-' + index, lectureRef: 'synthetic-lecture-' + index,
      date, closedAt: date + 'T12:00:00+09:00', activityType: 'VIDEO',
      eligibleActivity: true, delivery: 'STREAMING', recordStatus: 'PRESENT',
      effectiveMs: progress ? null : '27000', durationMs: '30000',
      mediaCoveredMs: '30000', lastPositionMs: '30000',
      providerProgressBps: progress ? 6000 : null, speedCompliance: progress ? 'COMPLIANT' : 'NOT_REQUIRED_BY_SYNTHETIC_RULE',
      maxObservedRateMilli: progress ? 1400 : null, normalCloseAcknowledged: true,
    })),
    expected: { learningStatus: 'PASS', creditedDays: days, missingDates: [], heldDates: [], reason: 'COMPLETE_SYNTHETIC_HISTORY' },
  };
}

const cases = [];
function add(id, kind, change = () => {}) {
  const value = baseline(kind); value.id = id; change(value); cases.push(value);
}
function expected(value, status, reason, count = null) {
  value.expected = { learningStatus: status, creditedDays: count, missingDates: [], heldDates: [], reason };
}

add('time-90-days-exact-threshold', 'TIME');
add('time-below-threshold', 'TIME', v => {
  v.history[0].effectiveMs = '26999'; expected(v, 'NOT_MET', 'TIME_BELOW_SYNTHETIC_THRESHOLD', 89);
  v.expected.missingDates = [start];
});
add('time-full-media-double-speed', 'TIME', v => {
  v.history[0].effectiveMs = '14981'; expected(v, 'NOT_MET', 'MEDIA_COVERAGE_IS_NOT_EFFECTIVE_TIME', 89);
  v.expected.missingDates = [start];
});
add('time-paused-wall-time-not-added', 'TIME', v => {
  v.history[0].effectiveMs = '20000'; v.history[0].pausedWallMs = '10000';
  expected(v, 'NOT_MET', 'PAUSE_IS_NOT_EFFECTIVE_TIME', 89); v.expected.missingDates = [start];
});
add('time-seek-position-is-not-time', 'TIME', v => {
  v.history[0].effectiveMs = '5085'; expected(v, 'NOT_MET', 'POSITION_IS_NOT_EFFECTIVE_TIME', 89);
  v.expected.missingDates = [start];
});
add('time-missing-finish-ack', 'TIME', v => {
  v.history[0].normalCloseAcknowledged = false; v.history[0].closedAt = null;
  expected(v, 'NOT_MET', 'NO_CONFIRMED_FINISH', 89); v.expected.missingDates = [start];
});
add('time-finish-unknown', 'TIME', v => {
  v.history[0].normalCloseAcknowledged = null; v.history[0].closedAt = null;
  expected(v, 'ON_HOLD', 'FINISH_UNKNOWN'); v.expected.heldDates = [start];
});
add('time-explicit-no-record', 'TIME', v => {
  v.history[0] = { date: start, lectureRef: 'synthetic-lecture-0', recordStatus: 'NO_RECORD' };
  expected(v, 'NOT_MET', 'CONFIRMED_NO_RECORD', 89); v.expected.missingDates = [start];
});
add('time-unavailable-not-absence', 'TIME', v => {
  v.history[0] = { date: start, lectureRef: 'synthetic-lecture-0', recordStatus: 'UNAVAILABLE' };
  expected(v, 'ON_HOLD', 'RECORD_UNAVAILABLE'); v.expected.heldDates = [start];
});
add('time-future-days-in-progress', 'TIME', v => {
  v.asOf = '2026-10-15T13:00:00+09:00'; v.history = v.history.slice(0, 2);
  expected(v, 'IN_PROGRESS', 'FUTURE_DATES_NOT_ABSENCES', 2);
});
add('time-today-unfinished-before-cutoff', 'TIME', v => {
  v.asOf = '2026-10-14T09:00:00+09:00'; v.history = [];
  expected(v, 'IN_PROGRESS', 'OPEN_DAY_NOT_ABSENCE', 0);
});
add('time-unknown-past-and-future', 'TIME', v => {
  v.asOf = '2026-10-15T13:00:00+09:00'; v.history = v.history.slice(0, 2);
  v.history[0].recordStatus = 'UNAVAILABLE';
  expected(v, 'ON_HOLD', 'UNKNOWN_PAST_NOT_HIDDEN_BY_FUTURE_DAYS'); v.expected.heldDates = [start];
});
add('time-identical-response-retry', 'TIME', v => {
  v.history.push(structuredClone(v.history[0])); v.expected.reason = 'IDENTICAL_RECORD_IS_NOT_NEW_CREDIT';
});
add('time-conflicting-response-retry', 'TIME', v => {
  v.history.push({ ...v.history[0], effectiveMs: '1' }); expected(v, 'ON_HOLD', 'SAME_RECORD_CONFLICT');
});
add('time-same-lecture-next-day', 'TIME', v => {
  v.history[1].lectureRef = v.history[0].lectureRef;
  expected(v, 'NOT_MET', 'LECTURE_ALREADY_USED', 89); v.expected.missingDates = [v.history[1].date];
});
add('time-two-lectures-same-day', 'TIME', v => {
  v.history.push({ ...v.history[0], sourceRecordRef: 'synthetic-extra-record', lectureRef: 'synthetic-extra-lecture' });
  v.expected.reason = 'ONE_CALENDAR_DAY_NOT_TWO';
});
add('time-last-finish-at-end-exclusive', 'TIME', v => {
  const last = v.history.at(-1); const missing = last.date;
  last.closedAt = '2027-01-12T00:00:00+09:00'; last.date = '2027-01-12';
  expected(v, 'NOT_MET', 'END_EXCLUSIVE', 89); v.expected.missingDates = [missing];
});
add('time-credit-date-vs-close-mismatch', 'TIME', v => {
  v.history[0].closedAt = '2026-10-15T00:00:00+09:00';
  expected(v, 'ON_HOLD', 'SOURCE_DATE_AND_APPROVED_CLOSE_RULE_DISAGREE');
});
add('time-excluded-benefit-lecture', 'TIME', v => {
  v.history[0].eligibleActivity = false; expected(v, 'NOT_MET', 'EXCLUDED_ACTIVITY', 89);
  v.expected.missingDates = [start];
});
add('time-download-excluded', 'TIME', v => {
  v.history[0].delivery = 'DOWNLOAD'; expected(v, 'NOT_MET', 'DOWNLOAD_NOT_ELIGIBLE', 89);
  v.expected.missingDates = [start];
});
add('time-local-api-shaped-short-history', 'TIME', v => {
  v.history = v.history.slice(0, 1); v.history[0].effectiveMs = '29973';
  v.source.complete = 'UNKNOWN'; v.source.currentRevision = null; v.source.pageChain = 'UNKNOWN';
  v.source.snapshotConsistency = 'UNKNOWN'; expected(v, 'ON_HOLD', 'SHORT_RECORD_NO_FULL_HISTORY_REVISION');
});
add('progress-100-days-exact-60-percent', 'PROGRESS');
add('progress-below-60-percent', 'PROGRESS', v => {
  v.history[0].providerProgressBps = 5999; expected(v, 'NOT_MET', 'PROGRESS_BELOW_SYNTHETIC_THRESHOLD', 99);
  v.expected.missingDates = [start];
});
add('progress-media-coverage-is-not-official-progress', 'PROGRESS', v => {
  v.history[0].providerProgressBps = null;
  expected(v, 'ON_HOLD', 'PROGRESS_UNAVAILABLE'); v.expected.heldDates = [start];
});
add('progress-meaning-unknown', 'PROGRESS', v => {
  v.assumptions.progressMeaning = null; expected(v, 'ON_HOLD', 'PROGRESS_MEANING_UNCONFIRMED');
});
add('progress-rate-over-1-point-4', 'PROGRESS', v => {
  v.history[0].maxObservedRateMilli = 1401; v.history[0].speedCompliance = 'NON_COMPLIANT';
  expected(v, 'NOT_MET', 'SYNTHETIC_STRICT_SPEED_EXCEEDED', 99); v.expected.missingDates = [start];
});
add('progress-mixed-rate-non-compliant', 'PROGRESS', v => {
  v.history[0].ratesForTest = [1000, 1400, 2000, 1000];
  v.history[0].maxObservedRateMilli = 2000; v.history[0].speedCompliance = 'NON_COMPLIANT';
  expected(v, 'NOT_MET', 'SYNTHETIC_STRICT_SPEED_EXCEEDED', 99); v.expected.missingDates = [start];
});
add('progress-speed-unknown', 'PROGRESS', v => {
  v.history[0].maxObservedRateMilli = null; v.history[0].speedCompliance = 'UNKNOWN';
  expected(v, 'ON_HOLD', 'SPEED_COMPLIANCE_UNAVAILABLE'); v.expected.heldDates = [start];
});
add('progress-approved-ot-inventory', 'PROGRESS', v => {
  v.history[0].activityType = 'OT'; v.expected.reason = 'OT_ALLOWED_BY_SYNTHETIC_INVENTORY';
});
add('score-route-learning-not-required', 'PROGRESS', v => {
  v.selectedRoute = 'SCORE'; v.history = []; v.source.complete = 'UNKNOWN';
  expected(v, 'NOT_REQUIRED', 'LEARNING_NOT_ON_SELECTED_ROUTE');
});
for (const field of ['subject', 'institution', 'course', 'policy', 'inventory']) {
  add('source-' + field + '-mismatch', 'TIME', v => {
    v.source[field] = 'MISMATCH'; expected(v, 'ON_HOLD', 'BINDING_' + field.toUpperCase() + '_MISMATCH');
  });
}
add('source-current-revision-changed', 'TIME', v => {
  v.source.currentRevision = 'r2'; expected(v, 'ON_HOLD', 'SOURCE_REVISION_CHANGED');
});
add('source-same-revision-content-changed', 'TIME', v => {
  v.source.sameRevisionContent = 'CHANGED'; expected(v, 'ON_HOLD', 'SOURCE_REVISION_CONFLICT');
});
add('source-correction-not-confirmed', 'TIME', v => {
  v.source.correction = 'PENDING'; expected(v, 'ON_HOLD', 'CORRECTION_UNCONFIRMED');
});
add('source-partial-page-chain', 'TIME', v => {
  v.source.pageChain = 'MISSING_PAGE'; expected(v, 'ON_HOLD', 'PAGE_CHAIN_INCOMPLETE');
});
add('source-hidden-activity', 'TIME', v => {
  v.source.complete = 'UNKNOWN'; v.history = v.history.slice(1);
  expected(v, 'ON_HOLD', 'VISIBILITY_IS_NOT_ABSENCE');
});
add('learning-pass-mock-test-still-missing', 'TIME', v => {
  v.nonLearningEvidenceForTest = { mockTest: 'MISSING', review: 'UNKNOWN' };
  v.expected.reason = 'LEARNING_PASS_IS_NOT_FULL_ELIGIBILITY';
});
// Same source facts, distinct synthetic policies: thresholds belong to policy,
// not to a branded collector or the fixture history. No missing fact is filled.
add('same-facts-threshold-85', 'TIME', v => {
  v.history[0].effectiveMs = '26000'; v.assumptions.timeThresholdBps = 8500;
  v.expected.reason = 'SAME_FACTS_DIFFERENT_SYNTHETIC_POLICY';
});
add('same-facts-threshold-90', 'TIME', v => {
  v.history[0].effectiveMs = '26000';
  expected(v, 'NOT_MET', 'SAME_FACTS_DIFFERENT_SYNTHETIC_POLICY', 89); v.expected.missingDates = [start];
});
add('third-profile-seven-days-70-percent', 'TIME', v => {
  v.periodDays = 7; v.history = v.history.slice(0, 7); v.assumptions.timeThresholdBps = 7000;
  v.asOf = '2026-10-21T00:05:00+09:00';
  expected(v, 'PASS', 'OTHER_FINITE_RULE_PROFILE_NOT_BRAND_BRANCH', 7);
});
add('low-threshold-does-not-invent-progress', 'PROGRESS', v => {
  v.assumptions.progressThresholdBps = 1000; v.history[0].providerProgressBps = null;
  expected(v, 'ON_HOLD', 'POLICY_CANNOT_INVENT_SOURCE_FACTS'); v.expected.heldDates = [start];
});

export const evaluationCases = cases;
export const clockCases = [
  { instant: '2026-10-14T14:59:59.999Z', expectedKstDate: '2026-10-14' },
  { instant: '2026-10-14T15:00:00.000Z', expectedKstDate: '2026-10-15' },
  { instant: '2026-10-14T15:00:00.001Z', expectedKstDate: '2026-10-15' },
];
