import { P0_POLICY } from '../../../specs/bootcamp/p0-contract.mjs';
import { exact, hash, integer, requireRule as check } from './contract.mjs';

export const COURSE_EVIDENCE_VERSION = 'clear-moodle-course-evidence.1';

const criteria = P0_POLICY.criteria;
const roles = ['PARTICIPANT', 'COURSE_OPERATOR'];
const availabilityStates = [
  'MISSING', 'UNAVAILABLE', 'DELETED', 'EXPIRED', 'SUPERSEDED',
  'INVALIDATED', 'APPLICATION_INACTIVE', 'VALID_AS_RECORDED'
];
const provenance = Object.freeze({
  SYNTHETIC_FIXTURE: 'MOCK_VERIFIED',
  LOCAL_LMS_RECORD: 'VERIFIED_LOCAL_API',
  RECLAIM_SIGNED_RECORD: 'VERIFIED_ATTESTOR_SIGNATURES'
});
const pendingActions = new Map([
  ['reflection-topics', ['APPROVE_REFLECTION_ANALYSIS']],
  ['python-basic-certificate', ['HACKERRANK_LOGIN', 'APPROVE_RECLAIM_PROOF', 'SIGN_RECLAIM_REQUEST']]
]);
const reference = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const optionalEpoch = value => integer(value) ? value : null;
const allowed = (value, values) => values.includes(value) ? value : null;

function readFacts(criterion, row) {
  const facts = row.checks;
  if (!facts) return null;
  switch (criterion.criterionId) {
    case 'activity-complete':
      return {
        completionState: allowed(facts.completionState, ['COMPLETED', 'INCOMPLETE', 'UNKNOWN']),
        completionMode: allowed(facts.completionMode, ['AUTOMATIC', 'MANUAL', 'UNKNOWN']),
        sourceCompletedAt: optionalEpoch(facts.sourceCompletedAt)
      };
    case 'assignment-submitted':
      return {
        submissionState: allowed(facts.submissionState, ['SUBMITTED', 'DRAFT', 'NOT_SUBMITTED', 'UNKNOWN']),
        sourceSubmittedAt: optionalEpoch(facts.sourceSubmittedAt)
      };
    case 'reflection-topics':
      return {
        modelExecution: 'UNKNOWN',
        topics: criterion.predicate.topics.map(topicId => {
          const topic = facts.topics?.find(item => item.topicId === topicId);
          const location = topic?.location;
          const span = location?.evidenceId === row.evidenceId && location?.field === '/source/body'
            && location.unit === 'UTF16_CODE_UNIT' && integer(location.start) && integer(location.end)
            && location.end > location.start
            ? { start: location.start, end: location.end, unit: 'UTF16_CODE_UNIT' }
            : null;
          return { topicId, state: allowed(topic?.state, ['PRESENT', 'MISSING', 'UNCERTAIN', 'CONFLICT']) ?? 'UNKNOWN', span };
        })
      };
    case 'python-basic-certificate':
      return {
        issuerStatus: allowed(facts.issuerStatus, ['test_passed', 'test_failed', 'UNKNOWN']),
        achievementAt: optionalEpoch(facts.achievementAt),
        proofValidUntilExclusive: optionalEpoch(row.reference?.value?.validUntilExclusive)
      };
  }
}

function sourceStates(rows) {
  check(Array.isArray(rows) && rows.length <= criteria.length, 'COURSE_SOURCE_STATE');
  const result = new Map();
  for (const row of rows) {
    exact(row, ['criterionId', 'connection', 'pendingAction']);
    check(criteria.some(criterion => criterion.criterionId === row.criterionId)
      && !result.has(row.criterionId)
      && ['CONNECTED', 'UNCONNECTED', 'UNKNOWN'].includes(row.connection)
      && (row.pendingAction === null || row.connection === 'CONNECTED'
        && pendingActions.get(row.criterionId)?.includes(row.pendingAction)), 'COURSE_SOURCE_STATE');
    result.set(row.criterionId, { ...row });
  }
  return result;
}

