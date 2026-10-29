import {getAddress, hexlify, toUtf8Bytes, TypedDataEncoder, verifyMessage, verifyTypedData} from 'ethers';

const check = (ok, code) => { if (!ok) throw Error(code); };
// Includes provider reads, not just the signing prompt. Never waits indefinitely
// for an SDK that ignores cancellation; late results cannot escape this scope.
export function bounded(run, {signal, timeoutMs = 30000} = {}) {
  return new Promise((resolve, reject) => {
    let timer;
    const stop = () => finish(reject, Error('WALLET_CONTEXT_CANCELLED'));
    const finish = (fn, value) => { clearTimeout(timer); signal?.removeEventListener('abort', stop); fn(value); };
    signal?.addEventListener('abort', stop, {once: true});
    timer = setTimeout(() => finish(reject, Error('WALLET_TIMEOUT')), timeoutMs);
    if (signal?.aborted) return stop();
    Promise.resolve().then(() => { check(!signal?.aborted, 'WALLET_CONTEXT_CANCELLED'); return run(); })
      .then(v => finish(resolve, v), e => finish(reject, e));
  });
}

export function pinnedWallet({provider, identity, readIdentity, onInvalidate = () => {}, timeoutMs = 30000}) {
  check(provider && typeof provider.request === 'function' && typeof provider.on === 'function'
    && typeof provider.removeListener === 'function' && typeof readIdentity === 'function', 'WALLET_CONFIG');
  check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120000, 'WALLET_CONFIG');
  check(typeof identity?.sdkUserId === 'string' && identity.sdkUserId.length > 0
    && typeof identity.walletId === 'string' && identity.walletId.length > 0
    && Number.isSafeInteger(identity.chainId) && identity.chainId > 0, 'WALLET_IDENTITY');
  const pin = Object.freeze({...identity, address: getAddress(identity.address)});
  const lifetime = new AbortController();
  let busy = false;
  const invalidate = () => {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    // Notification errors must never undo cancellation or leak from SDK events.
    try { Promise.resolve(onInvalidate()).catch(() => {}); } catch {}
  };
  const events = ['accountsChanged', 'chainChanged', 'disconnect'];
  for (const event of events) provider.on(event, invalidate);
  async function guard(signal = lifetime.signal) {
    try {
      check(!lifetime.signal.aborted && !signal.aborted, 'WALLET_CONTEXT_CANCELLED');
      const current = await bounded(readIdentity, {signal, timeoutMs});
      const accounts = await bounded(() => provider.request({method: 'eth_accounts'}), {signal, timeoutMs});
      const chain = await bounded(() => provider.request({method: 'eth_chainId'}), {signal, timeoutMs});
      check(!lifetime.signal.aborted && !signal.aborted, 'WALLET_CONTEXT_CANCELLED');
      check(current && ['sdkUserId', 'walletId', 'role'].every(k => current[k] === pin[k])
        && getAddress(current.address) === pin.address, 'WALLET_IDENTITY_CHANGED');
      check(current.chainId === pin.chainId && /^0x[0-9a-f]+$/i.test(chain)
        && BigInt(chain) === BigInt(pin.chainId), 'WALLET_CHAIN_CHANGED');
      check(Array.isArray(accounts) && accounts.length === 1 && getAddress(accounts[0]) === pin.address, 'WALLET_ACCOUNT_CHANGED');
    } catch (error) { invalidate(); throw error; }
  }
  async function sign(method, params, verify, {signal, expiresAt, now = () => Math.floor(Date.now() / 1000)} = {}) {
    check(!busy, 'WALLET_BUSY');
    check(Number.isSafeInteger(expiresAt) && now() < expiresAt, 'SIGNATURE_EXPIRED');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const signals = [lifetime.signal, signal].filter(Boolean);
    for (const s of signals) { s.addEventListener('abort', cancel, {once: true}); if (s.aborted) cancel(); }
    const deadline = setTimeout(cancel, Math.min(timeoutMs, Math.max(1, (expiresAt - now()) * 1000)));
    busy = true;
    try {
      await guard(controller.signal);
      let signature;
      try { signature = await bounded(() => provider.request({method, params}), {signal: controller.signal, timeoutMs}); }
      catch (error) { throw Error(controller.signal.aborted ? 'WALLET_CONTEXT_CANCELLED' : error?.code === 4001 ? 'WALLET_REJECTED' : 'WALLET_SIGN_FAILED'); }
      await guard(controller.signal);
      check(now() < expiresAt, 'SIGNATURE_EXPIRED');
      let valid = false;
      try { valid = typeof signature === 'string' && /^0x[0-9a-fA-F]{130}$/.test(signature) && getAddress(verify(signature)) === pin.address; } catch {}
      check(valid, 'WALLET_SIGNATURE_INVALID');
      return signature;
    } finally {
      busy = false; clearTimeout(deadline);
      for (const s of signals) s.removeEventListener('abort', cancel);
    }
  }
  return Object.freeze({pin, invalidate, guard,
    personal(message, options) {
      check(typeof message === 'string' && toUtf8Bytes(message).length <= 16384, 'MESSAGE_SHAPE');
      return sign('personal_sign', [hexlify(toUtf8Bytes(message)), pin.address], s => verifyMessage(message, s), options);
    },
    typed(expected, options) {
      const p = structuredClone(expected);
      check(BigInt(p.domain.chainId) === BigInt(pin.chainId), 'TYPED_CHAIN');
      return sign('eth_signTypedData_v4', [pin.address, JSON.stringify(TypedDataEncoder.getPayload(p.domain, p.types, p.message))],
        s => verifyTypedData(p.domain, p.types, p.message, s), options);
    },
    dispose() { invalidate(); for (const event of events) provider.removeListener(event, invalidate); },
  });
}
