import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { randomUUID } from 'node:crypto';
import { RuleError, exactKeys, requireRule } from '../policy/values.mjs';

const SESSION = '__Host-clear-session', PREAUTH = '__Host-clear-preauth';
const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function cookies(header = '') {
  requireRule(header.length <= 4096, 'COOKIE');
  const out = {};
  for (const part of header.split(';')) {
    if (!part.trim()) continue;
    const [key, value, extra] = part.trim().split('=');
    if (![SESSION, PREAUTH].includes(key)) continue;
    requireRule(!Object.hasOwn(out, key) && !extra && /^[0-9a-f]{64}$/.test(value), 'COOKIE');
    out[key] = value;
  }
  return out;
}
async function jsonBody(req) {
  requireRule(req.headers['content-type'] === 'application/json', 'CONTENT_TYPE');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; requireRule(size <= 65536, 'BODY_SIZE'); chunks.push(chunk); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new RuleError('JSON'); }
}
const statusFor = code => ['AUTH_REQUIRED', 'AUTH_CHALLENGE', 'SIGNATURE'].includes(code) ? 401
  : ['FORBIDDEN', 'SPONSOR_REQUIRED', 'NOT_INVITED', 'ORIGIN', 'CSRF', 'WALLET_CONTEXT_CHANGED', 'TRANSPORT', 'PROOF_BROWSER_SESSION'].includes(code) ? 403
    : ['APPLICATION_NOT_FOUND', 'POLICY_NOT_FOUND', 'ROUTE', 'PROOF_SESSION_NOT_FOUND'].includes(code) ? 404
      : code === 'PROOF_SESSION_EXPIRED' ? 410
      : ['IDEMPOTENCY_CONFLICT', 'POLICY_VERSION_CONFLICT', 'POLICY_SUPERSEDED', 'APPLICATION_STATE', 'CONSENT_CHALLENGE',
        'PROOF_SESSION_ACTIVE', 'PROOF_OWNER_REUSED', 'PROOF_NONCE_CONSUMED', 'PROOF_SESSION_CANCELLED', 'PROOF_ENROLLMENT_REQUIRED',
        'PROOF_ENROLLMENT_CHANGED', 'PROOF_ENROLLMENT_SETTLED', 'PROOF_GRANT_EXISTS', 'PROOF_SUBMISSION_CLOSED',
        'PRODUCT_RESULT_CONFLICT', 'PRODUCT_AUTHORIZATION_REQUIRED', 'PRODUCT_RESULT_MISSING', 'PRODUCT_VERIFICATION_STALE', 'PROOF_SOURCE_INCOMPLETE'].includes(code) ? 409
        : ['AUTH_RATE_LIMIT', 'PRODUCT_VERIFIER_BUSY'].includes(code) ? 429 : ['BODY_SIZE', 'PRODUCT_SIZE'].includes(code) ? 413 : 422;

// The factory does not listen or deploy. HTTPS termination must preserve Host
// and use an encrypted connection to this handler; proxy headers are not trusted.
export function createApplicationServer(service, { allowLoopbackHttpForTests = false, tls, workflow, studentWorkflow } = {}) {
  const makeServer = tls ? createHttpsServer : createServer;
  const server = makeServer({ ...tls, requestTimeout: 10000, headersTimeout: 10000, maxHeaderSize: 8192 },
    createApplicationHandler(service, { allowLoopbackHttpForTests, workflow, studentWorkflow }));
  server.maxConnections = 32;
  return server;
}

