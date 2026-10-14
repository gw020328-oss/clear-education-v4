// M0 design artifacts only. No server, verifier, policy evaluator or contract runtime.
// JSON Schema 2020-12 subset; check.mjs validates only the keywords used here.
const str = maxLength => ({ type: 'string', minLength: 1, maxLength });
const e = (...values) => ({ enum: values });
const ref = name => ({ $ref: `#/$defs/${name}` });
const list = (items, maxItems, minItems = 0) => ({ type: 'array', items, minItems, maxItems });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const id = { ...str(64), pattern: '^[a-z][a-z0-9.-]*$' };
const revision = { type: 'integer', minimum: 1, maximum: 2147483647 };
const uint = { type: 'string', pattern: '^(0|[1-9][0-9]{0,29})$' };
const epoch = { type: 'integer', minimum: 0, maximum: 4102444800 }; // UTC seconds, through 2100
const hash = { type: 'string', pattern: '^0x[0-9a-f]{64}$' };
const flag = value => ({ const: value });
const binding = { applicationId: id, policyHash: hash, policyVersion: id, subjectBindingId: id,
  bindingRevision: revision, recipientRef: id, instanceId: id };
const marker = { contractVersion: flag('clear-m0.1'), mode: flag('SYNTHETIC'), authority: flag('MOCK_ONLY') };
const reason = e('INVALID_INPUT', 'FORBIDDEN', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'BINDING_MISMATCH',
  'SOURCE_UNVERIFIED', 'HISTORY_INCOMPLETE', 'UNSUPPORTED_RULE', 'QUESTION_OPEN', 'MISSING_DOCUMENT',
  'MISSING_FIELD', 'UNREADABLE', 'MISMATCH', 'AUTHENTICITY_UNVERIFIED', 'STALE_RESULT', 'OUTCOME_UNKNOWN',
  'FUNDING_INSUFFICIENT', 'DEADLINE_EXPIRED', 'ALREADY_SETTLED', 'C0_BLOCKED');
