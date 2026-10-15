import { requireMvpPolicy } from '../../policy/mvp/compiler.mjs';
import { validateContract, digest, same } from '../../policy/mvp/contract.mjs';
import { validateLearningFactsShape } from '../../policy/mvp/learning-contract.mjs';
import { freeze, requireRule as check, RuleError } from '../../policy/values.mjs';

export const DAILY_VERSION = 'clear-moodle-daily.1';
export const factsDigest = facts => digest('CLEAR-MOODLE-FACTS', {
  ...facts, snapshot: { ...facts.snapshot, normalizedDigest: null },
});
export const pageDigest = records => digest('CLEAR-MOODLE-PAGE', records);
const seconds = value => {
  const n = BigInt(value);
  check(n <= 4102444800n, 'LEARNING_TIME_RANGE'); return Number(n);
};
const kstDay = ms => new Date(Number(ms) + 9 * 3600000).toISOString().slice(0, 10);
const msValue = value => {
  check(value !== null, 'LEARNING_VALUE_UNKNOWN');
  const n = BigInt(value); check(n <= 4102444800000n, 'LEARNING_TIME_RANGE'); return n;
};

// The synthetic source/export verifier, not a participant or response, supplies
// trusted pins. This pure function never accepts live evidence or issues grants.
export function assessMvpDailyLearning(compiled, ruleId, trusted, input, now) {
  const p = requireMvpPolicy(compiled);
  const rule = p.rules.find(r => r.ruleId === ruleId);
  check(rule && ['DAILY_TIME', 'DAILY_PROGRESS'].includes(rule.predicate), 'LEARNING_RULE_REQUIRED');
  validateContract('Binding', trusted.binding); validateContract('SourceBinding', trusted.sourceBinding);
  check(trusted.binding.policyHash === compiled.policyHash && trusted.binding.policyVersion === p.policyVersion
    && trusted.binding.productId === p.productId && trusted.binding.cohortId === p.cohortId, 'LEARNING_TRUSTED_POLICY');
  check(Number.isSafeInteger(now) && now >= 0 && now <= 4102444800, 'LEARNING_CLOCK');
  const l = p.learningRules.find(l => l.requirementId === rule.requirementId);
  const req = p.requirements.find(r => r.requirementId === rule.requirementId);
  const period = req.period;
  const base = { evaluatorVersion: DAILY_VERSION, policyHash: compiled.policyHash, ruleHash: compiled.ruleHashes[ruleId],
    mode: 'SYNTHETIC', productConnected: false, humanAttentionProven: false, paymentAllowed: false };
  const result = (status, reason, creditedDates = [], missingDates = [], minBps = null) => {
    const observation = { ruleId, ruleHash: compiled.ruleHashes[ruleId],
      status: status === 'ON_HOLD' ? 'UNKNOWN' : status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'OBSERVED',
      unit: 'BPS', value: ['ON_HOLD', 'IN_PROGRESS'].includes(status) ? null : minBps ?? 0,
      days: ['ON_HOLD', 'IN_PROGRESS'].includes(status) ? null : creditedDates.length };
    validateContract('RuleObservation', observation);
    return freeze({ ...base, learningStatus: status, reason, observation, creditedDates, missingDates });
  };
  try {
    validateLearningFactsShape(input);
    const f = input, s = f.snapshot, b = f.binding, sb = trusted.sourceBinding, cap = f.inventory.capabilities;
    check(f.dataMode === 'SYNTHETIC' && f.trust.assurance === 'SYNTHETIC_TEST_PIN', 'LEARNING_LIVE_BLOCKED');
    check(same(b, trusted.rawBinding) && b.applicationId === trusted.binding.applicationId
      && b.subjectRef === trusted.binding.subjectRef && b.policyHash === compiled.policyHash
      && b.policyVersion === p.policyVersion && b.cohortId === p.cohortId && b.timeZone === 'Asia/Seoul'
      && b.institutionId === sb.institutionId && b.providerInstanceId === sb.providerInstanceId
      && b.courseId === sb.courseId && b.accountBindingId === sb.accountBindingId
      && b.accountBindingVersion === sb.accountBindingVersion && b.bindingAssurance === 'SYNTHETIC_TEST_PIN', 'LEARNING_BINDING');
    check(trusted.verification?.authenticity === 'VERIFIED_SYNTHETIC'
      && trusted.verification.subject === 'VERIFIED_SYNTHETIC' && trusted.verification.semantics === 'VERIFIED_SYNTHETIC'
      && trusted.verification.completeness === 'COMPLETE_SYNTHETIC' && trusted.verification.correction === 'CURRENT', 'LEARNING_SOURCE_UNVERIFIED');
    check(same(f.inventory, trusted.inventory) && f.inventory.activitySetHash === l.activitySetHash
      && f.inventory.providerRuleVersion === l.metricRuleVersion, 'LEARNING_INVENTORY');
    check(l.metricRuleVersion === 'synthetic-metric.1' && l.dateAttributionRuleVersion === 'synthetic-finish-kst.1', 'LEARNING_SEMANTICS_UNSUPPORTED');
    check(cap.currentRevision && cap.atomicExport && cap.correctionHistory && cap.normalClose && cap.creditDay
      && (l.metric === 'EFFECTIVE_TIME_RATIO' ? cap.effectiveTime : cap.officialProgress && cap.speedCompliance), 'LEARNING_CAPABILITY_UNKNOWN');
    check(factsDigest(f) === trusted.factsHash && s.normalizedDigest === trusted.factsHash, 'LEARNING_FACTS_PIN');
    check(s.sourceRevision !== null && s.sourceRevision === trusted.sourceRevision && s.sourceCompleteness === 'COMPLETE'
      && (s.correctionState === 'UNCHANGED' || (s.correctionState === 'CORRECTED'
        && trusted.approvedCorrectionRevision === s.sourceRevision)), 'LEARNING_SOURCE_REVISION');
    check(seconds(s.periodStart) === period.from && seconds(s.periodEndExclusive) === period.until, 'LEARNING_PERIOD');
    const observed = seconds(s.observedAt);
    check(s.validUntil !== null && observed <= now && now <= seconds(s.validUntil)
      && now - observed <= req.maxAgeSeconds, 'LEARNING_STALE');
    check(s.coverageStart !== null && s.coverageEndExclusive !== null
      && seconds(s.coverageStart) <= period.from && seconds(s.coverageEndExclusive) >= Math.min(observed, period.until), 'LEARNING_COVERAGE');
    check(s.totalRows === f.records.length && s.pageManifest !== null, 'LEARNING_MANIFEST');
    const manifest = s.pageManifest; let offset = 0;
    check(manifest.pages.length > 0 && manifest.terminalPageId === manifest.pages.at(-1).pageId, 'LEARNING_PAGE_CHAIN');
    const pageIds = new Set();
    for (const page of manifest.pages) {
      check(!pageIds.has(page.pageId) && page.offset === offset && page.rowCount > 0
        && page.pageDigest === pageDigest(f.records.slice(offset, offset + page.rowCount)), 'LEARNING_PAGE_CHAIN');
      pageIds.add(page.pageId); offset += page.rowCount;
    }
    check(offset === f.records.length && manifest.manifestDigest === digest('CLEAR-MOODLE-MANIFEST', {
      sourceRevision: s.sourceRevision, totalRows: s.totalRows, terminalPageId: manifest.terminalPageId, pages: manifest.pages,
    }), 'LEARNING_MANIFEST');
    const mappings = new Map(trusted.activityMappings.map(m => [m.activityId, m]));
    check(mappings.size === trusted.activityMappings.length && mappings.size === l.allowedActivityIds.length
      && l.allowedActivityIds.every(id => mappings.has(id)), 'LEARNING_ACTIVITY_PIN');
    const records = new Map(), activities = new Set(), candidates = [];
    for (const row of f.records) {
      const mapping = mappings.get(row.activityId);
      check(mapping && row.lectureId === mapping.lectureId, 'LEARNING_ACTIVITY');
      activities.add(row.activityId);
      check(row.sourceRecordRef !== null && row.recordRevision === s.sourceRevision, 'LEARNING_RECORD_REVISION');
      if (row.supersedesRecordRef !== null) check(row.supersedesRecordRef !== row.sourceRecordRef
        && s.correctionState === 'CORRECTED' && trusted.approvedSupersessions?.some(x => x.sourceRecordRef === row.sourceRecordRef
          && x.supersedesRecordRef === row.supersedesRecordRef), 'LEARNING_CORRECTION_UNCONFIRMED');
      const previous = records.get(row.sourceRecordRef);
      check(!previous || same(previous, row), 'LEARNING_RECORD_CONFLICT');
      if (previous) continue;
      records.set(row.sourceRecordRef, row);
      check(!['UNKNOWN', 'UNAVAILABLE'].includes(row.sourceRecordStatus), 'LEARNING_RECORD_UNAVAILABLE');
      if (row.sourceRecordStatus === 'NO_RECORD') continue;
      check(row.sourcePolicyHash === mapping.sourcePolicyHash && row.durationMs === mapping.durationMs, 'LEARNING_MEDIA_RULE_PIN');
      check(row.deliveryMode !== 'UNKNOWN', 'LEARNING_DELIVERY_UNKNOWN');
      if (row.deliveryMode !== 'STREAMING') continue;
      check(row.normalCloseAcknowledged !== null, 'LEARNING_CLOSE_UNKNOWN');
      if (!row.normalCloseAcknowledged) continue;
      const closed = msValue(row.closedAtMs);
      check(closed <= BigInt(observed) * 1000n, 'LEARNING_FUTURE_RECORD');
      check(row.dateAttributionRuleVersion === l.dateAttributionRuleVersion, 'LEARNING_DATE_MEANING');
      const date = kstDay(closed);
      check(row.sourceCreditDay === null || row.sourceCreditDay === date, 'LEARNING_DATE_CONFLICT');
      // No rounding to seconds for threshold comparisons. Dates alone use KST.
      if (closed < BigInt(period.from) * 1000n || closed >= BigInt(period.until) * 1000n) continue;
      let bps;
      if (l.metric === 'EFFECTIVE_TIME_RATIO') {
        check(['SERVER_BOUNDED_CLIENT_TELEMETRY', 'PROVIDER_APPROVED_EFFECTIVE_TIME'].includes(row.effectiveTimeMeaning), 'LEARNING_TIME_MEANING');
        const duration = msValue(row.durationMs), effective = msValue(row.effectiveMs);
        check(duration > 0n, 'LEARNING_DURATION');
        bps = Number(effective * 10000n / duration); bps = Math.min(10000, bps);
      } else {
        check(row.providerProgressBps !== null && row.progressRuleVersion === l.metricRuleVersion, 'LEARNING_PROGRESS_UNKNOWN');
        bps = row.providerProgressBps;
      }
      if (l.speedPolicy === 'PROVIDER_COMPLIANT') {
        check(!['UNKNOWN', 'NOT_APPLICABLE'].includes(row.speedCompliance), 'LEARNING_SPEED_UNKNOWN');
        if (row.speedCompliance !== 'COMPLIANT') continue;
      }
      if (bps >= l.thresholdBps) candidates.push({ date, lectureId: row.lectureId, closed, bps, ref: row.sourceRecordRef });
    }
    check(l.allowedActivityIds.every(id => activities.has(id)), 'LEARNING_ACTIVITY_MISSING');
    check([...records.values()].every(r => r.supersedesRecordRef === null || !records.has(r.supersedesRecordRef)), 'LEARNING_SUPERSEDED_RECORD_PRESENT');
    candidates.sort((a, b) => a.closed < b.closed ? -1 : a.closed > b.closed ? 1 : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
    const lectures = new Set(), daily = new Map();
    for (const c of candidates) {
      if (lectures.has(c.lectureId)) continue;
      lectures.add(c.lectureId); daily.set(c.date, Math.max(daily.get(c.date) ?? 0, c.bps));
    }
    const credited = [...daily.keys()].sort(), missing = [];
    // This contract supports KST only. Calendar labels are formed with UTC
    // calendar operations after projecting the approved local start date.
    const date = new Date(period.from * 1000 + 9 * 3600000);
    let openDay = false;
    for (let i = 0; i < l.days; i++) {
      const label = date.toISOString().slice(0, 10), end = Date.parse(label + 'T00:00:00+09:00') / 1000 + 86400;
      if (!daily.has(label)) { if (now < end) openDay = true; else missing.push(label); }
      date.setUTCDate(date.getUTCDate() + 1);
    }
    const min = daily.size ? Math.min(...daily.values()) : 0;
    if (missing.length) return result('NOT_MET', 'LEARNING_CONFIRMED_MISSING_DATES', credited, missing, min);
    if (openDay || now < period.until) return result('IN_PROGRESS', 'LEARNING_PERIOD_OPEN', credited);
    return result(credited.length === l.days ? 'PASS' : 'NOT_MET', 'LEARNING_DAILY_SUMMARY', credited, missing, min);
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    return result('ON_HOLD', error.message);
  }
}