// Composable handler; the same transport/origin/session checks apply when a
// local development listener also serves a frontend build and synthetic RPC.
export function createApplicationHandler(service, { allowLoopbackHttpForTests = false, workflow, studentWorkflow } = {}) {
  const expected = new URL(service.origin);
  requireRule(!workflow || workflow.origin === service.origin, 'ORIGIN_CONFIG');
  requireRule(!studentWorkflow || studentWorkflow.origin === service.origin, 'ORIGIN_CONFIG');
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const requestId = randomUUID();
    const cancelled = new AbortController();
    const abort = () => cancelled.abort();
    const closed = () => { if (!res.writableEnded) abort(); };
    req.once('aborted', abort); res.once('close', closed);
    try {
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      requireRule(req.socket.encrypted || (allowLoopbackHttpForTests && loopback), 'TRANSPORT');
      requireRule(req.headers.host === expected.host, 'ORIGIN');
      const origin = req.headers.origin;
      requireRule(origin === service.origin || (req.method === 'GET' && origin === undefined && req.headers['sec-fetch-site'] === 'same-origin'), 'ORIGIN');
      requireRule(!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin', 'ORIGIN');
      const c = cookies(req.headers.cookie), body = req.method === 'POST' ? await jsonBody(req) : null;
      const chain = req.headers['x-chain-id'];
      const context = { token: c[SESSION], wallet: req.headers['x-wallet'],
        chainId: typeof chain === 'string' && /^[1-9][0-9]{0,15}$/.test(chain) ? Number(chain) : null,
        csrf: req.headers['x-csrf-token'] ?? null };
      const path = req.url, key = req.headers['idempotency-key']; let result;
      if (/^\/mvp(?:\/|\?|$)/.test(path)) {
        requireRule((workflow || studentWorkflow) && loopback, 'FORBIDDEN');
        result = /^\/mvp\/(policies|applications|student-operations)(?:\/|$)/.test(path)
          ? dispatchStudent(studentWorkflow, context, req.method, path, body, key)
          : await dispatchWorkflow(workflow, context, req.method, path, body, key, cancelled.signal);
      } else if (req.method === 'POST' && path === '/auth/nonce') {
        const challenge = service.challenge(body);
        res.setHeader('Set-Cookie', cookie(PREAUTH, challenge.browserToken, 300));
        result = { nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt };
      } else if (req.method === 'POST' && path === '/auth/verify') {
        const login = service.login(body, c[PREAUTH], c[SESSION]);
        res.setHeader('Set-Cookie', [cookie(SESSION, login.token, 3600), cookie(PREAUTH, '', 0)]);
        const { token, ...publicSession } = login; result = publicSession;
      } else if (req.method === 'GET' && path === '/auth/session') result = service.whoami(context);
      else if (req.method === 'POST' && path === '/auth/logout') {
        exactKeys(body, [], 'LOGOUT_SCHEMA');
        result = service.logout(context); res.setHeader('Set-Cookie', cookie(SESSION, '', 0));
      } else if (req.method === 'POST' && path === '/policies') result = service.registerPolicy(context, body);
      else if (req.method === 'GET' && /^\/policies\/0x[0-9a-f]{64}$/.test(path)) result = service.getPolicy(context, path.split('/')[2]);
      else if (req.method === 'POST' && path === '/runtimes') result = await service.bindRuntime(context, body);
      else if (req.method === 'GET' && /^\/runtimes\/0x[0-9a-f]{64}$/.test(path)) result = service.getRuntime(context, path.split('/')[2]);
      else if (req.method === 'GET' && path === '/applications') result = service.listApplications(context);
      else if (req.method === 'POST' && path === '/applications') result = service.createApplication(context, body, key);
      else if (/^\/applications\/0x[0-9a-f]{64}\/proof-sessions(?:\/0x[0-9a-f]{64}(?:\/(?:authorize|cancel|evidence|result))?)?$/.test(path)) {
        const [, , appId, , proofId, action] = path.split('/');
        if (req.method === 'POST' && !proofId) result = await service.createProofSession(context, appId, body, key);
        else if (req.method === 'GET' && !proofId) result = service.listProofSessions(context, appId);
        else if (req.method === 'GET' && !action) result = service.getProofSession(context, appId, proofId);
        else if (req.method === 'POST' && action === 'authorize') result = await service.authorizeProofSession(context, appId, proofId, body);
        else if (req.method === 'POST' && action === 'cancel') result = service.cancelProofSession(context, appId, proofId, body);
        else if (req.method === 'POST' && action === 'evidence') result = await service.acceptProofEvidence(context, appId, proofId, body, { signal: cancelled.signal });
        else if (req.method === 'GET' && action === 'result') result = service.getProofResult(context, appId, proofId);
        else throw new RuleError('ROUTE');
      }
      else {
        const match = /^\/applications\/(0x[0-9a-f]{64})(?:\/(consent-challenge|consent|final-consent-challenge|final-consent|funding-intent|funding-confirmation))?$/.exec(path);
        requireRule(match, 'ROUTE');
        if (req.method === 'GET' && !match[2]) result = service.getApplication(context, match[1]);
        else if (req.method === 'POST' && match[2] === 'consent-challenge') {
          exactKeys(body, [], 'CONSENT_SCHEMA');
          result = service.consentChallenge(context, match[1]);
        } else if (req.method === 'POST' && match[2] === 'consent') result = service.consent(context, match[1], body, key);
        else if (req.method === 'POST' && match[2] === 'final-consent-challenge') {
          exactKeys(body, [], 'FINAL_CONSENT_SCHEMA'); result = await service.finalConsentChallenge(context, match[1]);
        } else if (req.method === 'POST' && match[2] === 'final-consent') result = service.finalConsent(context, match[1], body);
        else if (req.method === 'POST' && match[2] === 'funding-intent') {
          exactKeys(body, [], 'FUNDING_SCHEMA'); result = await service.fundingIntent(context, match[1]);
        } else if (req.method === 'POST' && match[2] === 'funding-confirmation') result = await service.confirmFunding(context, match[1], body);
        else throw new RuleError('ROUTE');
      }
      res.end(JSON.stringify(result));
    } catch (error) {
      const code = error instanceof RuleError ? error.message : 'INTERNAL_ERROR';
      res.statusCode = code === 'INTERNAL_ERROR' ? 500 : code === 'MVP_NOT_FOUND' ? 404
        : ['MVP_STALE','MVP_TEMPLATE_REQUIRED','MVP_BUSY','MVP_CLOSED','MVP_POLICY_UNAVAILABLE','MVP_APPLICATION_EXISTS'].includes(code) ? 409
        : code === 'SOURCE_EXPIRED' ? 410 : statusFor(code);
      res.end(JSON.stringify({ code, message: '요청을 완료하지 못했습니다.', retryable: false,
        nextAction: res.statusCode === 401 ? 'SIGN_IN_AGAIN' : 'CHECK_REQUEST', requestId }));
    } finally { req.removeListener('aborted', abort); res.removeListener('close', closed); }
  };
}