const assertion = e('VERIFIED', 'UNVERIFIED', 'REJECTED', 'NOT_REQUIRED');
const defs = {
  Reason: reason,
  Source: obj({ sourceId: id, institution: id, product: id, cohort: nullable(str(80)),
    capturedAt: epoch, rawHash: hash, normalizedHash: nullable(hash), normalizerVersion: nullable(id),
    origin: e('OFFICIAL_SNAPSHOT', 'SYNTHETIC_ASSUMPTION'), sourceUrl: nullable(str(512)),
    locator: str(240), applicability: e('CONFIRMED_FOR_SNAPSHOT', 'OPEN'), contentIncluded: flag(false) }),
  Question: obj({ questionId: id, category: e('EXTERNAL', 'C0', 'PRODUCT', 'CONSUMER'), field: str(120),
    routeIds: list(id, 4, 1), text: str(400), choices: list(str(240), 4, 2),
    status: e('OPEN', 'RESOLVED_SYNTHETIC'), resolution: nullable(str(400)) }),
  Window: obj({ from: epoch, until: epoch, boundaries: flag('[from,until)'), timezone: flag('Asia/Seoul') }),
  Deadlines: obj({ evidenceUntil: epoch, supplementUntil: epoch, finalizeUntil: epoch, allocationUntil: epoch,
    claimUntil: epoch, minClaimWindowSeconds: { type: 'integer', minimum: 1, maximum: 604800 } }),
  Amount: obj({ token: flag('TEST'), decimals: flag(6), rule: flag('FIXED_SYNTHETIC_NET'),
    netAtoms: uint, deductions: flag('NOT_OFFICIAL_ZERO_DEMO'), inputBasis: flag('SYNTHETIC_AGREEMENT') }),
  Requirement: obj({ requirementId: id, routeIds: list(id, 4, 1), kind: e('EXAM', 'LEARNING', 'MOCK_TEST', 'REVIEW', 'DOCUMENT'),
    coverage: e('EXISTENTIAL', 'COMPLETE_PERIOD', 'NOT_REQUIRED'), authenticityRequired: { type: 'boolean' },
    subjectRequired: flag(true), period: nullable(ref('Window')), maxAgeSeconds: { type: 'integer', minimum: 1, maximum: 604800 },
    sourceTrustProfile: id, requiredFields: list(id, 32, 1), sourceIds: list(id, 16, 1),
    support: e('SYNTHETIC_ONLY', 'UNSUPPORTED'), questionIds: list(id, 32) }),
  Rule: obj({ ruleId: id, requirementId: id,
    predicate: e('EXAM_GTE', 'DAILY_TIME', 'DAILY_PROGRESS', 'COMPLETED', 'REVIEW_ACCEPTED', 'HISTORY_NO_HIGH_SCORE'),
    threshold: nullable({ type: 'integer', minimum: 0, maximum: 10000 }),
    unit: e('SCORE', 'BPS', 'BOOLEAN'), days: nullable({ type: 'integer', minimum: 1, maximum: 366 }),
    sourceIds: list(id, 16, 1), basis: e('OFFICIAL_SNAPSHOT', 'SYNTHETIC_ASSUMPTION') }),
  Route: obj({ routeId: id, allRuleIds: list(id, 64, 1) }),
  PolicyBody: obj({ policyId: id, institution: id, product: id, cohort: str(80),
    ruleVersion: flag('m0-limited-rules.1'), sourceIds: list(id, 16, 1), commonRuleIds: list(id, 64),
    anyRoutes: list(ref('Route'), 4, 1), rules: list(ref('Rule'), 64, 1),
    requirements: list(ref('Requirement'), 32, 1), questions: list(ref('Question'), 32),
    amount: nullable(ref('Amount')), deadlines: nullable(ref('Deadlines')),
    trustProfile: flag('synthetic-fixture-verifier.1'), paymentEnabled: flag(false) }),
  PolicyDraft: obj({ ...marker, draftId: id, revision, state: e('DRAFT', 'QUESTIONS_OPEN', 'REVIEWED'),
    body: ref('PolicyBody'), reviewerRef: nullable(id), aiRunId: nullable(id) }),
  ApprovedPolicy: obj({ ...marker, policyHash: hash, policyVersion: id, draftId: id, draftRevision: revision,
    body: ref('PolicyBody'), approvedBy: id, compilerVersion: flag('M0_NOT_IMPLEMENTED'),
    publication: flag('MOCK_CATALOG_ONLY'), executable: flag(false) }),
  Application: obj({ ...marker, ...binding, revision, state: e('DRAFT', 'AGREED', 'CANCELLED', 'CLOSED'),
    selectedRouteId: nullable(id), termsHash: hash, consentRef: nullable(id),
    consentKind: flag('MOCK_NO_SIGNATURE'), fundingNotGuaranteed: flag(true) }),
  Evidence: obj({ ...marker, ...binding, evidenceId: id, revision, requirementId: id,
    kind: e('EXAM', 'LEARNING', 'MOCK_TEST', 'REVIEW', 'DOCUMENT'),
    sourceId: id, sourceRevision: nullable(id), sourceTrustProfile: id, observedAt: epoch, validUntil: epoch,
    coverage: e('EXISTENTIAL', 'COMPLETE_PERIOD', 'NOT_REQUIRED'), coveredPeriod: nullable(ref('Window')),
    authenticity: assertion, completeness: assertion, subject: assertion,
    payloadHash: hash, verifierRef: id, supersedes: nullable(id),
    collectionEnabled: flag(false), proofVerified: flag(false), paymentAllowed: flag(false) }),
  SubjectBinding: obj({ ...marker, subjectBindingId: id, bindingRevision: revision, applicationId: id,
    providerInstanceId: id, sourceAccountRef: id, state: e('PROPOSED', 'VERIFIED', 'REVOKED'),
    authorityProfile: flag('synthetic-fixture-verifier.1'), verifiedAt: nullable(epoch), expiresAt: epoch }),
  DocumentSubmission: obj({ ...marker, ...binding, submissionId: id, submissionRevision: revision,
    routeRevision: revision, requirementId: id, fileRef: id, privateFileHash: hash,
    mimeType: e('image/png', 'image/jpeg'), byteLength: { type: 'integer', minimum: 1, maximum: 8388608 },
    pixels: { type: 'integer', minimum: 1, maximum: 20000000 }, pageCount: { type: 'integer', minimum: 1, maximum: 5 },
    submittedAt: epoch, retentionUntil: epoch, transferConsent: e('NOT_REQUESTED', 'MOCK_ONLY'),
    actualFilePresent: flag(false), externalTransferAllowed: flag(false) }),
  ModelRun: obj({ ...marker, aiRunId: id, jobId: id, inputHash: hash, modelInputHash: hash,
    transformVersion: id, promptVersion: id, extractorProfile: id, modelVersion: { type: 'null' },
    attempt: { const: 1 }, execution: flag('MOCK'), costAtoms: flag('0'), state: e('SUCCEEDED', 'FAILED', 'CANCELLED') }),
  MockReply: obj({ ...marker, requestId: id, operationId: nullable(id),
    state: e('SUCCEEDED', 'PENDING', 'REJECTED', 'UNKNOWN'), revision: nullable(revision),
    viewIds: list(id, 32), fault: nullable(ref('Fault')), nextCursor: nullable(id), complete: { type: 'boolean' } }),
  FieldObservation: obj({ fieldId: id, value: nullable(str(120)), readStatus: e('READABLE', 'NOT_VISIBLE', 'UNREADABLE'),
    page: nullable({ type: 'integer', minimum: 1, maximum: 5 }),
    bbox: nullable(list({ type: 'number', minimum: 0, maximum: 1 }, 4, 4)) }),
  DocumentPrecheck: obj({ ...marker, ...binding, submissionId: id, submissionRevision: revision, routeRevision: revision,
    requirementId: id, inputHash: hash, modelInputHash: hash, transformVersion: id,
    jobId: id, aiRunId: id, jobState: e('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'),
    modelExecution: flag('MOCK'), actualModelVersion: { type: 'null' },
    observations: list(ref('FieldObservation'), 32),
    outcome: e('PRECHECK_REQUIREMENTS_MET', 'NEEDS_SUPPLEMENT', 'UNDETERMINED'), reasons: list(reason, 32),
    authenticity: flag('UNVERIFIED'), completeness: flag('UNVERIFIED'), subject: flag('UNVERIFIED'),
    current: { type: 'boolean' }, paymentAllowed: flag(false) }),
  RuleResult: obj({ ruleId: id, status: e('MET', 'NOT_MET', 'UNKNOWN', 'IN_PROGRESS'), evidenceIds: list(id, 32), reasons: list(reason, 32) }),
  Eligibility: obj({ ...marker, ...binding, decisionId: id, revision, evaluatedAt: epoch,
    evidenceRefs: list(obj({ evidenceId: id, revision }), 64), selectedRouteId: nullable(id),
    ruleResults: list(ref('RuleResult'), 64, 1), status: e('COLLECTING', 'NEEDS_SUPPLEMENT', 'ON_HOLD', 'NOT_MET', 'ELIGIBLE'),
    finality: e('PROVISIONAL', 'FINAL'), amountAtoms: nullable(uint), reasons: list(reason, 32), paymentAllowed: flag(false) }),
  Funding: obj({ ...marker, ...binding, revision,
    status: e('UNFUNDED', 'PARTIAL', 'FUNDED', 'ALLOCATED', 'PAID', 'CANCELLED', 'EXPIRED', 'RECLAIMED'),
    releaseReason: e('NONE', 'STUDENT_CANCELLED', 'ALLOCATION_EXPIRED', 'CLAIM_EXPIRED'),
    entitlementAtoms: uint, balanceAtoms: uint, reservedAtoms: uint, paidAtoms: uint, returnedAtoms: uint,
    totalDepositedAtoms: uint, allocationId: nullable(id), decisionId: nullable(id), refundRecipientRef: id,
    observedAt: epoch, observation: e('MOCK_CONFIRMED', 'UNKNOWN', 'REORG_PENDING'), paymentAllowed: flag(false) }),
  Claim: obj({ ...marker, ...binding, claimId: id, allocationId: nullable(id),
    state: e('NOT_CLAIMABLE', 'CLAIMABLE', 'PENDING', 'UNKNOWN', 'PAID', 'EXPIRED'),
    amountAtoms: uint, canSimulateClaim: { type: 'boolean' },
    chainAuthority: flag('NO_CHAIN_MOCK'), independentProduct: flag('NO_GO'), paymentAllowed: flag(false) }),
  Fault: obj({ code: reason, operationId: nullable(id), outcome: e('NOT_SENT', 'REJECTED', 'UNKNOWN'),
    nextAction: e('FIX_INPUT', 'ASK_OPERATOR', 'SUPPLEMENT', 'QUERY_OPERATION', 'REFRESH', 'WAIT_FOR_SOURCE', 'WAIT_FOR_FUNDING', 'NONE'),
    autoRetry: flag(false) }),
};
// Requests contain references, not client-authored verified results or user/owner/trust overrides.
const args = {
  CreateDraft: obj({ sourceIds: list(id, 16, 1), product: id }),
  AnswerQuestion: obj({ draftId: id, questionId: id, answer: str(400), basis: e('SYNTHETIC_ASSUMPTION', 'EXTERNAL_REFERENCE') }),
  ApproveDraft: obj({ draftId: id }), PublishMockPolicy: obj({ draftId: id }),
  CreateApplication: obj({ policyHash: hash }), AgreeMockTerms: obj({ applicationId: id, termsHash: hash }),
  SubmitMockEvidence: obj({ applicationId: id, requirementId: id, fixtureId: id }),
  SubmitMockDocument: obj({ applicationId: id, requirementId: id, fixtureId: id, submissionRevision: revision }),
  StartMockPrecheck: obj({ applicationId: id, submissionId: id, submissionRevision: revision, routeRevision: revision }),
  CancelOperation: obj({ operationId: id }), EvaluateMock: obj({ applicationId: id }),
  SimulateTopUp: obj({ applicationId: id, amountAtoms: uint }),
  SimulateAllocate: obj({ applicationId: id, decisionId: id }),
  SimulateClaim: obj({ applicationId: id }), CancelApplication: obj({ applicationId: id }),
  SimulateReclaim: obj({ applicationId: id }),
  GetApplication: obj({ applicationId: id }), GetDraft: obj({ draftId: id }), GetOperation: obj({ operationId: id }),
  ListMockPolicies: obj({ cursor: nullable(id), limit: { type: 'integer', minimum: 1, maximum: 20 } }),
};
for (const [name, body] of Object.entries(args)) defs[name] = obj({ ...marker, name: flag(name),
  requestId: id, expectedRevision: nullable(revision), idempotencyKey: nullable(id), args: body });
export const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', $defs: defs };
export const commandNames = Object.keys(args);
export const readCommands = ['GetApplication', 'GetDraft', 'GetOperation', 'ListMockPolicies'];
