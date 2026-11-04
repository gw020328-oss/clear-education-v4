import {validateConfig} from './config.mjs';
import {walletChoices, selectedIdentity, connectSelectedWallet} from './privy-adapter.mjs';
import {discoverMetaMask, requestMetaMaskAddress, connectMetaMask} from './metamask-adapter.mjs';
import {createClearSession} from './clear-session.mjs';
import {createSameOriginApi} from '../application/api-client.mjs';
import {bounded} from './provider-boundary.mjs';
import {createNativeMoodleLogin} from './moodle-native-login.mjs';
import {MOODLE_WALLET_VERSION, validateCourseWalletView, validateCourseWalletCommand} from './moodle-native-contract.mjs';

const check = (ok, code) => { if (!ok) throw Error(code); };
export function createCourseWalletController({config, sdk, target, onState, fetch: fetchImpl = globalThis.fetch,
  sessionFactory = createClearSession, loginFactory = createNativeMoodleLogin}) {
  const c = validateConfig(config), role = config.role;
  check(c.surface === 'MOODLE_NATIVE' && ['participant', 'operator'].includes(role), 'MOODLE_WALLET_CONFIG');
  const api = createSameOriginApi({origin: c.origin, fetch: fetchImpl});
  const moodle = loginFactory({config, api, fetch: fetchImpl, locks: target.navigator.locks});
  let epoch = 0, sequence = 0, closed = false, revoking = false, revokeUnknown = false;
  let phase = 'IDLE', error = null, busy = null, selected = null, network = false, authenticated = false;
  let wallet = null, session = null, closing = null, candidates = [], providers = [];
  let cancellation = null;
  let authExpiry = 0, expiryTimer;
  let snapshot = {ready: false, authenticated: false, user: null, wallets: [], walletsReady: false, externalWalletsDisabled: true};
  const selector = kind => kind + '-' + epoch + '-' + (++sequence);
  function allowed() {
    if (closed) return [];
    if (cancellation) return [];
    if (revoking || revokeUnknown) return ['sign-out'];
    if (busy) return ['cancel'];
    if (phase === 'CONNECTION_PENDING') return ['finish-connection', 'sign-out'];
    if (authenticated) return ['sign-out'];
    const actions = [];
    if (role === 'participant' && snapshot.ready && !snapshot.authenticated) actions.push('connect-google');
    if (role === 'operator' && providers.length) actions.push('connect-metamask');
    if (candidates.length) actions.push('select-wallet');
    if (selected) actions.push('check-network');
    if (network && wallet) actions.push('sign-in');
    if (role === 'participant' && snapshot.authenticated) actions.push('sign-out');
    return actions;
  }
  function emit() {
    const view = validateCourseWalletView({version: MOODLE_WALLET_VERSION, role, phase,
      busy: !!busy || revoking || !!cancellation, providers: providers.map(p => ({providerId: p.selector})),
      choices: candidates.map(p => ({choiceId: p.selector, address: p.address})), selectedChoiceId: selected?.selector ?? null,
      networkReady: network, authenticated, allowedActions: allowed(), error});
    try { onState(view); } catch { /* Rendering cannot change authority. */ }
    return view;
  }
  function current(stamp, signal) { check(!closed && stamp === epoch && !signal.aborted, 'CANCELLED'); }
  async function release() {
    if (closing) return closing;
    const priorSession = session, priorWallet = wallet;
    clearTimeout(expiryTimer); authExpiry = 0;
    wallet = null; network = authenticated = false;
    priorWallet?.dispose();
    if (!priorSession) return;
    revoking = true; emit();
    closing = (async () => {
      try { await priorSession.dispose(); session = null; revokeUnknown = false; }
      catch { revokeUnknown = true; throw Error('REVOCATION_UNKNOWN'); }
      finally { revoking = false; closing = null; emit(); }
    })();
    return closing;
  }
  function cancel(code = 'CANCELLED') {
    if (cancellation) return cancellation;
    epoch++; busy?.abort(); busy = null; phase = code === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';
    moodle.invalidate?.();
    selected = null; candidates = []; network = authenticated = false;
    error = {code, outcome: 'UNKNOWN'};
    // Retire selector generations even when discovery metadata stays unchanged.
    providers = providers.map(p => ({...p, selector: selector('provider')}));
    cancellation = (async () => {
      try { await release(); await moodle.end(AbortSignal.timeout(13000)); }
      catch { error = {code: revokeUnknown ? 'REVOCATION_UNKNOWN' : 'UNAVAILABLE', outcome: 'UNKNOWN'}; }
      finally { cancellation = null; emit(); }
    })();
    emit(); return cancellation;
  }
  function update(value) {
    if (closed || role !== 'participant') return;
    snapshot = {...value, externalWalletsDisabled: true};
    let next;
    try { next = walletChoices(snapshot.user, snapshot.wallets); }
    catch { void cancel('WALLET_CHANGED'); return; }
    if (selected && !next.some(p => p.sdkUserId === selected.sdkUserId && p.walletId === selected.walletId && p.address === selected.address)) {
      void cancel('WALLET_CHANGED'); return;
    }
    if (wallet) {
      try { selectedIdentity(snapshot, selected, c.chainId); }
      catch { void cancel('WALLET_CHANGED'); return; }
    }
    candidates = next.slice(0,32).map(p => ({...p, selector: candidates.find(old => old.sdkUserId === p.sdkUserId
      && old.walletId === p.walletId && old.address === p.address)?.selector ?? selector('choice')}));
    if (!busy && !authenticated && !selected && candidates.length) phase = 'CHOOSING';
    emit();
  }
  const stopDiscovery = role === 'operator' ? discoverMetaMask(target, list => {
    if (closed) return;
    providers = list.slice(0,16).map(p => ({...p, selector: providers.find(old => old.id === p.id)?.selector ?? selector('provider')}));
    emit();
  }) : () => {};
  async function dispatch(input) {
    if (authExpiry && Date.now() >= authExpiry * 1000) { await cancel('EXPIRED'); return; }
    const command = validateCourseWalletCommand(input);
    check(!closed && allowed().includes(command.action), 'MOODLE_WALLET_ACTION_NOT_ALLOWED');
    if (command.action === 'cancel') { await cancel(); return; }
    const controller = new AbortController(), signal = controller.signal, stamp = epoch;
    busy = controller; error = null; emit();
    try {
      await bounded(async () => {
        if (command.action === 'connect-google') {
          phase = 'CONNECTING'; emit(); await sdk.login(); current(stamp,signal);
        } else if (command.action === 'connect-metamask') {
          const provider = providers.find(p => p.selector === command.providerId); check(provider, 'STALE_SELECTION');
          await release(); current(stamp,signal); selected = null; candidates = []; phase = 'CONNECTING'; emit();
          const address = await requestMetaMaskAddress(provider.provider, signal); current(stamp,signal);
          candidates = [{...provider, address, selector: selector('choice')}]; phase = 'CHOOSING';
        } else if (command.action === 'select-wallet') {
          const choice = candidates.find(p => p.selector === command.choiceId); check(choice, 'STALE_SELECTION');
          await release(); current(stamp,signal); selected = choice; phase = 'SELECTED';
        } else if (command.action === 'check-network') {
          check(selected, 'STALE_SELECTION'); await release(); current(stamp,signal);
          phase = 'CHECKING_NETWORK'; emit(); let boundary;
          const onInvalidate = () => { if (wallet === boundary) void cancel('WALLET_CHANGED'); };
          if (role === 'participant') {
            await bounded(() => selected.wallet.switchChain(c.chainId), {signal}); current(stamp,signal);
            boundary = await connectSelectedWallet({readSnapshot: () => snapshot, selection: selected, chainId: c.chainId,
              signal, onInvalidate, timeoutMs: 120000});
          } else boundary = await connectMetaMask({choice: selected, address: selected.address, readChoice: () => selected, config: c, signal, onInvalidate});
          try { current(stamp,signal); } catch (e) { boundary.dispose(); throw e; }
          wallet = boundary;
          const rpc = async (method, params) => {
            const response = await fetchImpl(c.rpcUrl, {method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
              headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
            check(response.ok && !response.redirected, 'NETWORK_UNAVAILABLE');
            const result = await response.json(); current(stamp,signal); check(!result.error, 'NETWORK_UNAVAILABLE'); return result.result;
          };
          check(BigInt(await rpc('eth_chainId', [])) === BigInt(c.chainId)
            && await rpc('eth_getCode', [selected.address, 'latest']) === '0x', 'NETWORK_UNAVAILABLE');
          await wallet.guard(signal); current(stamp,signal); network = true; phase = 'NETWORK_READY';
        } else if (command.action === 'sign-in') {
          check(network && wallet && !session, 'AUTH_REQUIRED'); phase = 'SIGNING_IN'; emit();
          await moodle.begin(signal); current(stamp,signal);
          session = sessionFactory({wallet, api, config: c});
          const result = await session.authenticate(); current(stamp,signal);
          const actor = await session.assertSession(signal); current(stamp,signal); check(result.role === role, 'ROLE_CHANGED');
          check(Number.isSafeInteger(actor.expiresAt) && actor.expiresAt * 1000 > Date.now(), 'AUTH_REQUIRED');
          authExpiry = actor.expiresAt;
          expiryTimer = setTimeout(() => { void cancel('EXPIRED'); }, Math.min(2147483647, authExpiry * 1000 - Date.now()));
          authenticated = true; phase = 'AUTHENTICATED'; emit();
          await moodle.complete(session, signal); current(stamp,signal); phase = 'CONNECTION_PENDING';
        } else if (command.action === 'finish-connection') {
          phase = 'CONFIRMING_CONNECTION'; emit(); await session.assertSession(signal); current(stamp,signal);
          await moodle.finish(signal); current(stamp,signal); phase = 'CONNECTED';
        } else if (command.action === 'sign-out') {
          phase = 'REVOKING'; emit(); await release(); current(stamp,signal);
          await moodle.end(signal); current(stamp,signal);
          if (role === 'participant') { await sdk.logout(); current(stamp,signal); }
          epoch++; selected = null; candidates = []; phase = 'IDLE';
          providers = providers.map(p => ({...p, selector: selector('provider')}));
        }
      }, {signal, timeoutMs: 120000});
    } catch (cause) {
      if (stamp === epoch && !closed) {
        controller.abort();
        // A timed out signature is never reused. Revoke even an uncertain login.
        try { await release(); } catch {}
        try { await moodle.end(AbortSignal.timeout(13000)); } catch {}
        phase = 'ERROR';
        const code = revokeUnknown ? 'REVOCATION_UNKNOWN' : ['STALE_SELECTION','NETWORK_UNAVAILABLE','AUTH_REQUIRED','ROLE_CHANGED','CANCELLED'].includes(cause?.message)
          ? cause.message : cause?.code === 4001 || cause?.message === 'WALLET_REJECTED' ? 'WALLET_REJECTED' : 'UNAVAILABLE';
        error = {code, outcome: cause?.outcome === 'NOT_SENT' ? 'NOT_SENT' : 'UNKNOWN'};
      }
    } finally { if (busy === controller) busy = null; emit(); }
  }
  emit();
  return Object.freeze({dispatch, update, async destroy() {
    if (closed) return;
    closed = true; epoch++; busy?.abort(); busy = null; stopDiscovery();
    moodle.invalidate?.();
    selected = null; candidates = []; providers = []; phase = 'CLOSED'; network = authenticated = false;
    try { await cancellation; await release(); await moodle.end(AbortSignal.timeout(13000)); } catch {}
    emit();
  }});
}
