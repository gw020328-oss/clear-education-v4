// Separate namespace from M0 fixtures and the v4 HTTP/DB/consent contracts.
export const CONTRACT_VERSION = 'clear-mvp.1';
const str = (pattern, maxLength = 128) => ({ type: 'string', pattern, maxLength });
const id = str('^[a-z][a-z0-9.-]{0,63}$', 64);
const hash = str('^0x[0-9a-f]{64}$', 66);
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const seconds = integer(0, 4102444800);
const revision = integer(1, 2147483647);
const text = { type: 'string', minLength: 1, maxLength: 240 };
const choices = (...values) => ({ enum: values });
const literal = value => ({ const: value });
const nullable = s => ({ anyOf: [s, { type: 'null' }] });
const list = (items, minItems = 0, maxItems = 64) => ({ type: 'array', items, minItems, maxItems });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const ref = name => ({ $ref: '#/$defs/' + name });
const atoms = str('^(0|[1-9][0-9]{0,29})$', 30);
const period = obj({ from: seconds, until: seconds, boundaries: literal('[from,until)'), timeZone: literal('Asia/Seoul') });
const sourceRef = obj({ sourceId: id, locator: text });
const amountInputs = obj({ basis: choices('SYNTHETIC_ASSUMPTION', 'OFFICIAL_OPEN'), token: literal('TEST'), decimals: literal(6),
  paidAtoms: nullable(atoms), bookAtoms: nullable(atoms), deviceAtoms: nullable(atoms), fixedFeeAtoms: nullable(atoms),
  examCreditAtoms: nullable(atoms), taxBps: nullable(integer(0, 10000)), capAtoms: nullable(atoms),
  rounding: literal('FLOOR_ONCE_DEMO'), formulaVersion: literal('siwon-demo-amount.1') });
const binding = obj({ applicationId: hash, subjectRef: hash, subjectBindingId: id, bindingRevision: revision,
  recipientRef: id, instanceId: id, policyHash: hash, policyVersion: id, productId: id, cohortId: id });
const sourceBinding = obj({ institutionId: id, providerInstanceId: id, courseId: id, sourceAccountRef: id,
  accountBindingId: id, accountBindingVersion: id });
const policy = obj({ contractVersion: literal(CONTRACT_VERSION), mode: choices('SYNTHETIC', 'OFFICIAL_DRAFT'),
  policyVersion: id, productId: id, institutionId: id, cohortId: id,
  capabilities: obj({ profileVersion: id, conditionAmountTiers: list(integer(1, 1000), 1, 16),
    precheckOnlyTiers: list(integer(1, 1000), 0, 16), excludedTiers: list(integer(1, 1000), 0, 16) }),
  ruleVersion: literal('clear-mvp-rules.1'), sources: list(ref('Source'), 1, 16), questions: list(ref('Question'), 0, 32),
  requirements: list(ref('Requirement'), 1, 32), rules: list(ref('Rule'), 1, 64), commonRuleIds: list(id, 1, 32),
  tiers: list(ref('Tier'), 1, 16), learningRules: list(ref('LearningRule'), 0, 32),
  amount: { anyOf: [obj({ kind: literal('FIXED_SYNTHETIC_NET'), basis: literal('SYNTHETIC_ASSUMPTION'),
    token: literal('TEST'), decimals: literal(6), netAtoms: nullable(atoms) }),
  obj({ kind: literal('SIWON_DEMO'), inputs: amountInputs })] },
  deadlines: obj({ evidenceFrom: seconds, evidenceUntil: seconds, supplementUntil: seconds, finalizeUntil: seconds,
    allocationUntil: seconds, claimUntil: seconds, minClaimWindowSeconds: integer(1, 31536000) }),
  selection: obj({ officialRule: literal('OPEN'), syntheticRule: literal('EXPLICIT_SINGLE_TIER_NO_TOPUP') }) });
