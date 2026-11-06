import {createCancelDiagnostic} from './cancel-diagnostics.mjs';
import {validateConfig} from './config.mjs';
import {walletChoices, selectedIdentity, connectSelectedWallet} from './privy-adapter.mjs';
import {discoverMetaMask, requestMetaMaskAddress, connectMetaMask} from './metamask-adapter.mjs';
import {createClearSession} from './clear-session.mjs';
import {createSameOriginApi} from '../application/api-client.mjs';
import {bounded} from './provider-boundary.mjs';
import {createNativeMoodleLogin} from './moodle-native-login.mjs';
import {moodleCommandDigest} from './moodle-command.mjs';
import {createNativeWorkflow,validateNativeWorkflowCommand,nativeWorkflowIsRead} from './moodle-native-workflow.mjs';
import {MOODLE_WALLET_VERSION, validateCourseWalletView, validateCourseWalletCommand} from './moodle-native-contract.mjs';
import {REVIEW_WINDOW} from '../../tools/bootcamp/test-client/review-window.js';

const check = (ok, code) => { if (!ok) throw Error(code); };
export function createCourseWalletController({config, sdk, target, onState, fetch: fetchImpl = globalThis.fetch,
  sessionFactory = createClearSession, loginFactory = createNativeMoodleLogin}) {
  const c = validateConfig(config), role = config.role;
  let diagnosticStorage;try { diagnosticStorage=target.localStorage; } catch {}
  const cancellationDiagnostic=createCancelDiagnostic(diagnosticStorage);
  check(c.surface === 'MOODLE_NATIVE' && ['participant', 'operator'].includes(role), 'MOODLE_WALLET_CONFIG');
  const api = createSameOriginApi({origin: c.origin, fetch: fetchImpl});
  const moodle = loginFactory({config, api, fetch: fetchImpl, locks: target.navigator.locks});
  let epoch = 0, sequence = 0, closed = false, revoking = false, revokeUnknown = false;
  let phase = 'IDLE', error = null, busy = null, selected = null, network = false, authenticated = false;
  let wallet = null, session = null, workflow = null, closing = null, candidates = [], providers = [];
  let cancellation = null, moodleEndUnknown = false, endingMoodle = null;
  let authExpiry = 0, expiryTimer;
  let reviewTimer, reviewRead;
  let snapshot = {ready: false, authenticated: false, user: null, wallets: [], walletsReady: false, externalWalletsDisabled: true};
  const selector = kind => kind + '-' + epoch + '-' + (++sequence);
  function allowed() {
    if (closed) return [];
    if (cancellation) return [];
    if (moodleEndUnknown) return revokeUnknown && !busy ? ['sign-out'] : [];
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
  function stopReviewReader() {
    clearInterval(reviewTimer); reviewTimer = undefined;
    reviewRead?.abort(); reviewRead = undefined;
  }
  function startReviewReader() {
    if (reviewTimer !== undefined || !target.document) return;
    reviewTimer = setInterval(async () => {
      if (target.document.visibilityState !== 'visible' || phase !== 'CONNECTED' || !authenticated
        || !session || !wallet || busy || reviewRead) return;
      const controller = new AbortController(), stamp = epoch, captured = session, capturedWallet = wallet;
      const signal = controller.signal;
      reviewRead = controller;
      try {
        await capturedWallet.guard(signal); current(stamp, signal);
        // Keep the server's reader observation fresh without replacing the operator's reviewed input.
        await captured.request('/bootcamp/v4/session', {signal});
      } catch { /* Explicit workflow reads report authentication and transport errors. */ }
      finally { if (reviewRead === controller) reviewRead = undefined; }
    }, REVIEW_WINDOW.pollMs);
  }
  async function endMoodle(signal) {
    if (endingMoodle) return endingMoodle;
    // A target mismatch (NOT_CURRENT) or a later status cannot confirm that this
    // original end completed. No automatic retry/reconnect is allowed after an
    // uncertain result. Keep this latch independent of CLEAR revocation.
    check(!moodleEndUnknown, 'MOODLE_END_UNKNOWN');
    endingMoodle = (async () => {
      try { await moodle.end(signal); }
      catch (error) { moodleEndUnknown = true; throw error; }
      finally { endingMoodle = null; }
    })();
    return endingMoodle;
  }
  async function retire() {
    let failure;
    try { await release(); } catch (error) { failure = error; }
    try { await endMoodle(AbortSignal.timeout(13000)); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  }
  async function release() {
    if (closing) return closing;
    stopReviewReader();
    const priorSession = session, priorWallet = wallet;
    clearTimeout(expiryTimer); authExpiry = 0;
    wallet = null; workflow = null; network = authenticated = false;
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
  function cancel(code = 'CANCELLED', trigger = {origin:'explicit-cancel',action:'cancel',cause:{message:code}}) {
    if (cancellation) return cancellation;
    cancellationDiagnostic.record(trigger.origin,trigger.action,trigger.cause);
    epoch++; busy?.abort(); busy = null; phase = code === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';
    moodle.invalidate?.();
    selected = null; candidates = []; network = authenticated = false;
    error = {code, outcome: 'UNKNOWN'};
    // Retire selector generations even when discovery metadata stays unchanged.
    providers = providers.map(p => ({...p, selector: selector('provider')}));
    cancellation = (async () => {
      try { await retire(); }
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
    catch { void cancel('WALLET_CHANGED',{origin:'wallet-change',action:'NONE',cause:{message:'WALLET_CHANGED'}}); return; }
    if (selected && !next.some(p => p.sdkUserId === selected.sdkUserId && p.walletId === selected.walletId && p.address === selected.address)) {
      void cancel('WALLET_CHANGED',{origin:'wallet-change',action:'NONE',cause:{message:'WALLET_CHANGED'}}); return;
    }
    if (wallet) {
      try { selectedIdentity(snapshot, selected, c.chainId); }
      catch { void cancel('WALLET_CHANGED',{origin:'wallet-change',action:'NONE',cause:{message:'WALLET_CHANGED'}}); return; }
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
    if (authExpiry && Date.now() >= authExpiry * 1000) { await cancel('EXPIRED',{origin:'expiry',action:'NONE',cause:{message:'EXPIRED'}}); return; }
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
          // Each local TEST run adds a new chain. A site permission left from an earlier run makes MetaMask
          // refuse the next personal_sign (4100), so drop it first and ask for accounts afresh. Best effort:
          // a wallet without wallet_revokePermissions keeps the old behaviour.
          try { await bounded(() => provider.provider.request({method: 'wallet_revokePermissions', params: [{eth_accounts: {}}]}),
            {signal, timeoutMs: 10000}); } catch { signal?.throwIfAborted(); }
          current(stamp,signal);
          const address = await requestMetaMaskAddress(provider.provider, signal); current(stamp,signal);
          candidates = [{...provider, address, selector: selector('choice')}]; phase = 'CHOOSING';
        } else if (command.action === 'select-wallet') {
          const choice = candidates.find(p => p.selector === command.choiceId); check(choice, 'STALE_SELECTION');
          await release(); current(stamp,signal); selected = choice; phase = 'SELECTED';
        } else if (command.action === 'check-network') {
          check(selected, 'STALE_SELECTION'); await release(); current(stamp,signal);
          phase = 'CHECKING_NETWORK'; emit(); let boundary;
          const onInvalidate = () => { if (wallet === boundary) void cancel('WALLET_CHANGED',{origin:'wallet-change',action:'NONE',cause:{message:'WALLET_CHANGED'}}); };
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
          cancellationDiagnostic.reset();
          expiryTimer = setTimeout(() => { void cancel('EXPIRED',{origin:'expiry',action:'NONE',cause:{message:'EXPIRED'}}); }, Math.min(2147483647, authExpiry * 1000 - Date.now()));
          authenticated = true; phase = 'AUTHENTICATED'; emit();
          await moodle.complete(session, signal); current(stamp,signal); phase = 'CONNECTION_PENDING';
        } else if (command.action === 'finish-connection') {
          const finishingSession = session, finishingWallet = wallet;
          check(finishingSession && finishingWallet, 'AUTH_REQUIRED');
          phase = 'CONFIRMING_CONNECTION'; emit(); await finishingSession.assertSession(signal); current(stamp,signal);
          await moodle.finish(signal); current(stamp,signal);
          await finishingSession.assertSession(signal); current(stamp,signal);
          await finishingWallet.guard(signal); current(stamp,signal);
          check(session === finishingSession && wallet === finishingWallet && authenticated, 'AUTH_REQUIRED');
          phase = 'CONNECTED';
        } else if (command.action === 'sign-out') {
          cancellationDiagnostic.record('sign-out','sign-out');
          phase = 'REVOKING'; emit(); await release(); current(stamp,signal);
          await endMoodle(signal); current(stamp,signal);
          if (role === 'participant') { await sdk.logout(); current(stamp,signal); }
          epoch++; selected = null; candidates = []; phase = 'IDLE';
          providers = providers.map(p => ({...p, selector: selector('provider')}));
        }
      }, {signal, timeoutMs: 120000});
    } catch (cause) {
      if (stamp === epoch && !closed) {
        cancellationDiagnostic.record('dispatch-failure',command.action,cause);
        controller.abort();
        // A timed out signature is never reused. Revoke even an uncertain login.
        try { await retire(); } catch {}
        phase = 'ERROR';
        const code = revokeUnknown ? 'REVOCATION_UNKNOWN' : ['STALE_SELECTION','NETWORK_UNAVAILABLE','AUTH_REQUIRED','ROLE_CHANGED','CANCELLED'].includes(cause?.message)
          ? cause.message : cause?.code === 4001 || cause?.message === 'WALLET_REJECTED' ? 'WALLET_REJECTED' : 'UNAVAILABLE';
        error = {code, outcome: cause?.outcome === 'NOT_SENT' ? 'NOT_SENT' : 'UNKNOWN'};
      }
    } finally { if (busy === controller) busy = null; emit(); }
  }
  emit();
  return Object.freeze({dispatch, update, async runWorkflow(input) {
    const command=validateNativeWorkflowCommand(structuredClone(input));
    check(!closed&&!busy&&!cancellation&&!revokeUnknown&&!moodleEndUnknown
      &&phase==='CONNECTED'&&authenticated&&session&&wallet,'MOODLE_WORKFLOW_NOT_READY');
    const captured=session,capturedWallet=wallet,stamp=epoch,controller=new AbortController();
    const guard=async signal=>{
      current(stamp,signal);check(session===captured&&wallet===capturedWallet&&authenticated&&phase==='CONNECTED','AUTH_REQUIRED');
      await captured.assertSession(signal);await capturedWallet.guard(signal);current(stamp,signal);
      check(session===captured&&wallet===capturedWallet&&authenticated,'AUTH_REQUIRED');
    };
    workflow??=createNativeWorkflow({session:captured,wallet:capturedWallet,config:c,guard,
      command:async(input,signal)=>{await guard(signal);return moodle.command(captured,input,signal);}});
    busy=controller;emit();
    try{
      const result = await bounded(()=>workflow.run(command,{signal:controller.signal}),{signal:controller.signal,timeoutMs:120000});
      if (command.action === 'read-session') startReviewReader();
      return result;
    }
    catch(cause){
      workflow=null;
      const reviewChanged=command.action==='approve-reflection'&&cause?.message==='AI_REVIEW_CHANGED'&&cause?.outcome==='NOT_SENT';
      if(reviewChanged)throw Object.assign(Error('MOODLE_AI_REVIEW_CHANGED'),{code:'MOODLE_AI_REVIEW_CHANGED',outcome:'NOT_SENT'});
      const certificateChanged=command.action==='start-certificate'&&cause?.status===409&&cause?.code==='BC_REVISION_CONFLICT';
      if(certificateChanged&&stamp===epoch&&!closed&&authenticated&&phase==='CONNECTED'
        &&session===captured&&wallet===capturedWallet)throw Object.assign(Error('MOODLE_CERTIFICATE_REVIEW_CHANGED'),
          {code:'MOODLE_CERTIFICATE_REVIEW_CHANGED',outcome:'HTTP_ERROR',serverEffect:'NOT_ACCEPTED'});
      // Consent target changed before sending (fresh pre-consent view) or the server CAS rejected it:
      // nothing was recorded, so keep this login and let the person re-read and decide again.
      const consentNotSent=command.action==='consent'&&cause?.message==='CONSENT_REVIEW_CHANGED';
      const consentChanged=consentNotSent||command.action==='consent'&&cause?.status===409
        &&['BC_VIEW_STALE','BC_NORMAL_PROCEDURE_NOT_READY'].includes(cause?.code);
      if(consentChanged&&stamp===epoch&&!closed&&authenticated&&phase==='CONNECTED'
        &&session===captured&&wallet===capturedWallet)throw Object.assign(Error('MOODLE_CONSENT_REVIEW_CHANGED'),
          {code:'MOODLE_CONSENT_REVIEW_CHANGED',outcome:consentNotSent?'NOT_SENT':'HTTP_ERROR',serverEffect:'NOT_ACCEPTED'});
      if(stamp===epoch&&!closed&&(!nativeWorkflowIsRead(command)||cause?.status===401||cause?.status===403
        ||['AUTH_REQUIRED','ROLE_CHANGED','PRODUCT_ROLE_CHANGED','FORBIDDEN','SESSION_CHANGED','SESSION_CONTEXT',
          'CANCELLED','WALLET_CONTEXT_CANCELLED'].includes(cause?.message)))await cancel('CANCELLED',{origin:'workflow-failure',action:command.action,cause});
      throw Object.assign(Error('MOODLE_WORKFLOW_UNAVAILABLE'),{code:'MOODLE_WORKFLOW_UNAVAILABLE',
        outcome:nativeWorkflowIsRead(command)?'NOT_SENT':'UNKNOWN'});
    }finally{if(busy===controller)busy=null;emit();}
  },
  // Operator condition preview only: DISPLAY_ONLY relay, sent through the same Moodle
  // command grant as any write. A failure is returned to the panel as is (relay/D codes
  // only) and does not end the wallet login; nothing is retried here.
  async previewRequest(path, options = {}) {
    check(role === 'operator' && typeof path === 'string' && /^\/bootcamp\/preview\/(prepare|generate|execute)$/.test(path)
      && options?.method === 'POST' && options.body && Object.getPrototypeOf(options.body) === Object.prototype, 'MOODLE_PREVIEW_REQUEST');
    const command = {method:'POST',path,body:structuredClone(options.body),
      idempotencyKey:'preview-'+[...globalThis.crypto.getRandomValues(new Uint8Array(12))].map(b=>b.toString(16).padStart(2,'0')).join('')};
    moodleCommandDigest(command);
    check(!closed && !busy && !cancellation && !revokeUnknown && !moodleEndUnknown
      && phase === 'CONNECTED' && authenticated && session && wallet, 'MOODLE_PREVIEW_NOT_READY');
    const captured = session, capturedWallet = wallet, controller = new AbortController(), stamp = epoch;
    const outer = options.signal instanceof AbortSignal ? options.signal : null, abort = () => controller.abort();
    outer?.addEventListener('abort', abort, {once:true}); if (outer?.aborted) abort();
    busy = controller; emit();
    try {
      await capturedWallet.guard(controller.signal); current(stamp,controller.signal);
      const result = await bounded(()=>moodle.command(captured,command,controller.signal),{signal:controller.signal,timeoutMs:60000});
      current(stamp,controller.signal); check(session === captured && wallet === capturedWallet && authenticated,'AUTH_REQUIRED');
      return result;
    } finally { outer?.removeEventListener('abort', abort); if(busy === controller) busy = null; emit(); }
  }, async submitCommand(input) {
    const command = structuredClone(input); moodleCommandDigest(command);
    check(!closed && !busy && !cancellation && !revokeUnknown && !moodleEndUnknown
      && phase === 'CONNECTED' && authenticated && session && wallet, 'MOODLE_COMMAND_NOT_READY');
    const captured = session, controller = new AbortController(), stamp = epoch;
    busy = controller; emit();
    try {
      const result = await bounded(()=>moodle.command(captured,command,controller.signal),{signal:controller.signal,timeoutMs:13000});
      current(stamp,controller.signal); check(session === captured,'AUTH_REQUIRED'); return result;
    } catch(error) {
      // A failed response never permits this command to be automatically sent again.
      if (stamp === epoch && !closed) await cancel('CANCELLED',{origin:'command-failure',action:'NONE',cause:error});
      throw error;
    } finally { if(busy === controller) busy = null; emit(); }
  }, async destroy() {
    if (closed) return;
    cancellationDiagnostic.record('destroy','NONE');
    closed = true; epoch++; busy?.abort(); busy = null; stopDiscovery();
    moodle.invalidate?.();
    selected = null; candidates = []; providers = []; phase = 'CLOSED'; network = authenticated = false;
    try { await cancellation; await retire(); } catch {}
    emit();
  }});
}
