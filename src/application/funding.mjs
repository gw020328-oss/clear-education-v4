import { id, verifyTypedData } from 'ethers';
import { canonical, exactKeys, hash32, requireRule } from '../policy/values.mjs';
import { finalDigest, finalTerms } from '../vault/encoding.mjs';

// Internal extension: chain reader is configured by the server, never a body
// field. Await RPC outside DB transactions, then recheck actor and state.
export function createFundingService({ db, transaction, session, owned, policy, currentPolicy, clock, digest, secret,
  hexSecret, signatureShape, view, vaultReader, chainId, instanceId }) {
  const reader = () => { requireRule(vaultReader, 'VAULT_NOT_CONFIGURED'); return vaultReader; };
  function runtime(policyHash) {
    const row = db.prepare('SELECT * FROM runtime_configs WHERE policy_hash=?').get(policyHash);
    requireRule(row, 'RUNTIME_NOT_BOUND'); return JSON.parse(row.record);
  }
  function finalState(id) { return db.prepare('SELECT * FROM funding WHERE application_id=?').get(id); }
  function sponsor(context, id) {
    const s = session(context, true), a = owned(id, s, true), record = runtime(a.policy_hash);
    requireRule(s.role === 'operator' && s.wallet === record.config.sponsor, 'SPONSOR_REQUIRED'); return { s, a, record };
  }
  function typedFor(record, a, nonce, issuedAt, expiresAt) {
    return finalTerms(record, { applicationId: a.id, learner: a.wallet, policyHash: a.policy_hash,
      runtimeConfigHash: record.runtimeConfigHash, nonce: '0x' + nonce, signedAt: String(issuedAt), expiresAt: String(expiresAt) });
  }
  return {
    view(a) {
      const f = finalState(a.id); if (!f) return {};
      return { state: f.state, consentScope: 'CONTRACT', contractConsentRequired: false,
        finalConsentDigest: f.consent_digest, runtimeConfigHash: f.runtime_hash, funded: f.state === 'ENROLLED',
        fundingEvidence: f.evidence ? JSON.parse(f.evidence) : null };
    },
    methods: {
      async bindRuntime(context, body) {
        exactKeys(body, ['policyHash'], 'RUNTIME_SCHEMA');
        requireRule(session(context, true).role === 'operator', 'FORBIDDEN');
        const observed = await reader().inspect();
        return transaction(() => {
          const s = session(context, true), p = currentPolicy(body.policyHash).policy, c = observed.config;
          requireRule(s.role === 'operator' && s.wallet === c.sponsor, 'SPONSOR_REQUIRED');
          requireRule(observed.deployment.chainId === chainId && c.instanceId === instanceId && c.configVersion === '4', 'RUNTIME_ENVIRONMENT');
          requireRule(c.policyHash === body.policyHash && c.cohortId === id(p.cohortId) && p.tokenDecimals === 6, 'RUNTIME_POLICY');
          for (const field of ['amount', 'enrollmentStart', 'enrollmentUntil', 'normalSubmitFrom', 'normalSubmitAt', 'supplementEndAt', 'claimUntil']) {
            requireRule(c[field] === p[field], 'RUNTIME_POLICY');
          }
          const existing = db.prepare('SELECT * FROM runtime_configs WHERE cohort_id=?').get(p.cohortId);
          if (existing) requireRule(existing.record === canonical(observed), 'RUNTIME_ALREADY_BOUND');
          else db.prepare('INSERT INTO runtime_configs VALUES(?,?,?,?)').run(observed.runtimeConfigHash, body.policyHash, p.cohortId, canonical(observed));
          return observed;
        });
      },
      getRuntime(context, policyHash) { session(context); policy(policyHash); return runtime(policyHash); },
      async finalConsentChallenge(context, applicationId) {
        const s = session(context, true), a = owned(applicationId, s), record = runtime(a.policy_hash);
        requireRule(s.role === 'participant' && a.state === 'TERMS_ACCEPTED', 'APPLICATION_STATE');
        const observed = await reader().inspect();
        requireRule(canonical(observed) === canonical(record), 'RUNTIME_CHANGED');
        const previous = finalState(applicationId);
        if (previous) {
          const expiresAt = JSON.parse(previous.typed_data).message.expiresAt;
          requireRule(previous.state !== 'ENROLLED' && clock() >= Number(expiresAt), 'FINAL_CONSENT_EXISTS');
          // Expired authorizations can be renewed only after chain time has
          // passed expiry and no enrollment exists. Recover mined funding first.
          await reader().requireUnfundedAfter(applicationId, expiresAt);
        }
        return transaction(() => {
          const currentSession = session(context, true), current = owned(applicationId, currentSession);
          currentPolicy(current.policy_hash);
          const latest = finalState(applicationId);
          requireRule(previous ? latest?.consent_digest === previous.consent_digest && latest.state !== 'ENROLLED' : !latest, 'FINAL_CONSENT_EXISTS');
          if (previous) {
            db.prepare('DELETE FROM funding WHERE application_id=?').run(applicationId);
            db.prepare('UPDATE final_challenges SET consumed_at=? WHERE application_id=? AND consumed_at IS NULL').run(clock(), applicationId);
          }
          const t = clock(), expires = Math.min(t + 600, Number(record.config.enrollmentUntil) + 1), nonce = secret();
          db.prepare('UPDATE final_challenges SET consumed_at=? WHERE application_id=? AND session_digest=? AND consumed_at IS NULL').run(t, applicationId, currentSession.digest);
          db.prepare('INSERT INTO final_challenges VALUES(?,?,?,?,?,?,NULL)').run(digest(nonce), applicationId, currentSession.digest, record.runtimeConfigHash, t, expires);
          return { ...typedFor(record, current, nonce, t, expires), runtime: record };
        });
      },
      finalConsent(context, applicationId, body) {
        exactKeys(body, ['nonce', 'signature'], 'FINAL_CONSENT_SCHEMA'); hexSecret(body.nonce); signatureShape(body.signature);
        return transaction(() => {
          const s = session(context, true), a = owned(applicationId, s), record = runtime(a.policy_hash);
          requireRule(s.role === 'participant' && a.state === 'TERMS_ACCEPTED', 'APPLICATION_STATE');
          const existing = finalState(applicationId);
          if (existing) {
            requireRule(existing.signature === body.signature && JSON.parse(existing.typed_data).message.nonce === '0x' + body.nonce, 'FINAL_CONSENT_CONFLICT');
            return view(a);
          }
          currentPolicy(a.policy_hash);
          const n = db.prepare('SELECT * FROM final_challenges WHERE digest=?').get(digest(body.nonce)), t = clock();
          requireRule(n && n.application_id === applicationId && n.session_digest === s.digest && n.runtime_hash === record.runtimeConfigHash
            && n.consumed_at === null && n.issued_at <= t && t < n.expires_at, 'FINAL_CONSENT_CHALLENGE');
          const typed = typedFor(record, a, body.nonce, n.issued_at, n.expires_at);
          let signer; try { signer = verifyTypedData(typed.domain, typed.types, typed.message, body.signature); } catch { signer = null; }
          requireRule(signer === a.wallet, 'SIGNATURE');
          db.prepare('UPDATE final_challenges SET consumed_at=? WHERE digest=?').run(t, n.digest);
          db.prepare("INSERT INTO funding VALUES(?,?,'CONSENTED',?,?,?,NULL)").run(applicationId, record.runtimeConfigHash, canonical(typed), body.signature, finalDigest(typed));
          return view(a);
        });
      },
      async fundingIntent(context, applicationId) {
        const first = sponsor(context, applicationId), observed = await reader().inspect();
        requireRule(canonical(observed) === canonical(first.record), 'RUNTIME_CHANGED');
        return transaction(() => {
          const { a, record } = sponsor(context, applicationId), f = finalState(applicationId);
          requireRule(f && f.state !== 'ENROLLED', 'FUNDING_STATE'); currentPolicy(a.policy_hash);
          const typed = JSON.parse(f.typed_data);
          requireRule(clock() < Number(typed.message.expiresAt), 'FINAL_CONSENT_EXPIRED');
          const tx = reader().fundingTransaction(record, typed, f.signature);
          db.prepare("UPDATE funding SET state='FUNDING_PENDING' WHERE application_id=?").run(applicationId);
          return { transaction: tx, application: view(a), approval: { token: record.config.token, spender: record.deployment.vaultAddress, amount: record.config.amount } };
        });
      },
      async confirmFunding(context, applicationId, body) {
        exactKeys(body, ['transactionHash'], 'FUNDING_SCHEMA'); hash32(body.transactionHash, 'TRANSACTION_HASH');
        const initial = sponsor(context, applicationId), f = finalState(applicationId);
        requireRule(f, 'FUNDING_STATE');
        const evidence = await reader().fundingEvidence(initial.record, JSON.parse(f.typed_data), f.signature, body.transactionHash);
        return transaction(() => {
          const { a } = sponsor(context, applicationId), latest = finalState(applicationId);
          requireRule(latest?.consent_digest === f.consent_digest, 'FINAL_CONSENT_CONFLICT');
          requireRule(!latest.evidence || canonical(JSON.parse(latest.evidence)) === canonical(evidence), 'FUNDING_CONFLICT');
          db.prepare("UPDATE funding SET state='ENROLLED',evidence=? WHERE application_id=?").run(canonical(evidence), applicationId);
          return view(a);
        });
      },
    },
  };
}
