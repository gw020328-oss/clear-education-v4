// Separate-environment fixture: existing application service (real SIWE
// sessions, CSRF), existing bootcamp frontend server, B relay mounted by
// tools/agent-preview/operator-preview-stack.mjs.
//
// D side:
//   CLEAR_D_PREVIEW_ROOT set → exported exact D snapshot, real HMAC over loopback
//                                HTTP, real sqlite single-use approvals (D_REAL)
//   otherwise                → in-process D double that follows D's success/error
//                                DTOs using the same core (D_DOUBLE)
// Model transport is always OFFLINE. No external network.
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {request as httpsRequest} from 'node:https';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {id, Wallet} from 'ethers';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {createCertificates, loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';
import {hash} from '../../src/agent-preview/index.mjs';
import {prepareGeminiStructureRequest} from '../../src/agent-preview/gemini-preparation.mjs';
import {requestGeminiPreview} from '../../src/agent-preview/gemini-response.mjs';
import {proposalDto} from '../../src/agent-preview/condition-structuring.mjs';
import {createDPreviewRequest} from '../../src/agent-preview/d-preview-transport.mjs';
import {OPERATOR_SCOPE_CONFIG_VERSION} from '../../src/agent-preview/operator-scope.mjs';
import {mountOperatorPreview, startDPreview} from '../../tools/agent-preview/operator-preview-stack.mjs';
import {createOfflineGeminiTransport} from '../../tools/agent-preview/offline-gemini.mjs';

export const ORIGIN = 'https://clear.example.invalid';
export const CHAIN_ID = 431701;
export const COURSE = 'course-operator-demo';
const D_LIMITS = Object.freeze({countTokens: 1, generateContent: 1, automaticRetries: 0, maxInputTokens: 4096, maxOutputTokens: 2048,
  maximumGenerationCostUsd: '0.0063488', priceCheckedOn: '2026-11-04', priceSource: 'https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite'});
const gates = {scope: 'PRECONFIGURATION_ONLY', automaticEligibility: false, paymentAllowed: false,
  actualReclaimCall: false, actualPayout: false, dataMode: 'DEMO_ACCOUNTS_ONLY'};

/** D double: same DTOs/error envelope as D service+http-server, same core. */
function createDDouble({actor, bindingHash, modelTransport, calls}) {
  const approvals = new Map(), drafts = new Map();
  const err = (status, code) => ({status, body: {version: 'clear-external-preview-error.1', code, paymentAllowed: false}});
  return {
    approvals,
    register({ref, bodyHash, expires}) { assert.ok(!approvals.has(ref)); approvals.set(ref, {bodyHash, expires, consumed: false}); },
    async request(command, {signal}) {
      const op = command.path.split('/').at(-1), body = command.body; calls.push(op);
      for (const k of ['institutionId', 'courseId', 'operatorId']) if (body[k] !== actor[k]) return err(403, 'ACTOR_SCOPE');
      const p = prepareGeminiStructureRequest(body.sourceText);
      if (op === 'prepare') return {status: 200, body: {...gates, version: 'clear-external-preview-preparation.1', sourceText: body.sourceText,
        bodyHash: p.bodyHash, sourceHash: p.sourceHash, model: p.model, bindingHash, limits: D_LIMITS, actualModelCall: false}};
      if (op === 'execute') return err(503, 'OBSERVATION_ADAPTER_NOT_ACCEPTED');
      const methods = {countTokens: {invoked: false, replied: false}, generateContent: {invoked: false, replied: false}};
      try {
        const {draft} = await requestGeminiPreview(body.sourceText, {approvalRef: body.approvalRef, signal,
          claimAndDispatch: async ({approvalRef, bodyHash, body: request}) => {
            const a = approvals.get(approvalRef);
            if (!a || a.consumed || a.bodyHash !== bodyHash || a.expires <= Date.now()) throw Error('APPROVAL_REQUIRED_OR_SPENT');
            a.consumed = true;
            methods.countTokens.invoked = true; await modelTransport.request(p.model, 'countTokens', request, signal); methods.countTokens.replied = true;
            methods.generateContent.invoked = true; const reply = await modelTransport.request(p.model, 'generateContent', request, signal);
            methods.generateContent.replied = true; return reply;
          }});
        const draftId = randomUUID(), expiresAt = Date.now() + 900000;
        drafts.set(draftId, draft);
        return {status: 200, body: {...gates, version: 'clear-external-preview-draft.1', draftId, expiresAt, draft, proposal: proposalDto(draft),
          modelCall: {attempted: true, replied: true, execution: 'OFFLINE_TEST_TRANSPORT', model: p.model, bodyHash: p.bodyHash, succeeded: true,
            errorCode: null, methods}, model: p.model, bodyHash: p.bodyHash, actualModelCall: false, modelProvenance: 'OFFLINE_TEST_TRANSPORT'}};
      } catch (e) {
        const code = String(e.code ?? e.message);
        return err(422, /^(APPROVAL_REQUIRED_OR_SPENT|APPROVAL_EXPIRED|GEMINI_[A-Z_]+|INPUT_TOKEN_LIMIT)$/.test(code) ? code : 'REQUEST_REJECTED');
      }
    },
  };
}

export async function operatorConnectFixture(t, {ttlMs = 60000, transport} = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'clear-operator-connect-')));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const operator = Wallet.createRandom(), unbound = Wallet.createRandom(), otherCourse = Wallet.createRandom(), alice = Wallet.createRandom();
  const authentication = createApplicationService({directory: join(directory, 'authentication'), origin: ORIGIN, chainId: CHAIN_ID,
    instanceId: id('OPERATOR_CONNECT_TEST'), participants: [alice.address], operators: [operator.address, unbound.address, otherCourse.address]});
  t.after(() => authentication.close());
  // Single source for course authority: the store and the scope resolver read the same bindings.
  const state = {bindings: [{wallet: operator.address.toLowerCase(), courseOperatorRef: COURSE},
    {wallet: otherCourse.address.toLowerCase(), courseOperatorRef: 'course-without-preview'}], calls: [], modelCalls: []};
  const store = createBootcampStore({directory: join(directory, 'store'), authentication, instanceId: 'opc-' + randomBytes(8).toString('hex'),
    demoStartedAt: Math.floor(Date.now() / 1000), mode: 'DISABLED', resolveOperatorBindings: () => state.bindings});
  t.after(() => store.close());
  const tlsDir = join(directory, 'tls'); mkdirSync(tlsDir, {mode: 0o700});
  const fingerprint = createCertificates(tlsDir), ca = readFileSync(join(tlsDir, 'ca.pem'));
  const mounted = createBootcampFrontendServer({authentication, store, tls: loadTls(tlsDir, fingerprint), sourceMode: 'SYNTHETIC_TEST_SOURCE', chainId: CHAIN_ID});

  const modelTransport = transport ?? createOfflineGeminiTransport({onCall: m => state.modelCalls.push(m)});
  const actor = {institutionId: 'clear-demo', courseId: '2', operatorId: '2'};
  const artifactHash = hash('operator-connect-test-artifact'), deploymentEpoch = randomUUID();
  let d, dRequest, bindingHash, register, mode;
  if (process.env.CLEAR_D_PREVIEW_ROOT) {
    mode = 'D_REAL';
    const secret = randomBytes(32).toString('hex');
    d = await startDPreview({dRoot: process.env.CLEAR_D_PREVIEW_ROOT, databasePath: join(directory, 'd', 'approvals.sqlite'), secret,
      actor, artifactHash, deploymentEpoch, modelTransport});
    t.after(() => d.close());
    bindingHash = d.bindingHash;
    const signed = createDPreviewRequest({publicOrigin: d.config.publicOrigin, connectOrigin: d.connectOrigin, secret});
    dRequest = (command, options) => { state.calls.push(command.path.split('/').at(-1)); return signed(command, options); };
    register = ({ref, bodyHash, expires}) => d.store.register({ref, bodyHash, bindingHash, expires});
  } else {
    mode = 'D_DOUBLE';
    bindingHash = hash({artifactHash, deploymentEpoch, actor, double: true});
    d = createDDouble({actor, bindingHash, modelTransport, calls: state.calls});
    dRequest = (command, options) => d.request(command, options);
    register = ({ref, bodyHash, expires}) => d.register({ref, bodyHash, expires});
  }
  const previewConfig = {version: OPERATOR_SCOPE_CONFIG_VERSION, bindings: [{courseOperatorRef: COURSE, scopeRef: 'course-operator-demo:preview',
    authorityRevision: 1, expiresAtMs: Date.now() + 3600000, dActor: actor,
    deployment: {artifactHash, deploymentEpoch, bindingHash, model: 'gemini-3.5-flash-lite', limitsHash: hash(D_LIMITS)}}]};
  state.previewConfig = previewConfig;
  const preview = mountOperatorPreview({server: mounted.server, origin: ORIGIN, authentication,
    operatorBindings: () => state.bindings, previewBindings: () => state.previewConfig, dRequest, bindingHash, ttlMs});
  mounted.server.listen(0, '127.0.0.1'); await once(mounted.server, 'listening');
  t.after(async () => { mounted.server.closeAllConnections(); await new Promise(r => mounted.server.close(r)); await mounted.drain(); });

  async function login(wallet) {
    const c = authentication.challenge({wallet: wallet.address, chainId: CHAIN_ID});
    const r = authentication.login({nonce: c.nonce, signature: await wallet.signMessage(c.message)}, c.browserToken);
    return {token: r.token, wallet: r.wallet, chainId: CHAIN_ID, csrf: r.csrf};
  }
  /** Raw HTTPS exactly as a same-origin browser would send it. */
  function raw(path, {context, body, headers = {}, method = 'POST'} = {}) {
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = httpsRequest({hostname: '127.0.0.1', servername: 'localhost', port: mounted.server.address().port, path, method, ca,
        headers: Object.fromEntries(Object.entries({host: new URL(ORIGIN).host, origin: ORIGIN, 'sec-fetch-site': 'same-origin',
          cookie: context ? '__Host-clear-session=' + context.token : undefined, 'x-wallet': context?.wallet,
          'x-chain-id': context ? String(context.chainId) : undefined, 'x-csrf-token': context?.csrf,
          ...(payload === undefined ? {} : {'content-type': 'application/json'}), ...headers}).filter(([, v]) => v !== undefined))},
      res => { const chunks = []; res.on('data', x => chunks.push(x)); res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
        resolve({status: res.statusCode, headers: res.headers, body: json});
      }); });
      req.on('error', reject); req.end(payload);
    });
  }
  /** Owner step: record a direct approval for EXACT source text in D and in the CLEAR owner registry. */
  function approve(sourceText, {ref = 'approved_' + randomBytes(6).toString('hex'), ttl = 600000} = {}) {
    const bodyHash = prepareGeminiStructureRequest(sourceText).bodyHash, expires = Date.now() + ttl;
    register({ref, bodyHash, expires});
    preview.approvals.record({bodyHash, bindingHash, approvalRef: ref, expiresAt: expires});
    return {ref, bodyHash, expires};
  }
  /** fetch for web/src transport: same-origin cookie + CA, Node https underneath. */
  function browserFetch(context) {
    return async (url, init) => {
      const u = new URL(url);
      assert.equal(u.origin, ORIGIN); assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error');
      const r = await raw(u.pathname, {context, body: init.body, method: init.method, headers: {...init.headers, cookie: '__Host-clear-session=' + context.token}});
      const text = JSON.stringify(r.body);
      return new Response(text, {status: r.status, headers: {'content-type': r.headers['content-type'] ?? 'application/json'}});
    };
  }
  return {directory, mode, state, authentication, operator, unbound, otherCourse, alice, login, raw, approve, browserFetch,
    preview, bindingHash, d, port: () => mounted.server.address().port};
}
