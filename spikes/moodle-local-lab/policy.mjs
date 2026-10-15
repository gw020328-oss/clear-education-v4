import { exampleDraft } from '../../specs/m1/examples.mjs';
import { compileMvpPolicy } from '../../src/policy/mvp/compiler.mjs';
import { digest } from '../../src/policy/mvp/contract.mjs';

// Explicit local demo agreement, not an academy policy or a new brand branch.
export function localDemoPolicy(startDate) {
  const from = Date.parse(startDate + 'T00:00:00+09:00') / 1000;
  if (!Number.isSafeInteger(from) || from < 0) throw Error('LOCAL_DEMO_DATE');
  const p = exampleDraft('third'), period = { from, until: from + 86400, boundaries: '[from,until)', timeZone: 'Asia/Seoul' };
  p.productId = 'local-moodle-demo'; p.institutionId = 'synthetic-local-operator'; p.cohortId = 'local-api-lab';
  p.policyVersion = 'local-moodle-demo.1';
  p.sources = [{ ...p.sources[0], sourceId: 'local-demo-terms', institutionId: p.institutionId,
    productId: p.productId, cohortId: p.cohortId, capturedAt: from, rawHash: digest('CLEAR-LOCAL-DEMO-TERMS', { from, thresholdBps: 9000 }),
    locators: ['LOCAL-1 explicit synthetic agreement; not official academy terms'] }];
  for (const req of p.requirements) if (req.period) req.period = structuredClone(period);
  for (const rule of p.rules) {
    rule.sourceRefs = [{ sourceId: p.sources[0].sourceId, locator: p.sources[0].locators[0] }];
    if (rule.predicate === 'DAILY_TIME') { rule.threshold = 9000; rule.days = 1; }
  }
  const l = p.learningRules[0]; l.days = 1; l.thresholdBps = 9000;
  l.allowedActivityIds = ['normal', 'double', 'pause', 'unseen', 'ot'];
  l.activitySetHash = digest('CLEAR-MVP-ACTIVITIES', l.allowedActivityIds);
  l.metricRuleVersion = 'local-clearwatch-effective-ms.1'; l.dateAttributionRuleVersion = 'local-clearwatch-finish-kst.1';
  p.deadlines = { evidenceFrom: from, evidenceUntil: period.until, supplementUntil: period.until + 86400,
    finalizeUntil: period.until + 2 * 86400, allocationUntil: period.until + 3 * 86400,
    claimUntil: period.until + 10 * 86400, minClaimWindowSeconds: 7 * 86400 };
  return compileMvpPolicy(p, { sources: structuredClone(p.sources), capabilities: structuredClone(p.capabilities) });
}
