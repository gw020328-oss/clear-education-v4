import { Wallet } from 'ethers';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { fixture as vaultFixture } from '../vault/fixture.mjs';

export async function fixture(t, { advance = true, policyDraft } = {}) {
  const f = await vaultFixture(t, { policyDraft }), accepted = await f.accepted(), applicationId = accepted.a.applicationId;
  await (await f.token.approve(f.pin.vaultAddress, f.config.amount)).wait();
  const intent = await f.app.service.fundingIntent(f.app.operatorContext, applicationId);
  const tx = await f.signer.sendTransaction(intent.transaction); await tx.wait();
  const funded = await f.app.service.confirmFunding(f.app.operatorContext, applicationId, { transactionHash: tx.hash });
  if (advance) await f.setTime(f.config.normalSubmitFrom);
  const context = await f.app.login(f.app.alice), owner = Wallet.createRandom();
  const body = { ownerPublicKey: owner.signingKey.publicKey };
  const create = (key = 'proof-create', input = body, ctx = context) => f.app.service.createProofSession(ctx, applicationId, input, key);
  const signed = async p => ({ requestNonce: p.typedData.message.requestNonce, signature: await f.sign(p.typedData) });
  const authorize = (p, input, ctx = context) => f.app.service.authorizeProofSession(ctx, applicationId, p.proofSessionId, input);
  const get = p => f.app.service.getProofSession(context, applicationId, p.proofSessionId);
  const cancel = p => f.app.service.cancelProofSession(context, applicationId, p.proofSessionId, {});
  const sql = fn => { const db = new DatabaseSync(join(f.app.directory, 'applications.sqlite')); try { return fn(db); } finally { db.close(); } };
  return { ...f, accepted, applicationId, funded, context, owner, body, create, signed, authorize, get, cancel, sql };
}
