// Offline example consistency checks, NOT a policy evaluator, verifier or API implementation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { checkBenefits } from './benefits-check.mjs';
import { schema, commandNames, readCommands } from './schema.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const fail = (code, path) => { const error = new Error(`${code}: ${path}`); error.code = code; throw error; };
const ensure = (condition, code, path) => { if (!condition) fail(code, path); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const policyHash = v => '0x' + createHash('sha256').update('CLEAR-M0-POLICY\n' + canonical({
  body: v.body, policyVersion: v.policyVersion, compilerVersion: v.compilerVersion,
})).digest('hex');

// Refuse unknown schema keywords instead of silently treating them as validated.
const keywords = new Set(['type', 'enum', 'const', '$ref', 'anyOf', 'properties', 'required',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum']);
function inspectSchema(s) {
  for (const key of Object.keys(s)) ensure(keywords.has(key), 'SCHEMA_KEYWORD', key);
  if (s.$ref) ensure(schema.$defs[s.$ref.replace('#/$defs/', '')], 'SCHEMA_REF', s.$ref);
  for (const child of Object.values(s.properties ?? {})) inspectSchema(child);
  for (const child of s.anyOf ?? []) inspectSchema(child);
  if (s.items) inspectSchema(s.items);
}
function shape(value, s, path = '$') {
  if (s.$ref) return shape(value, schema.$defs[s.$ref.replace('#/$defs/', '')], path);
  if (s.anyOf) {
    for (const option of s.anyOf) { try { shape(value, option, path); return; } catch (error) { if (error.code !== 'SCHEMA') throw error; } }
    fail('SCHEMA', path);
  }
  if ('const' in s) ensure(equal(value, s.const), 'SCHEMA', path);
  if (s.enum) ensure(s.enum.some(v => equal(value, v)), 'SCHEMA', path);
  if (s.type) {
    const matches = s.type === 'null' ? value === null : s.type === 'array' ? Array.isArray(value)
      : s.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : s.type === 'integer' ? Number.isSafeInteger(value) : s.type === 'number' ? Number.isFinite(value)
      : typeof value === s.type;
    ensure(matches, 'SCHEMA', path);
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    ensure(length >= (s.minLength ?? 0) && length <= (s.maxLength ?? Infinity), 'SCHEMA', path);
    if (s.pattern) ensure(new RegExp(s.pattern, 'u').test(value), 'SCHEMA', path);
  }
  if (typeof value === 'number') ensure(value >= (s.minimum ?? -Infinity) && value <= (s.maximum ?? Infinity), 'SCHEMA', path);
  if (Array.isArray(value)) {
    ensure(value.length >= (s.minItems ?? 0) && value.length <= (s.maxItems ?? Infinity), 'SCHEMA', path);
    value.forEach((v, i) => shape(v, s.items, `${path}[${i}]`));
  }
  if (s.properties) {
    for (const key of s.required) ensure(Object.hasOwn(value, key), 'SCHEMA', `${path}.${key}`);
    for (const key of Object.keys(value)) {
      ensure(Object.hasOwn(s.properties, key), 'SCHEMA', `${path}.${key}`);
      shape(value[key], s.properties[key], `${path}.${key}`);
    }
  }
}
const byId = new Map(fixtures.objects.map(o => [o.id, o]));
ensure(byId.size === fixtures.objects.length, 'DUPLICATE', 'object IDs');
const valueOf = id => { ensure(byId.has(id), 'REFERENCES', id); return byId.get(id).value; };
const approved = valueOf('approved-mock');
const application = valueOf('application');
const bindingKeys = ['applicationId', 'policyHash', 'policyVersion', 'subjectBindingId', 'bindingRevision', 'recipientRef', 'instanceId'];
const unique = (items, path) => ensure(new Set(items).size === items.length, 'REFERENCES', path);
const bound = (value, reference = application) => {
  for (const key of bindingKeys) ensure(value[key] === reference[key], 'BINDING', key);
};
function bodyCheck(b) {
  const rules = new Map(b.rules.map(r => [r.ruleId, r]));
  const requirements = new Map(b.requirements.map(r => [r.requirementId, r]));
  const routes = new Set(b.anyRoutes.map(r => r.routeId));
  const questions = new Set(b.questions.map(q => q.questionId));
  unique(b.rules.map(r => r.ruleId), 'rules'); unique(b.requirements.map(r => r.requirementId), 'requirements');
  unique(b.anyRoutes.map(r => r.routeId), 'routes'); unique(b.questions.map(q => q.questionId), 'questions');
  unique(b.sourceIds, 'sources'); unique(b.commonRuleIds, 'common rules');
  for (const source of b.sourceIds) ensure(fixtures.objects.some(o => o.type === 'Source' && o.value.sourceId === source), 'REFERENCES', source);
  for (const id of [...b.commonRuleIds, ...b.anyRoutes.flatMap(r => r.allRuleIds)]) ensure(rules.has(id), 'REFERENCES', id);
  for (const route of b.anyRoutes) unique([...b.commonRuleIds, ...route.allRuleIds], route.routeId);
  for (const rule of b.rules) {
    ensure(requirements.has(rule.requirementId), 'REFERENCES', rule.ruleId);
    for (const source of rule.sourceIds) ensure(b.sourceIds.includes(source), 'REFERENCES', source);
    const daily = ['DAILY_TIME', 'DAILY_PROGRESS'].includes(rule.predicate);
    const score = ['EXAM_GTE', 'HISTORY_NO_HIGH_SCORE'].includes(rule.predicate);
    ensure(rule.unit === (daily ? 'BPS' : score ? 'SCORE' : 'BOOLEAN'), 'RULE', rule.ruleId);
    ensure(daily ? rule.days !== null && rule.threshold !== null : rule.days === null, 'RULE', rule.ruleId);
    ensure(score ? rule.threshold !== null && rule.threshold <= 990 : daily || rule.threshold === null, 'RULE', rule.ruleId);
    const expectedKind = { EXAM_GTE: 'EXAM', DAILY_TIME: 'LEARNING', DAILY_PROGRESS: 'LEARNING', COMPLETED: 'MOCK_TEST', REVIEW_ACCEPTED: 'REVIEW', HISTORY_NO_HIGH_SCORE: 'DOCUMENT' };
    ensure(requirements.get(rule.requirementId).kind === expectedKind[rule.predicate], 'RULE', rule.ruleId);
    for (const route of b.anyRoutes.filter(r => b.commonRuleIds.includes(rule.ruleId) || r.allRuleIds.includes(rule.ruleId)))
      ensure(requirements.get(rule.requirementId).routeIds.includes(route.routeId), 'REFERENCES', rule.ruleId);
  }
  for (const req of b.requirements) {
    for (const id of req.routeIds) ensure(routes.has(id), 'REFERENCES', id);
    for (const id of req.questionIds) ensure(questions.has(id), 'REFERENCES', id);
    for (const id of req.sourceIds) ensure(b.sourceIds.includes(id), 'REFERENCES', id);
    if (req.period) ensure(req.period.from < req.period.until, 'PERIOD', req.requirementId);
  }
  for (const q of b.questions) {
    for (const id of q.routeIds) ensure(routes.has(id), 'REFERENCES', id);
    ensure((q.status === 'OPEN') === (q.resolution === null), 'QUESTION', q.questionId);
  }
  if (b.deadlines) {
    const d = b.deadlines;
    ensure(d.evidenceUntil <= d.supplementUntil && d.supplementUntil <= d.finalizeUntil
      && d.finalizeUntil <= d.allocationUntil && d.allocationUntil + d.minClaimWindowSeconds <= d.claimUntil, 'DEADLINES', b.policyId);
  }
}
function check({type, value: v}) {
  ensure(schema.$defs[type], 'TYPE', type); shape(v, schema.$defs[type]);
  if (type === 'Source') ensure((v.normalizedHash === null) === (v.normalizerVersion === null), 'SOURCE', v.sourceId);
  if (type === 'PolicyDraft' || type === 'ApprovedPolicy') bodyCheck(v.body);
  if (type === 'PolicyDraft' && v.state === 'REVIEWED') ensure(v.reviewerRef !== null && v.body.amount !== null
    && v.body.deadlines !== null && v.body.questions.every(q => q.status !== 'OPEN'), 'APPROVAL', v.draftId);
  if (type === 'SubjectBinding') {
    ensure(v.applicationId === application.applicationId && v.subjectBindingId === application.subjectBindingId
      && v.bindingRevision === application.bindingRevision, 'BINDING', v.subjectBindingId);
    ensure(v.state !== 'VERIFIED' || (v.verifiedAt !== null && v.verifiedAt < v.expiresAt), 'BINDING', v.subjectBindingId);
  }
  if (type === 'ApprovedPolicy') {
    ensure(v.body.amount !== null && BigInt(v.body.amount.netAtoms) > 0n && v.body.deadlines !== null
      && v.body.questions.every(q => q.status === 'RESOLVED_SYNTHETIC')
      && v.body.requirements.every(r => r.support === 'SYNTHETIC_ONLY' && (r.coverage !== 'COMPLETE_PERIOD' || r.period !== null)), 'PUBLICATION', v.policyVersion);
    ensure(v.policyHash === policyHash(v), 'POLICY_HASH', v.policyVersion);
    const draft = valueOf('draft-reviewed');
    ensure(v.draftId === draft.draftId && v.draftRevision === draft.revision && v.approvedBy === draft.reviewerRef && canonical(v.body) === canonical(draft.body), 'APPROVAL', v.draftId);
  }
  if (['Application', 'Evidence', 'Eligibility', 'Funding', 'Claim'].includes(type)) bound(v);
  if (type === 'Application') {
    ensure(v.state !== 'AGREED' || v.consentRef !== null, 'CONSENT', v.applicationId);
    ensure(v.policyHash === approved.policyHash && v.policyVersion === approved.policyVersion, 'BINDING', v.policyHash);
  }
  if (type === 'Evidence') {
    const req = approved.body.requirements.find(r => r.requirementId === v.requirementId);
    ensure(req && req.kind === v.kind && req.coverage === v.coverage && req.sourceIds.includes(v.sourceId)
      && req.sourceTrustProfile === v.sourceTrustProfile && equal(req.period, v.coveredPeriod), 'REFERENCES', v.evidenceId);
    ensure(v.observedAt <= v.validUntil, 'FRESHNESS', v.evidenceId);
  }
  if (type === 'Eligibility') {
    unique(v.ruleResults.map(r => r.ruleId), 'rule results'); unique(v.evidenceRefs.map(r => r.evidenceId), 'evidence refs');
    const evidence = v.evidenceRefs.map(ref => {
      const e = fixtures.objects.find(o => o.type === 'Evidence' && o.value.evidenceId === ref.evidenceId)?.value;
      ensure(e && e.revision === ref.revision, 'REFERENCES', ref.evidenceId); bound(e, v); return e;
    });
    if (v.status === 'ELIGIBLE' && v.finality === 'FINAL') {
      const route = approved.body.anyRoutes.find(r => r.routeId === v.selectedRouteId);
      ensure(route && v.amountAtoms === approved.body.amount.netAtoms && v.evaluatedAt === approved.body.deadlines.finalizeUntil, 'ELIGIBILITY', v.decisionId);
      for (const id of [...approved.body.commonRuleIds, ...route.allRuleIds]) {
        const result = v.ruleResults.find(r => r.ruleId === id);
        ensure(result?.status === 'MET' && result.evidenceIds.length > 0, 'ELIGIBILITY', id);
        const requirement = approved.body.rules.find(r => r.ruleId === id).requirementId;
        for (const eid of result.evidenceIds) {
          const e = evidence.find(e => e.evidenceId === eid);
          ensure(e && e.requirementId === requirement && e.authenticity === 'VERIFIED' && e.subject === 'VERIFIED'
            && (e.coverage !== 'COMPLETE_PERIOD' || e.completeness === 'VERIFIED'), 'ELIGIBILITY', id);
          ensure(e.observedAt <= v.evaluatedAt && v.evaluatedAt <= e.validUntil
            && v.evaluatedAt - e.observedAt <= approved.body.requirements.find(r => r.requirementId === requirement).maxAgeSeconds, 'FRESHNESS', id);
        }
      }
    }
  }
  if (type === 'Funding') {
    ensure(v.refundRecipientRef === 'sponsor-demo-1', 'BINDING', 'refund recipient');
    const [balance, reserved, paid, returned, deposited, amount] = ['balanceAtoms', 'reservedAtoms', 'paidAtoms', 'returnedAtoms', 'totalDepositedAtoms', 'entitlementAtoms'].map(k => BigInt(v[k]));
    ensure(balance + paid + returned === deposited && (reserved === 0n || reserved === amount) && reserved <= balance
      && (paid === 0n || paid === amount) && amount === BigInt(approved.body.amount.netAtoms), 'ACCOUNTING', v.status);
    if (v.status === 'ALLOCATED') ensure(reserved === amount && v.allocationId !== null && v.decisionId === 'decision-1' && paid === 0n, 'ACCOUNTING', v.status);
    else ensure(reserved === 0n, 'ACCOUNTING', v.status);
    if (v.status === 'UNFUNDED') ensure(balance === 0n && deposited === 0n, 'ACCOUNTING', v.status);
    if (v.status === 'PARTIAL') ensure(balance > 0n && balance < amount, 'ACCOUNTING', v.status);
    if (v.status === 'FUNDED') ensure(balance >= amount, 'ACCOUNTING', v.status);
    if (v.status === 'PAID') ensure(paid === amount, 'ACCOUNTING', v.status);
    else ensure(paid === 0n, 'ACCOUNTING', v.status);
    if (['UNFUNDED', 'PARTIAL', 'FUNDED', 'CANCELLED', 'EXPIRED'].includes(v.status))
      ensure(v.allocationId === null && v.decisionId === null, 'ACCOUNTING', v.status);
    if (v.status === 'PAID') ensure(v.allocationId !== null && v.decisionId !== null, 'ACCOUNTING', v.status);
    if (v.status === 'RECLAIMED') {
      ensure(returned === deposited && balance === 0n, 'ACCOUNTING', v.status);
      if (v.allocationId !== null) ensure(v.releaseReason === 'CLAIM_EXPIRED' && v.observedAt > approved.body.deadlines.claimUntil, 'ACCOUNTING', v.status);
      else ensure(v.releaseReason === 'STUDENT_CANCELLED' || (v.releaseReason === 'ALLOCATION_EXPIRED' && v.observedAt > approved.body.deadlines.allocationUntil), 'ACCOUNTING', v.status);
    }
    if (v.status === 'PAID' && returned > 0n) ensure(v.releaseReason === 'ALLOCATION_EXPIRED' && v.observedAt > approved.body.deadlines.allocationUntil, 'ACCOUNTING', v.status);
    else if (!['CANCELLED', 'EXPIRED', 'RECLAIMED'].includes(v.status)) ensure(v.releaseReason === 'NONE', 'ACCOUNTING', v.status);
  }
  if (type === 'Claim') ensure(v.amountAtoms === approved.body.amount.netAtoms && v.canSimulateClaim === (v.state === 'CLAIMABLE') && (v.state === 'NOT_CLAIMABLE' || v.allocationId !== null), 'CLAIM_STATE', v.state);
  if (type === 'DocumentSubmission') {
    ensure(v.retentionUntil > v.submittedAt && v.retentionUntil <= v.submittedAt + 86400, 'RETENTION', v.submissionId);
    bound(v, valueOf('vision-readable-held'));
  }
  if (type === 'DocumentPrecheck') {
    bound(v, valueOf('document'));
    for (const o of v.observations) {
      ensure(o.readStatus === 'READABLE' ? o.value !== null && o.page !== null && o.bbox !== null : o.value === null, 'OBSERVATION', o.fieldId);
      if (o.bbox) ensure(o.bbox[0] < o.bbox[2] && o.bbox[1] < o.bbox[3], 'OBSERVATION', o.fieldId);
    }
    unique(v.observations.map(o => o.fieldId), 'observation fields');
    if (v.outcome === 'PRECHECK_REQUIREMENTS_MET') {
      const requirement = valueOf('siwon-questions').body.requirements.find(r => r.requirementId === v.requirementId);
      ensure(requirement && requirement.requiredFields.every(field => v.observations.some(o => o.fieldId === field && o.readStatus === 'READABLE')), 'OBSERVATION', v.requirementId);
    }
    ensure(v.current || v.reasons.includes('STALE_RESULT'), 'JOB', v.jobId);
    if (v.jobState !== 'SUCCEEDED') ensure(v.outcome === 'UNDETERMINED', 'JOB', v.jobId);
  }
  if (type === 'ModelRun') {
    const precheck = valueOf('vision-readable-held');
    for (const k of ['aiRunId', 'jobId', 'inputHash', 'modelInputHash', 'transformVersion']) ensure(v[k] === precheck[k], 'MODEL_BINDING', k);
  }
  if (commandNames.includes(type)) {
    const read = readCommands.includes(type);
    ensure(read ? v.idempotencyKey === null && v.expectedRevision === null
      : v.idempotencyKey !== null && (['CreateDraft', 'CreateApplication'].includes(type) ? v.expectedRevision === null : v.expectedRevision !== null), 'COMMAND', type);
  }
  if (type === 'MockReply') {
    ensure(['REJECTED', 'UNKNOWN'].includes(v.state) ? v.fault !== null && v.fault.outcome === v.state : v.fault === null, 'REPLY', v.requestId);
    ensure(v.state !== 'UNKNOWN' || (v.operationId !== null && v.fault.operationId === v.operationId), 'REPLY', v.requestId);
    ensure(!v.complete || v.nextCursor === null, 'REPLY', v.requestId);
    for (const id of v.viewIds) valueOf(id);
  }
}
for (const definition of Object.values(schema.$defs)) inspectSchema(definition);
for (const object of fixtures.objects) check(object);
for (const exchange of fixtures.exchanges) {
  const command = valueOf(exchange.command), reply = valueOf(exchange.reply);
  ensure(commandNames.includes(command.name) && command.requestId === reply.requestId, 'EXCHANGE', exchange.command);
}
ensure(commandNames.every(name => fixtures.exchanges.some(x => valueOf(x.command).name === name)), 'EXCHANGE', 'coverage');
for (const scenario of fixtures.scenarios) {
  scenario.states.forEach(valueOf);
  if (scenario.decision) valueOf(scenario.decision);
  if (scenario.claim) valueOf(scenario.claim);
  if (scenario.states.some(id => id === 'funding-allocated')) ensure(valueOf(scenario.decision).finality === 'FINAL' && valueOf(scenario.decision).status === 'ELIGIBLE', 'SCENARIO', scenario.id);
  if (scenario.claim === 'claim-claimable') ensure(scenario.states.includes('funding-allocated'), 'SCENARIO', scenario.id);
}
for (const test of fixtures.rejectCases) {
  const sample = structuredClone(byId.get(test.base));
  let target = sample.value;
  for (const key of test.path.slice(0, -1)) target = target[key];
  target[test.path.at(-1)] = test.value;
  assert.throws(() => check(sample), error => error.code === test.error, test.id);
}
checkBenefits({ schema, shape, canonical, ensure, source: valueOf('siwon-snapshot') });
console.log(`M0 fixture consistency PASS: ${fixtures.objects.length} objects, ${fixtures.exchanges.length} exchanges, ${fixtures.scenarios.length} scenarios, ${fixtures.rejectCases.length} rejected mutations.`);
console.log('Scope: public SYNTHETIC examples only; no production execution, source proof, AI, funding or product authorization.');
