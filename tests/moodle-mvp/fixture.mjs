import example from '../../specs/m1/learning-example.json' with { type: 'json' };
import { compileExample, exampleBinding, exampleSourceBinding } from '../../specs/m1/examples.mjs';
import { digest } from '../../src/policy/mvp/contract.mjs';
import { factsDigest, pageDigest, assessMvpDailyLearning } from '../../src/learning-evidence/moodle-mvp/daily.mjs';

// The test resolver fixes these pins independently. repin is not a production
// API: a consumer must never recreate trusted factsHash from an untrusted reply.
export function repin(f) {
  const s = f.facts.snapshot, pages = [];
  for (let offset = 0; offset < f.facts.records.length; offset += 100) {
    const rows = f.facts.records.slice(offset, offset + 100);
    pages.push({ pageId: 'page-' + pages.length, offset, rowCount: rows.length, pageDigest: pageDigest(rows) });
  }
  s.totalRows = f.facts.records.length;
  s.pageManifest = { pages, terminalPageId: pages.at(-1)?.pageId ?? 'page-0', manifestDigest: null };
  s.pageManifest.manifestDigest = digest('CLEAR-MOODLE-MANIFEST', {
    sourceRevision: s.sourceRevision, totalRows: s.totalRows, terminalPageId: s.pageManifest.terminalPageId, pages,
  });
  s.normalizedDigest = factsDigest(f.facts); f.trusted.factsHash = s.normalizedDigest;
  return f;
}

export function dailyFixture(name = 'third', compiled = compileExample(name)) {
  const p = compiled.policy, l = p.learningRules[0], req = p.requirements.find(r => r.requirementId === l.requirementId);
  const binding = exampleBinding(compiled), sb = exampleSourceBinding(), facts = structuredClone(example);
  facts.binding = { institutionId: sb.institutionId, providerInstanceId: sb.providerInstanceId, courseId: sb.courseId,
    cohortId: p.cohortId, applicationId: binding.applicationId, learnerRef: 'synthetic-learner', subjectRef: binding.subjectRef,
    accountBindingId: sb.accountBindingId, accountBindingVersion: sb.accountBindingVersion,
    policyHash: compiled.policyHash, policyVersion: p.policyVersion, timeZone: 'Asia/Seoul', bindingAssurance: 'SYNTHETIC_TEST_PIN' };
  facts.inventory = { activitySetVersion: 'synthetic-activities.1', activitySetHash: l.activitySetHash,
    mappingVersion: 'synthetic-map.1', providerRuleVersion: l.metricRuleVersion,
    capabilities: { effectiveTime: true, mediaCoverage: true, normalClose: true, creditDay: true,
      officialProgress: true, speedCompliance: true, currentRevision: true, atomicExport: true, correctionHistory: true } };
  facts.records = l.allowedActivityIds.map((activityId, index) => {
    const row = structuredClone(example.records[0]);
    return { ...row, activityId, lectureId: 'lecture-' + (index + 1), sourceRecordRef: 'record-' + (index + 1),
      recordRevision: 'r1', sourcePolicyHash: 'aa'.repeat(32), sourceRecordStatus: 'PRESENT',
      effectiveMs: '27000', durationMs: '30000', providerProgressBps: 6000, progressRuleVersion: l.metricRuleVersion,
      speedCompliance: 'COMPLIANT', deliveryMode: 'STREAMING', closedAtMs: String((req.period.from + index * 86400 + 43200) * 1000),
      sourceCreditDay: new Date((req.period.from + index * 86400 + 43200) * 1000 + 9 * 3600000).toISOString().slice(0, 10),
      dateAttributionRuleVersion: l.dateAttributionRuleVersion };
  });
  const now = req.period.until + 60;
  Object.assign(facts.snapshot, { observedAt: String(now), validUntil: String(now + 300), periodStart: String(req.period.from),
    periodEndExclusive: String(req.period.until), coverageStart: String(req.period.from), coverageEndExclusive: String(req.period.until),
    sourceRevision: 'r1', sourceCompleteness: 'COMPLETE', correctionState: 'UNCHANGED' });
  facts.trust.limitations = ['SYNTHETIC_ONLY_NOT_SOURCE_OR_PAYMENT_VERIFICATION'];
  const trusted = { binding, sourceBinding: sb, rawBinding: structuredClone(facts.binding), inventory: structuredClone(facts.inventory),
    sourceRevision: 'r1', factsHash: null,
    verification: { authenticity: 'VERIFIED_SYNTHETIC', subject: 'VERIFIED_SYNTHETIC', semantics: 'VERIFIED_SYNTHETIC',
      completeness: 'COMPLETE_SYNTHETIC', correction: 'CURRENT' },
    activityMappings: facts.records.map(r => ({ activityId: r.activityId, lectureId: r.lectureId,
      sourcePolicyHash: r.sourcePolicyHash, durationMs: r.durationMs })) };
  const f = { compiled, facts, trusted, now };
  f.run = () => assessMvpDailyLearning(f.compiled, 'daily-learning', f.trusted, f.facts, f.now);
  return repin(f);
}
