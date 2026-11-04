import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCourseEvidenceReader } from '../../src/agent-preview/moodle-binding/course-evidence.mjs';
import { procedureFixture, START } from '../bootcamp-store/procedure-fixture.mjs';

async function fixture(t) {
  const f = await procedureFixture(t);
  const caller = Object.freeze({});
  const scope = {
    courseRef: 'fixture-course',
    participantRef: 'fixture-student',
    applicationId: f.create(),
    role: 'PARTICIPANT',
    authorityRef: 'fixture-authority-1',
    clearContext: f.aliceContext
  };
  function reader(options = {}) {
    return createCourseEvidenceReader({
      resolveScope(handle) {
        assert.equal(handle, caller);
        return scope;
      },
      getDecisionEvidence: (...args) => f.store.getDecisionEvidence(...args),
      ...options
    });
  }
  return { f, scope, caller, reader };
}

test('existing S4 records project four conditions without writes, refresh, or raw evidence', async t => {
  const { f, scope, caller, reader } = await fixture(t);
  const read = reader();
  const missing = await read.read(caller);
  assert.ok(missing.criteria.every(row => row.evidence.availability === 'MISSING'
    && row.source.connection === 'UNKNOWN' && row.pendingUserAction === null));
  await f.complete(scope.applicationId);
  const database = join(f.directory, 'bootcamp.sqlite');
  const before = readFileSync(database);
  const result = await read.read(caller);
  assert.equal(result.decision.recordedConditionsStatus, 'MET');
  assert.equal(result.usableForPayment, false);
  assert.deepEqual(result.criteria.map(row => row.criterionId), [
    'activity-complete', 'assignment-submitted', 'reflection-topics', 'python-basic-certificate'
  ]);
  assert.ok(result.criteria.every(row => row.source.dataMode === 'SYNTHETIC_FIXTURE'
    && row.source.currentness === 'UNKNOWN' && row.evidence.originalHttpAvailable === false));
  assert.equal(result.criteria[2].evidence.facts.modelExecution, 'UNKNOWN');
  assert.equal(result.criteria[2].evidence.facts.topics[0].span.unit, 'UTF16_CODE_UNIT');
  const payload = JSON.stringify(result);
  for (const value of [scope.clearContext.token, scope.clearContext.wallet, scope.participantRef,
    'quoteHash', 'proofBundleHash', 'accountProofHash', 'sourceHash', 'requestHash', 'rawLocator']) {
    assert.equal(payload.includes(value), false);
  }
  f.setTime(START + 302);
  const expired = await read.read(caller);
  assert.ok(expired.criteria.every(row => row.failure === 'EXPIRED' && row.recordedState === 'MET'));
  assert.deepEqual(readFileSync(database), before);
});

test('pending user actions come from owner state and are hidden from a course operator', async t => {
  const { f, scope, caller, reader } = await fixture(t);
  const read = reader({
    readSourceStates(ownerScope) {
      assert.equal(Object.hasOwn(ownerScope, 'clearContext'), false);
      return [
        { criterionId: 'activity-complete', connection: 'UNCONNECTED', pendingAction: null },
        { criterionId: 'reflection-topics', connection: 'CONNECTED', pendingAction: 'APPROVE_REFLECTION_ANALYSIS' },
        { criterionId: 'python-basic-certificate', connection: 'CONNECTED', pendingAction: 'SIGN_RECLAIM_REQUEST' }
      ];
    }
  });
  const student = await read.read(caller);
  assert.equal(student.criteria[0].source.connection, 'UNCONNECTED');
  assert.equal(student.criteria[2].pendingUserAction, 'APPROVE_REFLECTION_ANALYSIS');
  assert.equal(student.criteria[3].pendingUserAction, 'SIGN_RECLAIM_REQUEST');
  scope.clearContext = f.operatorContext;
  scope.role = 'COURSE_OPERATOR';
  assert.ok((await read.read(caller)).criteria.every(row => row.pendingUserAction === null));
  scope.role = 'PARTICIPANT';
  await assert.rejects(read.read(caller), /COURSE_EVIDENCE_SCOPE/);
});