export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:clear:mvp:1',
  $defs: {
    Binding: binding, SourceBinding: sourceBinding, Period: period, AmountInputs: amountInputs,
    Source: obj({ sourceId: id, institutionId: id, productId: id, cohortId: nullable(id), capturedAt: seconds,
      origin: choices('SYNTHETIC_ASSUMPTION', 'OFFICIAL_SNAPSHOT'), rawHash: hash, normalizedHash: nullable(hash),
      normalizerVersion: nullable(id), applicability: choices('SYNTHETIC_ONLY', 'OPEN'), locators: list(text, 1, 64) }),
    Question: obj({ questionId: id, field: id, text, status: choices('OPEN', 'RESOLVED_SYNTHETIC'), resolution: nullable(text), sourceRefs: list(sourceRef, 1, 16) }),
    Requirement: obj({ requirementId: id, kind: choices('EXAM', 'BASELINE', 'LEARNING', 'MOCK_TEST', 'REVIEW', 'BLOG'),
      coverage: choices('EXISTENTIAL', 'COMPLETE_PERIOD', 'NOT_REQUIRED'), period: nullable(period),
      maxAgeSeconds: integer(1, 31536000), trustProfile: literal('synthetic-fixture-verifier.1'), requiredFields: list(id, 1, 32) }),
    Rule: obj({ ruleId: id, requirementId: id,
      predicate: choices('SCORE_LT', 'SCORE_GTE', 'SCORE_EQ', 'BASELINE_LT', 'DAILY_TIME', 'DAILY_PROGRESS', 'BOOLEAN'),
      unit: choices('SCORE', 'BPS', 'BOOLEAN'), threshold: nullable(integer(0, 10000)), days: nullable(integer(1, 366)),
      basis: choices('SYNTHETIC_ASSUMPTION', 'OFFICIAL_OPEN'), sourceRefs: list(sourceRef, 1, 16), questionIds: list(id, 0, 32) }),
    Tier: obj({ tier: integer(1, 1000), support: choices('CONDITION_AMOUNT', 'PRECHECK_ONLY'),
      alternatives: list(obj({ routeId: id, allRuleIds: list(id, 1, 32) }), 1, 2) }),
    LearningRule: obj({ requirementId: id, metric: choices('EFFECTIVE_TIME_RATIO', 'OFFICIAL_PROGRESS'),
      thresholdBps: integer(0, 10000), days: integer(1, 366), allowedActivityIds: list(id, 1, 10000), activitySetHash: hash,
      metricRuleVersion: id, dateAttributionRuleVersion: id, uniqueDay: literal(true), lectureReuse: literal('FORBIDDEN'),
      normalCloseRequired: literal(true), speedPolicy: choices('NOT_REQUIRED', 'PROVIDER_COMPLIANT'), deliveryMode: literal('STREAMING_ONLY') }),
    PolicyDraft: policy,
    RuleObservation: obj({ ruleId: id, ruleHash: hash, status: choices('OBSERVED', 'MISSING', 'UNKNOWN', 'NEEDS_SUPPLEMENT', 'IN_PROGRESS'),
      unit: choices('SCORE', 'BPS', 'BOOLEAN'), value: nullable({ anyOf: [integer(0, 10000), { type: 'boolean' }] }), days: nullable(integer(0, 366)) }),
    Evidence: obj({ contractVersion: literal(CONTRACT_VERSION), mode: choices('SYNTHETIC', 'LOCAL_LAB', 'INSTITUTION'),
      binding, evidenceId: id, revision, requirementId: id, sourceBinding, sourceRevision: nullable(id),
      payloadHash: hash, trustProfile: literal('synthetic-fixture-verifier.1'), collectedAt: seconds, acceptedAt: seconds,
      coveredPeriod: nullable(period), sourceStatus: choices('PRESENT', 'NO_RECORD', 'UNAVAILABLE', 'UNKNOWN'),
      authenticity: choices('VERIFIED_SYNTHETIC', 'UNKNOWN'), subject: choices('VERIFIED_SYNTHETIC', 'UNKNOWN'),
      completeness: choices('COMPLETE_SYNTHETIC', 'NOT_REQUIRED', 'PARTIAL', 'UNKNOWN'),
      semantics: choices('VERIFIED_SYNTHETIC', 'UNKNOWN'), correction: choices('CURRENT', 'SUPERSEDED', 'UNKNOWN'),
      observations: list(ref('RuleObservation'), 0, 64) }),
    DocumentPrecheck: obj({ contractVersion: literal(CONTRACT_VERSION), binding, requirementId: id, ruleId: id, ruleVersion: id,
      submissionId: id, submissionRevision: revision, routeRevision: revision, inputHash: hash, runId: id,
      method: choices('CODE', 'TEXT_AI', 'VISION'), execution: choices('MOCK', 'ACTUAL'), current: { type: 'boolean' },
      reviewStatus: choices('CHECKED', 'MISSING', 'NEEDS_REVIEW', 'UNREADABLE', 'POLICY_OPEN'), questionId: nullable(id),
      sourceRefs: list(sourceRef, 1, 16), observations: list(obj({ fieldId: id, value: nullable(text),
        locator: nullable(text) }), 0, 64),
      sourceVerification: obj({ publication: literal('UNVERIFIED'), author: literal('UNVERIFIED'),
        publishedAt: literal('UNVERIFIED'), modifiedAt: literal('UNVERIFIED'), publicAvailability: literal('UNVERIFIED') }),
      automaticEligibility: literal(false), paymentAllowed: literal(false) }),
  },
};
// Metadata for consumer preparation, not an uploader or an external transfer consent.
export const DOCUMENT_LIMITS = Object.freeze({ profile: 'clear-document-preparation.1', maxBytesPerFile: 8388608,
  maxPixelsPerImage: 20000000, maxImagesPerPost: 8, maxPosts: 14, decodeTimeoutMs: 30000,
  uploadImplemented: false, externalTransferAllowed: false, automaticEligibility400: false });
