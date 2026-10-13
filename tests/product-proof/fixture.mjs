import { Wallet } from 'ethers';
import { fixture as proofFixture } from '../proof-sessions/fixture.mjs';
import { fixture as evidenceFixture, policyDraft } from '../exam-evidence/fixture.mjs';
import { ownerMessage, sourceMessage, PRODUCT_PROOF_VERSION } from '../../src/product-proof/contract.mjs';

export async function fixture(t, { collector, sourceSigner = Wallet.createRandom() } = {}) {
  const f = await proofFixture(t, { policyDraft: policyDraft(), proofSourceSigner: sourceSigner.address });
  const issued = await f.create('product', { ownerPublicKey: collector?.ownerPublicKey ?? f.owner.signingKey.publicKey });
  const session = await f.authorize(issued, await f.signed(issued));
  const evidence = evidenceFixture({ compiled: f.app.compiled, session });
  const source = async () => ({ profile: PRODUCT_PROOF_VERSION, bundle: structuredClone(evidence.bundle),
    sourceSignature: await sourceSigner.signMessage(sourceMessage(evidence.bundle.manifest)) });
  const signed = async () => { const input = await source(); return { ...input, ownerSignature: await f.owner.signMessage(ownerMessage(input)) }; };
  const accept = (input, options) => f.app.service.acceptProofEvidence(f.context, f.applicationId, session.proofSessionId, input, options);
  return { ...f, sourceSigner, issued, session, evidence, source, signed, accept,
    result: () => f.app.service.getProofResult(f.context, f.applicationId, session.proofSessionId),
    snapshot: () => f.app.service.getAcceptedExamSnapshot(f.context, f.applicationId, session.proofSessionId),
    rows: () => f.sql(db => db.prepare('SELECT count(*) n FROM proof_results').get().n) };
}