// Separate namespace: F0 ApplicationView and existing v4 endpoints stay intact.
async function dispatchWorkflow(service, context, method, path, body, key, signal) {
  requireRule(service, 'ROUTE');
  if (method === 'GET' && path === '/mvp/source-bundles') return service.catalogue(context);
  const recovery = /^\/mvp\/source-bundles\/([a-z][a-z0-9.-]{0,63})\/operations\/(snapshots|drafts)\/([a-z][a-z0-9.-]{0,63})$/.exec(path);
  if (recovery && method === 'GET') return service.recoverOperation(context,recovery[1],recovery[2],recovery[3]);
  const bundle = /^\/mvp\/source-bundles\/([a-z][a-z0-9.-]{0,63})(?:\/(snapshots|drafts|reviews))?$/.exec(path);
  if (bundle) {
    if (method === 'GET' && !bundle[2]) return service.preview(context, bundle[1]);
    if (method === 'GET' && bundle[2] === 'reviews') return service.reviews(context, bundle[1]);
    if (method === 'POST' && bundle[2] === 'snapshots') return service.capture(context, bundle[1], body, key, { signal });
    if (method === 'POST' && bundle[2] === 'drafts') return service.propose(context, bundle[1], body, key, { signal });
    if (method === 'POST' && bundle[2] === 'reviews') return service.review(context, bundle[1], body, key);
  }
  const operation = /^\/mvp\/operations\/([a-z][a-z0-9.-]{0,63})(?:\/(cancel))?$/.exec(path);
  if (operation && method === 'GET' && !operation[2]) return service.operation(context, operation[1]);
  if (operation && method === 'POST' && operation[2]) return service.cancel(context, operation[1], body);
  throw new RuleError('ROUTE');
}

function dispatchStudent(service, context, method, path, body, key) {
  requireRule(service, 'ROUTE');
  if(method==='GET'&&path==='/mvp/policies')return service.policies(context);
  const policy=/^\/mvp\/policies\/(0x[0-9a-f]{64})$/.exec(path);
  if(method==='GET'&&policy)return service.policy(context,policy[1]);
  if(path==='/mvp/applications'){
    if(method==='GET')return service.list(context);
    if(method==='POST')return service.create(context,body,key);
  }
  const createRecovery=/^\/mvp\/applications\/operations\/([a-z][a-z0-9.-]{0,63})$/.exec(path);
  if(method==='GET'&&createRecovery)return service.recover(context,'applications',createRecovery[1]);
  const operation=/^\/mvp\/student-operations\/([a-z][a-z0-9.-]{0,63})$/.exec(path);
  if(method==='GET'&&operation)return service.operation(context,operation[1]);
  const recovery=/^\/mvp\/applications\/(0x[0-9a-f]{64})\/operations\/(agreement|policy-selection)\/([a-z][a-z0-9.-]{0,63})$/.exec(path);
  if(method==='GET'&&recovery)return service.recover(context,recovery[2],recovery[3],recovery[1]);
  const application=/^\/mvp\/applications\/(0x[0-9a-f]{64})(?:\/(agreement-preview|agreement|agreements|policy-selection))?$/.exec(path);
  if(application){
    const [,id,action]=application;
    if(method==='GET'&&!action)return service.get(context,id);
    if(method==='GET'&&action==='agreement-preview')return service.preview(context,id);
    if(method==='GET'&&action==='agreements')return service.acknowledgments(context,id);
    if(method==='POST'&&action==='agreement')return service.acknowledge(context,id,body,key);
    if(method==='POST'&&action==='policy-selection')return service.selectPolicy(context,id,body,key);
  }
  throw new RuleError('ROUTE');
}
