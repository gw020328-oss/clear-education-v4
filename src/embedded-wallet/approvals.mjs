import {getAddress, sha256, toUtf8Bytes} from 'ethers';
import {recipientRegistration} from '../bootcamp/recipient-registration.mjs';
import {canonical} from '../policy/values.mjs';
const check = (ok, code) => { if (!ok) throw Error(code); };
const equal = (a, b) => canonical(a) === canonical(b);
const prefix = 'CLEAR HackerRank evidence observation approval; not a payment authorization.\n';

// These return signatures to the caller only. The normal client remains the
// sole submitter and preserves server nonce/session/CAS/owner verification.
export function createApprovalSigner({wallet, session, normal, now = () => Math.floor(Date.now() / 1000)}) {
  async function participant(signal) {
    const s = await session.assertSession(signal); check(s.role === 'participant', 'FORBIDDEN');
    check(getAddress(s.wallet) === wallet.pin.address, 'APPROVAL_OWNER');
  }
  return Object.freeze({
    async source(reviewed, expected, {signal} = {}) {
      reviewed = structuredClone(reviewed); expected = structuredClone(expected);
      await participant(signal);
      check(reviewed.purpose === 'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'
        && reviewed.message.startsWith(prefix), 'SOURCE_PURPOSE');
      const raw = reviewed.message.slice(prefix.length), r = JSON.parse(raw);
      check(raw === canonical(r) && reviewed.requestHash === sha256(toUtf8Bytes('CLEAR-HACKERRANK-REQUEST.1\n' + raw)), 'SOURCE_MESSAGE');
      check(r.version === 'clear-hackerrank-request.1' && r.criterionId === 'python-basic-certificate'
        && r.applicationId === reviewed.applicationId && getAddress(r.participantWallet) === wallet.pin.address
        && Number.isSafeInteger(r.issuedAt) && r.issuedAt <= now() && now() < reviewed.expiresAt
        && Number.isSafeInteger(r.expiresAt) && r.expiresAt > r.issuedAt && r.expiresAt - r.issuedAt <= 900
        && /^0x[0-9a-f]{64}$/.test(r.nonce) && BigInt(r.nonce) !== 0n
        && reviewed.expiresAt <= r.expiresAt, 'SOURCE_CONTEXT');
      // expectedClaimOwner comes from the collector's trusted preparation, never
      // from wallet.pin.address and never defaulted from the message being signed.
      for (const key of ['applicationId','participantId','policyHash','runtimeMappingHash','audience','trustConfigHash','recipeHash','expectedClaimOwner','selectedCertificateId']) {
        check(Object.hasOwn(expected, key) && r[key] === expected[key], 'SOURCE_BINDING');
      }
      const current = await normal.pendingSourceSignature(reviewed.applicationId, {signal});
      check(equal(current, reviewed), 'SOURCE_STALE');
      const signature = await wallet.personal(reviewed.message, {signal, expiresAt: reviewed.expiresAt, now});
      await participant(signal);
      check(equal(await normal.pendingSourceSignature(reviewed.applicationId, {signal}), reviewed), 'SOURCE_STALE');
      check(now() < reviewed.expiresAt && !signal?.aborted, 'SOURCE_EXPIRED');
      return signature;
    },
    async registration(reviewed, expected, {signal} = {}) {
      reviewed = structuredClone(reviewed); expected = structuredClone(expected);
      await participant(signal);
      check(reviewed.applicationId === expected.applicationId && reviewed.role === 'PARTICIPANT'
        && reviewed.status === 'AWAITING_SIGNATURE' && reviewed.purpose === 'REGISTER_FIXED_RECIPIENT'
        && reviewed.calldataPublic === true, 'REGISTRATION_REVIEW');
      const p = reviewed.payload;
      const rebuilt = recipientRegistration({...p.domain, ...p.message, instanceId: p.domain.salt});
      check(equal(p, rebuilt) && p.domain.chainId === String(wallet.pin.chainId)
        && p.domain.salt === expected.instanceId && getAddress(p.domain.verifyingContract) === getAddress(expected.verifyingContract)
        && p.message.policyHash === expected.policyHash && p.message.runtimeMappingHash === expected.runtimeMappingHash
        && getAddress(expected.participant) === wallet.pin.address && p.message.participant === wallet.pin.address
        && p.message.recipient === wallet.pin.address, 'REGISTRATION_BINDING');
      const comparable = v => { const out = structuredClone(v); delete out.observedAt; return out; };
      const current = () => normal.recipientRegistration(reviewed.applicationId, {signal});
      check(equal(comparable(await current()), comparable(reviewed)), 'REGISTRATION_STALE');
      const signature = await wallet.typed(p, {signal, expiresAt: Number(p.message.deadline), now});
      await participant(signal);
      check(equal(comparable(await current()), comparable(reviewed)), 'REGISTRATION_STALE');
      check(now() < Number(p.message.deadline) && !signal?.aborted, 'REGISTRATION_EXPIRED');
      return signature;
    },
  });
}
