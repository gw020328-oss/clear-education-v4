// Browser-only transport. No Node imports, wallet keys, persistence or retries.
const MAX_ERROR_BYTES = 4096;
const codes = new Map();
for (const [status, names] of [
  [401, ['AUTH_REQUIRED', 'AUTH_CHALLENGE', 'SIGNATURE']],
  [403, ['FORBIDDEN', 'SPONSOR_REQUIRED', 'NOT_INVITED', 'ORIGIN', 'CSRF', 'WALLET_CONTEXT_CHANGED', 'TRANSPORT', 'PROOF_BROWSER_SESSION']],
  [404, ['APPLICATION_NOT_FOUND', 'POLICY_NOT_FOUND', 'ROUTE', 'PROOF_SESSION_NOT_FOUND']],
  [409, ['IDEMPOTENCY_CONFLICT', 'POLICY_VERSION_CONFLICT', 'POLICY_SUPERSEDED', 'APPLICATION_STATE', 'CONSENT_CHALLENGE',
    'PROOF_SESSION_ACTIVE', 'PROOF_OWNER_REUSED', 'PROOF_NONCE_CONSUMED', 'PROOF_SESSION_CANCELLED', 'PROOF_ENROLLMENT_REQUIRED',
    'PROOF_ENROLLMENT_CHANGED', 'PROOF_ENROLLMENT_SETTLED', 'PROOF_GRANT_EXISTS', 'PROOF_SUBMISSION_CLOSED',
    'PRODUCT_RESULT_CONFLICT', 'PRODUCT_AUTHORIZATION_REQUIRED', 'PRODUCT_RESULT_MISSING', 'PRODUCT_VERIFICATION_STALE', 'PROOF_SOURCE_INCOMPLETE']],
  [410, ['PROOF_SESSION_EXPIRED']], [413, ['BODY_SIZE', 'PRODUCT_SIZE']], [429, ['AUTH_RATE_LIMIT', 'PRODUCT_VERIFIER_BUSY']],
  [422, ['FINAL_CONSENT_CHALLENGE', 'FINAL_CONSENT_CONFLICT', 'FINAL_CONSENT_EXISTS', 'FINAL_CONSENT_EXPIRED',
    'FUNDING_CONFLICT', 'FUNDING_STATE', 'FUNDING_UNCONFIRMED', 'FUNDING_RECOVERY_REQUIRED', 'RUNTIME_CHANGED',
    'RUNTIME_NOT_BOUND', 'CHAIN_UNAVAILABLE', 'CHAIN_REORG', 'ENROLLMENT_CLOSED', 'PRODUCT_VERIFICATION_FAILED']],
  [500, ['INTERNAL_ERROR']],
]) for (const name of names) codes.set(name, status);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

function failure(code, { method, status = null, requestId = null, outcome, http = false }) {
  // Keep existing HTTP .message consumers working; .code adds safe detail.
  const error = new Error(http ? status === 401 ? 'AUTH_REQUIRED' : 'API_REQUEST_FAILED' : code);
  error.name = 'ApiRequestError';
  const transient = ['API_NETWORK', 'API_TIMEOUT', 'CHAIN_UNAVAILABLE', 'CHAIN_REORG'].includes(code)
    || status === 429 || (status !== null && status >= 500);
  const retryable = method === 'GET' && transient;
  let nextAction = 'CHECK_REQUEST';
  if (outcome === 'UNKNOWN' && method === 'POST') nextAction = 'CHECK_RESULT';
  else if (status === 401 || code === 'CSRF') nextAction = 'SIGN_IN_AGAIN';
  else if (code === 'WALLET_CONTEXT_CHANGED') nextAction = 'RECONNECT_WALLET';
  else if (code === 'PROOF_SOURCE_INCOMPLETE') nextAction = 'WAIT_FOR_SOURCE';
  else if (transient) nextAction = method === 'GET' ? 'RETRY_LATER' : 'CHECK_RESULT';
  else if (['FUNDING_UNCONFIRMED', 'FUNDING_RECOVERY_REQUIRED', 'PRODUCT_RESULT_CONFLICT', 'PROOF_NONCE_CONSUMED'].includes(code)) nextAction = 'CHECK_RESULT';
  else if (status === 409 || status === 410 || ['PROOF_BROWSER_SESSION', 'RUNTIME_CHANGED', 'FINAL_CONSENT_EXPIRED'].includes(code)) nextAction = 'REFRESH_STATE';
  else if (code === 'API_ABORTED') nextAction = 'NONE';
  return Object.assign(error, { code, status, requestId, outcome, retryable, nextAction });
}

