import { id, TypedDataEncoder, Wallet } from 'ethers';
import { compileSyntheticPolicy } from '../../src/policy/compiler.mjs';
import { hash } from '../../src/policy/values.mjs';
import { proofBindingTypes } from '../../src/application/proof-sessions.mjs';
import { SOURCE_CONTRACT, SOURCE_CONTRACT_HASH, assessSyntheticExamEvidence } from '../../src/exam-evidence/synthetic-completeness.mjs';
import { draft, epoch } from '../policy/fixture.mjs';

export const policyDraft = () => ({ ...draft(), sourcePolicySetHash: SOURCE_CONTRACT_HASH });
export const registration = (examKey, status = 'TAKEN', examDate = '2020-01-15') => ({ examKey, examType: 'TOEIC_LR', examDate, status });
export const score = (examKey, totalScore = 800, status = 'VALID', examDate = '2020-01-15') => ({ ...registration(examKey, status, examDate), totalScore });
export function fixture({ compiled = compileSyntheticPolicy(policyDraft()), session } = {}) {
  const now = epoch('2020-02-03T00:00:00Z');
  if (!session) {
    const learner = Wallet.createRandom(), owner = Wallet.createRandom();
    const message = { applicationId: id('SYNTHETIC_APP'), learner: learner.address, policyHash: compiled.policyHash,
      runtimeConfigHash: id('SYNTHETIC_RUNTIME'), proofSessionId: id('SYNTHETIC_SESSION'), requestNonce: id('SYNTHETIC_NONCE'),
      ownerPublicKey: owner.signingKey.publicKey, expiresAt: String(BigInt(now) + 1800n) };
    const typedData = { domain: { name: 'ClearRefund', version: '4', chainId: 431701,
      verifyingContract: Wallet.createRandom().address, salt: id('SYNTHETIC_INSTANCE') },
    types: structuredClone(proofBindingTypes), primaryType: 'ProofSessionBindingV4', message };
    session = { proofSessionId: message.proofSessionId, applicationId: message.applicationId, state: 'AUTHORIZED',
      issuedAt: now, authorizedAt: now, expiresAt: message.expiresAt, typedData,
      bindingDigest: TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.message),
      dataMode: 'SYNTHETIC', collectionEnabled: false, proofVerified: false, paymentAllowed: false };
  }
  const time = session.authorizedAt;
  const manifest = { version: SOURCE_CONTRACT.version, dataMode: 'SYNTHETIC', sourcePolicySetHash: SOURCE_CONTRACT_HASH,
    policyHash: compiled.policyHash, bindingDigest: session.bindingDigest, learnerId: session.typedData.message.learner,
    subjectRef: id('SYNTHETIC_ACCOUNT'), snapshotId: 'snapshot-1', observedAt: time,
    scope: { examType: 'TOEIC_LR', examDateStart: compiled.policy.examDateStart, examDateEnd: compiled.policy.examDateEnd,
      allStatuses: true, coverageStart: compiled.policy.examDateStart, coverageEnd: compiled.policy.examDateEnd }, inventories: [] };
  const bundle = { manifest, pages: [] }, context = { session, manifestHash: null, now: time };
  // This generator stands in for a TRUSTED SYNTHETIC source inventory authority.
  // It is test-only; no equivalent authenticated YBM manifest exists today.
  function setRows(registrations, scores, pageSize = 2) {
    bundle.pages = [];
    for (const [role, rows] of [['REGISTRATION', registrations], ['SCORE', scores]]) {
      const chunks = []; for (let n = 0; n < rows.length; n += pageSize) chunks.push(rows.slice(n, n + pageSize));
      if (!chunks.length) chunks.push([]);
      chunks.forEach((records, i) => bundle.pages.push({ role, pageId: role + '-' + i, snapshotId: manifest.snapshotId,
        subjectRef: manifest.subjectRef, bindingDigest: manifest.bindingDigest, observedAt: manifest.observedAt,
        offset: i * pageSize, nextPageId: i + 1 < chunks.length ? role + '-' + (i + 1) : null, records }));
    }
    seal();
  }
  function seal() {
    manifest.inventories = ['REGISTRATION', 'SCORE'].map(role => {
      const pages = bundle.pages.filter(p => p.role === role);
      return { role, totalRows: pages.reduce((n, p) => n + p.records.length, 0),
        pages: pages.map(p => ({ pageId: p.pageId, offset: p.offset, rowCount: p.records.length, pageHash: hash(p) })), terminalPageId: pages.at(-1)?.pageId ?? 'missing' };
    });
    repin();
  }
  function repin() { context.manifestHash = hash(manifest); }
  setRows(['a', 'b', 'c'].map(k => registration(k)), [score('a', 795), score('b', 900), score('c', 850)]);
  return { compiled, context, bundle, setRows, seal, repin, assess: () => assessSyntheticExamEvidence(compiled, context, bundle) };
}
