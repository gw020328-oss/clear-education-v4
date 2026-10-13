import { EventEmitter } from 'node:events';
import { Wallet, id, TypedDataEncoder } from 'ethers';
import { runtimeHash, vaultDomain } from '../../src/vault/encoding.mjs';
import { proofBindingTypes } from '../../src/application/proof-binding.mjs';
import { createWalletClient } from '../../src/application/wallet-client.mjs';

export const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
export async function browser(t) {
  const wallet = Wallet.createRandom(), owner = Wallet.createRandom(), other = Wallet.createRandom(), chainId = 31337;
  let now = 1800000000, account = wallet.address, chain = '0x7a69', hook = async () => {}, apiHook = async () => {};
  let reads = 0, signs = 0, posts = 0, lastBody;
  const config = { configVersion: '4', instanceId: id('synthetic-instance'), cohortId: id('synthetic-cohort'), policyHash: id('synthetic-policy'),
    token: other.address, sponsor: other.address, issuer: other.address, outageSigner: other.address, amount: '50',
    enrollmentStart: String(now - 2000), enrollmentUntil: String(now - 1000), normalSubmitFrom: String(now - 100),
    normalSubmitAt: String(now + 5000), supplementEndAt: String(now + 10000), claimUntil: String(now + 20000) };
  const runtime = { config, runtimeConfigHash: runtimeHash(config), deployment: { chainId, vaultAddress: other.address } };
  const applicationId = id('synthetic-application'), proofSessionId = id('synthetic-session');
  const session = { applicationId, proofSessionId, state: 'ISSUED', issuedAt: String(now), expiresAt: String(now + 1800),
    authorizedAt: null, bindingDigest: null, issuanceEvidence: {}, authorizationEvidence: null, dataMode: 'SYNTHETIC',
    collectionEnabled: false, proofVerified: false, paymentAllowed: false,
    typedData: { domain: vaultDomain(runtime), types: structuredClone(proofBindingTypes), primaryType: 'ProofSessionBindingV4',
      message: { applicationId, learner: wallet.address, policyHash: config.policyHash, runtimeConfigHash: runtime.runtimeConfigHash,
        proofSessionId, requestNonce: id('synthetic-request'), ownerPublicKey: owner.signingKey.publicKey, expiresAt: String(now + 1800) } } };
  let current = structuredClone(session);
  const provider = new EventEmitter();
  provider.request = async ({ method, params }) => {
    if (method === 'eth_signTypedData_v4') signs++;
    const replacement = await hook(method, params);
    if (replacement !== undefined) return replacement;
    if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [account];
    if (method === 'eth_chainId') return chain;
    if (method === 'eth_signTypedData_v4') {
      const typed = JSON.parse(params[1]); delete typed.types.EIP712Domain;
      return wallet.signTypedData(typed.domain, typed.types, typed.message);
    }
    throw new Error('unexpected provider call');
  };
  const path = `/applications/${applicationId}/proof-sessions/${proofSessionId}`;
  const api = async (url, options = {}) => {
    if (url === '/auth/session') return { wallet: wallet.address, role: 'participant', csrf: 'synthetic-csrf' };
    if (url === path && (options.method ?? 'GET') === 'GET') { reads++; await apiHook('GET', options); return structuredClone(current); }
    if (url === path + '/authorize' && options.method === 'POST') {
      posts++; lastBody = options.body;
      const { domain, types, message } = current.typedData;
      current = { ...current, state: 'AUTHORIZED', authorizedAt: String(now), bindingDigest: TypedDataEncoder.hash(domain, types, message), authorizationEvidence: {} };
      await apiHook('POST', options); return structuredClone(current);
    }
    throw new Error('unexpected API call');
  };
  const client = createWalletClient({ provider, api, chainId, clock: () => now });
  t.after(() => client.dispose()); await client.connect(); await client.resume();
  return { client, provider, wallet, owner, other, runtime, session, applicationId, api,
    approve: (options = {}) => client.authorizeProofSession(applicationId, session, runtime, { ownerPublicKey: owner.signingKey.publicKey, ...options }),
    setHook(fn) { hook = fn; }, setApiHook(fn) { apiHook = fn; }, mutate(fn) { fn(current); },
    setAccount(value) { account = value; }, setChain(value) { chain = value; }, advance(seconds) { now += seconds; },
    get time() { return now; }, get reads() { return reads; }, get signs() { return signs; }, get posts() { return posts; }, get lastBody() { return lastBody; } };
}
