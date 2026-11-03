import {REFLECTION_INSTRUCTION, REFLECTION_PROFILE_HASH, REFLECTION_TOPICS} from '../document-precheck/review/bootcamp-reflection.mjs';
import {prepareNormalReflectionPacket} from '../document-precheck/review/fixed-normal-reflection.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createDecisionEvidenceReader} from '../bootcamp/decision-evidence.mjs';
import {fixture} from '../../tests/hackerrank-evidence/fixture.mjs';
import {buildPlan, structureSynthetic} from './index.mjs';
import {executeExistingModuleDemo} from './existing-module-demo.mjs';
import {decisionRecord, compiled} from '../bootcamp/model.mjs';
export {prepareGeminiStructureRequest} from './gemini-preparation.mjs';

export async function runEvidenceDemo() {
  const draft = structureSynthetic('Moodle 활동 완료; Moodle 과제 제출');
  const {modules} = await executeExistingModuleDemo(buildPlan(draft), draft);
  return {executionMode: 'PUBLIC_SYNTHETIC', moodle: modules, certificate: await runCertificateDemo(), paymentAllowed: false};
}

export async function runCertificateDemo() {
  const {verifier, input, request} = await fixture();
  const certificate = await verifier.verify(input, request);
  if (certificate.status !== 'VERIFIED_CANDIDATE' || certificate.dataMode !== 'SYNTHETIC_FIXTURE'
      || certificate.condition !== 'MET' || !certificate.cryptography.bothAttestorSignaturesVerified
      || certificate.cryptography.productionTrustActivated || certificate.gates.paymentAllowed) {
    throw Error('PUBLIC_CERTIFICATE_VERIFICATION_FAILED');
  }
  const tampered = structuredClone(input);
  tampered.proofs.certificate.signature = '0x' + '00'.repeat(65);
  const rejected = await verifier.verify(tampered, request);
  if (rejected.status !== 'REJECTED' || rejected.code !== 'CLAIM_SIGNATURE') {
    throw Error('PUBLIC_CERTIFICATE_TAMPER_CHECK_FAILED');
  }
  return {
    status: certificate.status,
    condition: certificate.condition,
    syntheticSignaturesVerified: true,
    invalidSignatureRejected: true,
    productionTrustActivated: false
  };
}

export async function runReflectionGroundingDemo() {
  const draft = structureSynthetic('회고에 수행 내용, 확인 과정, 배운 점 포함');
  const {modules, observations} = await executeExistingModuleDemo(buildPlan(draft), draft);
  const text = observations[0].record.text;
  const packet = prepareNormalReflectionPacket({
    request: {
      purpose: 'REFLECTION_REQUIRED_TOPICS.1',
      instruction: REFLECTION_INSTRUCTION,
      topicIds: REFLECTION_TOPICS,
      contextHash: p0Hash('PUBLIC-REFLECTION-DEMO', text),
      profileHash: REFLECTION_PROFILE_HASH,
      sources: [{sourceId: 'public-reflection', kind: 'TEXT', text}]
    },
    messageFormat: 2,
    leaseExpiresAtMs: 1792200060000
  });
  return {
    executionMode: 'PUBLIC_SYNTHETIC', actualModelCall: false,
    grounded: modules[0].grounded,
    preparation: {status: 'PREPARED_NOT_EXECUTED', model: packet.model, bodySha256: packet.bodySha256}
  };
}

export function runSettlementConnectionDemo() {
  // Exercise the existing fixed-policy record builder without accepting evidence,
  // opening a host ledger, or turning a preview plan into a product policy.
  const decision = decisionRecord({
    id: 'public-application', participant_id: 'public-participant',
    policy_hash: compiled.policyHash, recipient_ref: 'public-recipient',
    course_operator_ref: 'public-operator'
  }, [], {
    decisionId: 'public-decision', decisionRevision: 1,
    previousDecisionId: null, evaluatedAt: 1792200000
  });
  const db = new DatabaseSync(':memory:');
  const wallet = '0x' + '11'.repeat(20);
  try {
    db.exec(`
      CREATE TABLE applications (id TEXT, wallet TEXT, status TEXT, decision_id TEXT);
      CREATE TABLE decisions (id TEXT, application_id TEXT, revision INTEGER, record TEXT);
      CREATE TABLE clock (id INTEGER, floor INTEGER);
    `);
    db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?)').run(decision.applicationId, wallet, 'ACTIVE', decision.decisionId);
    db.prepare('INSERT INTO decisions VALUES (?, ?, ?, ?)').run(decision.decisionId, decision.applicationId, decision.decisionRevision, JSON.stringify(decision));
    db.exec('PRAGMA query_only = ON');
    const reader = createDecisionEvidenceReader({
      db,
      authentication: {authorizeWorkflow: () => ({role: 'participant', wallet})},
      operatorBindings: () => [],
      now: () => decision.evaluatedAt
    });
    const evidenceView = reader.getDecisionEvidence({}, decision.applicationId, decision.decisionId);
    return {executionMode: 'PUBLIC_SYNTHETIC', decision, evidenceView};
  } finally {
    db.close();
  }
}
