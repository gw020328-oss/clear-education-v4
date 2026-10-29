import {createNormalBootcampClient} from '../bootcamp/normal-client.mjs';
import {createApprovalSigner} from './approvals.mjs';
import {validateConfig} from './config.mjs';
const check = (ok, code) => { if (!ok) throw Error(code); };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

// Adapter for the existing button-driven normal runner. Login has already been
// explicitly signed on this product host; no old diagnostic cookie is adopted.
export function createProductSession({session, wallet, config}) {
  const c = validateConfig(config);
  check(c.phase === 'ACTIVE_LOCAL_TEST', 'PRODUCT_NOT_ACTIVE');
  const normal = createNormalBootcampClient({request: (...args) => session.request(...args)});
  const signer = createApprovalSigner({wallet, session, normal});
  let registration = null, registrationPending = false, registrationUnknown = false;
  async function context(signal) {
    const actor = await session.assertSession(signal), b = await normal.session({signal});
    check(b.role === actor.role.toUpperCase(), 'PRODUCT_ROLE_CHANGED');
    check(actor.role === 'participant', 'FORBIDDEN');
    check(b.signingContext && b.applicationId, 'PRODUCT_APPLICATION_REQUIRED');
    const r = b.signingContext.registration, s = b.signingContext.source;
    check(r.applicationId === b.applicationId && s.applicationId === b.applicationId
      && r.instanceId === c.instanceId && r.policyHash === b.policyHash && s.policyHash === b.policyHash
      && r.runtimeMappingHash === b.runtimeMappingHash && s.runtimeMappingHash === b.runtimeMappingHash
      && r.participant.toLowerCase() === b.expectedPayment.recipient.toLowerCase(), 'PRODUCT_BINDING');
    return b;
  }
  const bridge = Object.freeze({
    publicRead: (...args) => session.request(...args), request: (...args) => session.request(...args),
    async network() { throw Error('PRODUCT_NETWORK_ALREADY_SELECTED'); },
    async login(host, {signal} = {}) {
      check(host.phase === 'ACTIVE_LOCAL_TEST' && host.origin === c.origin && host.chainId === c.chainId
        && host.network?.chainId === '0x'+c.chainId.toString(16)
        && host.network.rpcUrls?.length === 1 && host.network.rpcUrls[0] === c.rpcUrl, 'PRODUCT_HOST_CHANGED');
      const s = await session.assertSession(signal); return {wallet:s.wallet, role:s.role, expiresAt:s.expiresAt};
    },
    async sign(message, {signal} = {}) {
      const b = await context(signal), reviewed = await normal.pendingSourceSignature(b.applicationId,{signal});
      check(reviewed.message === message, 'SOURCE_STALE');
      return signer.source(reviewed,b.signingContext.source,{signal});
    },
    end: () => session.dispose(),
  });
  return Object.freeze({bridge,
    async readRegistration({signal} = {}) {
      check(!registrationPending && !registrationUnknown, 'REGISTRATION_RESULT_UNKNOWN');
      const b = await context(signal); check(b.role === 'PARTICIPANT', 'FORBIDDEN');
      const packet = await normal.recipientRegistration(b.applicationId,{signal});
      registration = {packet:structuredClone(packet),expected:structuredClone(b.signingContext.registration)};
      return structuredClone(packet);
    },
    async submitRegistration(reviewed,{signal} = {}) {
      check(!registrationPending && !registrationUnknown && registration && same(reviewed,registration.packet), 'REGISTRATION_REVIEW_REQUIRED');
      registrationPending = true; let sent = false;
      try {
        const b = await context(signal);
        check(same(b.signingContext.registration, registration.expected), 'REGISTRATION_BINDING');
        const signature = await signer.registration(reviewed,registration.expected,{signal});
        signal?.throwIfAborted();
        const latest = await context(signal);
        check(same(latest.signingContext.registration,registration.expected), 'REGISTRATION_BINDING');
        sent = true;
        return await normal.submitRecipientRegistration(b.applicationId,reviewed,signature,
          {idempotencyKey:'wallet-register-'+crypto.randomUUID(),signal});
      } catch(error) {
        if (sent && (error.outcome === 'UNKNOWN' || !Number.isInteger(error.status))) registrationUnknown = true;
        throw error;
      } finally {registrationPending=false; registration=null;}
    },
    get registrationUnknown() {return registrationUnknown;},
  });
}