test('scope changes and a mismatched CLEAR identity fail closed', async t => {
  const { f, scope, caller, reader } = await fixture(t);
  for (const field of ['courseRef', 'participantRef', 'applicationId', 'authorityRef']) {
    const previous = scope[field];
    let evidenceReads = 0;
    const read = reader({
      async readSourceStates() {
        scope[field] = 'other-reference';
        return [];
      },
      getDecisionEvidence() { evidenceReads++; }
    });
    await assert.rejects(read.read(caller), /COURSE_EVIDENCE_AUTHORITY_CHANGED/);
    assert.equal(evidenceReads, 0);
    scope[field] = previous;
  }
  scope.clearContext = f.bobContext;
  await assert.rejects(reader().read(caller), /FORBIDDEN/);
  scope.clearContext = f.aliceContext;
  await assert.rejects(reader({
    readSourceStates() {
      f.service.logout(f.aliceContext);
      return [];
    }
  }).read(caller), /AUTH_REQUIRED/);
});

test('stored source mode stays distinct from connection and rejects cross-source provenance', async t => {
  const { f, scope, caller, reader } = await fixture(t);
  await f.complete(scope.applicationId);
  // Exercise the adapter's two registered source modes with explicit recorded metadata fixtures.
  const snapshot = structuredClone(f.store.getDecisionEvidence(f.aliceContext, scope.applicationId));
  for (const row of snapshot.manifest.criteria) {
    const isCertificate = row.criterionId === 'python-basic-certificate';
    row.source.dataMode = isCertificate ? 'RECLAIM_SIGNED_RECORD' : 'LOCAL_LMS_RECORD';
    row.verification.sourceStatus = isCertificate ? 'VERIFIED_ATTESTOR_SIGNATURES' : 'VERIFIED_LOCAL_API';
  }
  const read = reader({ getDecisionEvidence: () => snapshot });
  const projected = await read.read(caller);
  assert.deepEqual(projected.criteria.map(row => row.source.dataMode),
    ['LOCAL_LMS_RECORD', 'LOCAL_LMS_RECORD', 'LOCAL_LMS_RECORD', 'RECLAIM_SIGNED_RECORD']);
  assert.ok(projected.criteria.every(row => row.source.connection === 'UNKNOWN'));
  assert.equal(projected.criteria[3].source.verification, 'VERIFIED_ATTESTOR_SIGNATURES');
  snapshot.manifest.criteria[3].source.dataMode = 'LOCAL_LMS_RECORD';
  snapshot.manifest.criteria[3].verification.sourceStatus = 'VERIFIED_LOCAL_API';
  await assert.rejects(read.read(caller), /COURSE_EVIDENCE_PROVENANCE/);
});

test('final resolution rejects revocation, remapping and expiry during the S4 read', async t => {
  const { f, scope, caller, reader } = await fixture(t);
  for (const change of ['revoked', 'remapped', 'expired']) {
    let revoked = false;
    let now = START;
    const expiresAt = START + 1;
    let resolutions = 0;
    let evidenceReads = 0;
    const initialCourse = scope.courseRef;
    const read = reader({
      resolveScope(handle) {
        assert.equal(handle, caller);
        resolutions++;
        if (revoked) throw Error('FIXTURE_MOODLE_AUTHORITY_REVOKED');
        if (now >= expiresAt) throw Error('FIXTURE_MOODLE_AUTHORITY_EXPIRED');
        return scope;
      },
      getDecisionEvidence(...args) {
        evidenceReads++;
        const result = f.store.getDecisionEvidence(...args);
        if (change === 'revoked') revoked = true;
        if (change === 'remapped') scope.courseRef = 'different-course';
        if (change === 'expired') now = expiresAt;
        return result;
      }
    });
    const expected = {
      revoked: /FIXTURE_MOODLE_AUTHORITY_REVOKED/,
      remapped: /COURSE_EVIDENCE_AUTHORITY_CHANGED/,
      expired: /FIXTURE_MOODLE_AUTHORITY_EXPIRED/
    }[change];
    await assert.rejects(read.read(caller), expected);
    assert.equal(resolutions, 3);
    assert.equal(evidenceReads, 1);
    scope.courseRef = initialCourse;
  }
});