// Race even a test/custom fetch that ignores AbortSignal. Late responses are
// discarded; transport cancellation is not a server rollback guarantee.
function interrupted(pending, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('API_ABORTED')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(pending).then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      () => { signal.removeEventListener('abort', abort); reject(new Error('API_NETWORK')); });
    if (signal.aborted) abort();
  });
}
function cancelBody(response) {
  try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch { /* No response detail escapes. */ }
}
async function readJson(response, signal, maxBytes = Infinity) {
  let reader;
  try {
    reader = response.body?.getReader(); if (!reader) throw new Error('EMPTY_BODY');
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await interrupted(reader.read(), signal);
      if (done) break;
      size += value.byteLength; if (size > maxBytes) throw new Error('BODY_SIZE');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    if (reader) {
      try { Promise.resolve(reader.cancel()).catch(() => {}); reader.releaseLock(); } catch { /* Best effort. */ }
    } else cancelBody(response);
  }
}
async function errorBody(response, signal) {
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return null;
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_ERROR_BYTES)) return null;
    const value = await readJson(response, signal, MAX_ERROR_BYTES);
    return value && Object.getPrototypeOf(value) === Object.prototype ? value : null;
  } catch { return null; }
  finally { cancelBody(response); }
}

export function createSameOriginApi({ origin, fetch: fetchImpl = globalThis.fetch, timeoutMs = 45000 }) {
  try { if (new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) throw new Error(); }
  catch { throw new Error('ORIGIN_CONFIG'); }
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('API_CONFIG');
  return async (path, { method = 'GET', body, headers = {}, signal } = {}) => {
    let url, payload, requestHeaders;
    try {
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(path)) throw new Error();
      url = new URL(path, origin);
      if (url.origin !== origin || url.search || url.hash) throw new Error();
    } catch { throw failure('API_ORIGIN', { method, outcome: 'NOT_SENT' }); }
    try {
      if (!['GET', 'POST'].includes(method) || (method === 'GET' && body !== undefined)) throw new Error();
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error();
      payload = body === undefined ? undefined : JSON.stringify(body);
      if (body !== undefined && payload === undefined) throw new Error();
      requestHeaders = new Headers(headers);
      if (body !== undefined) requestHeaders.set('content-type', 'application/json');
    } catch { throw failure('API_REQUEST_INVALID', { method, outcome: 'NOT_SENT' }); }
    if (signal?.aborted) throw failure('API_ABORTED', { method, outcome: 'NOT_SENT' });
    const deadline = new AbortController(), scope = AbortSignal.any([signal, deadline.signal].filter(Boolean));
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    let response, sent = false;
    const interruptedFailure = () => failure(signal?.aborted ? 'API_ABORTED' : 'API_TIMEOUT', { method, outcome: sent ? 'UNKNOWN' : 'NOT_SENT' });
    try {
      const pending = Promise.resolve().then(() => {
        scope.throwIfAborted();
        sent = true;
        return fetchImpl(url.href, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: requestHeaders, body: payload, signal: scope });
      }).then(value => { if (scope.aborted) cancelBody(value); return value; });
      try { response = await interrupted(pending, scope); }
      catch { if (scope.aborted) throw interruptedFailure(); throw failure('API_NETWORK', { method, outcome: sent ? 'UNKNOWN' : 'NOT_SENT' }); }
      if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status > 599
        || response.redirected || response.ok !== (response.status < 300)) {
        throw failure('API_RESPONSE_INVALID', { method, outcome: 'UNKNOWN' });
      }
      if (!response.ok) {
        const value = await errorBody(response, scope);
        if (scope.aborted) throw interruptedFailure();
        const code = codes.get(value?.code) === response.status ? value.code : response.status === 401 ? 'AUTH_REQUIRED' : 'API_REQUEST_FAILED';
        throw failure(code, { method, status: response.status, requestId: uuid(value?.requestId) ? value.requestId : null,
          outcome: response.status >= 500 ? 'UNKNOWN' : 'HTTP_ERROR', http: true });
      }
      try {
        const value = await readJson(response, scope);
        if (scope.aborted) throw interruptedFailure();
        return value;
      } catch {
        if (scope.aborted) throw interruptedFailure();
        throw failure('API_RESPONSE_INVALID', { method, outcome: 'UNKNOWN' });
      }
    } finally { clearTimeout(timer); cancelBody(response); }
  };
}