function project(scope, snapshot, sources) {
  const { manifest, currentDecision } = snapshot;
  check(snapshot.version === 'clear-bootcamp-decision-evidence.1'
    && snapshot.applicationId === scope.applicationId && manifest?.applicationId === scope.applicationId
    && snapshot.role === scope.role && currentDecision?.matchesRequestedDecision === true
    && manifest.decision?.decisionId === currentDecision.decisionId
    && snapshot.limitations?.usableForPayment === false && snapshot.limitations?.liveSourceChecked === false
    && integer(snapshot.observedAt), 'COURSE_EVIDENCE_SCOPE');
  const { decision } = manifest;
  check(reference(decision.decisionId) && integer(decision.decisionRevision)
    && ['MET', 'NOT_MET', 'NEEDS_SUPPLEMENT', 'UNKNOWN'].includes(decision.conditionsStatus)
    && typeof currentDecision.applicationActive === 'boolean'
    && manifest.criteria?.length === criteria.length && snapshot.availability?.length === criteria.length,
  'COURSE_EVIDENCE_SHAPE');
  return {
    version: COURSE_EVIDENCE_VERSION,
    role: scope.role,
    observedAt: snapshot.observedAt,
    decision: { id: decision.decisionId, revision: decision.decisionRevision, recordedConditionsStatus: decision.conditionsStatus },
    applicationActive: currentDecision.applicationActive,
    criteria: criteria.map(criterion => {
      const { criterionId } = criterion;
      const row = manifest.criteria.find(item => item.criterionId === criterionId);
      const availability = snapshot.availability.find(item => item.criterionId === criterionId);
      check(row && availability && row.evidenceId === availability.evidenceId
        && (row.evidenceId === null || reference(row.evidenceId))
        && ['MET', 'NOT_MET', 'MISSING', 'UNKNOWN'].includes(row.state)
        && availabilityStates.includes(availability.status), 'COURSE_EVIDENCE_SHAPE');
      const dataMode = row.source?.dataMode ?? null;
      if (dataMode !== null) {
        check(row.source.kind === criterion.source && Object.hasOwn(provenance, dataMode)
          && (dataMode === 'SYNTHETIC_FIXTURE' || dataMode === (criterionId === 'python-basic-certificate'
            ? 'RECLAIM_SIGNED_RECORD' : 'LOCAL_LMS_RECORD'))
          && row.verification?.sourceStatus === provenance[dataMode], 'COURSE_EVIDENCE_PROVENANCE');
      }
      const source = sources.get(criterionId);
      const connection = source?.connection ?? 'UNKNOWN';
      const failure = availability.status === 'VALID_AS_RECORDED'
        ? allowed(row.state, ['NOT_MET', 'MISSING', 'UNKNOWN'])
        : availability.status;
      return {
        criterionId,
        recordedState: row.state,
        source: {
          kind: criterion.source, connection, dataMode,
          verification: dataMode === null ? null : provenance[dataMode],
          currentness: 'UNKNOWN'
        },
        evidence: {
          id: row.evidenceId,
          availability: availability.status,
          verifiedAt: optionalEpoch(row.source?.verifiedAt),
          validUntilExclusive: optionalEpoch(availability.sourceValidUntilExclusive),
          originalHttpAvailable: false,
          facts: readFacts(criterion, row)
        },
        failure,
        pendingUserAction: scope.role === 'PARTICIPANT' && currentDecision.applicationActive
          ? source?.pendingAction ?? null
          : null
      };
    }),
    usableForPayment: false
  };
}

// The Moodle owner validates its principal, enrolment and course before resolving
// the mapped CLEAR application and a separate CLEAR read session. Only the host
// calls this port, with a server-authenticated request handle. Every resolution
// must reject expired or revoked Moodle and CLEAR authority, even if its
// identity and mapping references would otherwise be unchanged.
export function createCourseEvidenceReader({ resolveScope, getDecisionEvidence, readSourceStates = () => [] }) {
  check([resolveScope, getDecisionEvidence, readSourceStates].every(port => typeof port === 'function'), 'COURSE_EVIDENCE_CONFIG');

  async function scopeFor(caller) {
    const scope = await resolveScope(caller);
    exact(scope, ['courseRef', 'participantRef', 'applicationId', 'role', 'authorityRef', 'clearContext']);
    check([scope.courseRef, scope.participantRef, scope.applicationId, scope.authorityRef].every(reference)
      && roles.includes(scope.role), 'COURSE_EVIDENCE_SCOPE');
    exact(scope.clearContext, ['token', 'wallet', 'chainId', 'csrf']);
    return structuredClone(scope);
  }

  return Object.freeze({
    async read(caller) {
      const before = await scopeFor(caller);
      const beforeHash = hash(before);
      const { clearContext: _privateContext, ...sourceScope } = before;
      const sources = sourceStates(await readSourceStates(sourceScope));
      const after = await scopeFor(caller);
      check(hash(after) === beforeHash, 'COURSE_EVIDENCE_AUTHORITY_CHANGED');
      // S4 reads one snapshot and rechecks its own CLEAR authority before return.
      const snapshot = getDecisionEvidence(after.clearContext, after.applicationId);
      const result = project(after, snapshot, sources);
      const final = await scopeFor(caller);
      check(hash(final) === beforeHash, 'COURSE_EVIDENCE_AUTHORITY_CHANGED');
      return result;
    }
  });
}
