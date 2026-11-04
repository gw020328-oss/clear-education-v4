// Opt-in candidate. The owner supplies a reviewed route inventory and two local
// handlers. This does not start a listener or alter an installed Moodle site.
import {randomBytes} from 'node:crypto';
import {embeddedCsp} from '../../src/embedded-wallet/config.mjs';

const check = (ok, code = 'MOODLE_FRONT_DOOR') => { if (!ok) throw Error(code); };
const callback = '/local/clearbridge/wallet-return';
const clearCookie = /^__Host-clear-(?:[a-z0-9-]+)$/;
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const safePath = path => typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
  && !/[\\%?#\x00-\x20\x7f]/.test(path) && !path.split('/').some(p => p === '.' || p === '..');
const headersFor = owner => new Set(owner === 'A'
  ? ['accept', 'content-type', 'content-length', 'origin', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
    'x-wallet', 'x-chain-id', 'x-csrf-token', 'idempotency-key', 'x-clear-command-ref', 'x-clear-command-binding']
  : ['accept', 'accept-language', 'content-type', 'content-length', 'origin', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest']);

export function createMoodleFrontDoorPolicy({origin, routes, moodleCookieName = 'MoodleSession'}) {
  const url = new URL(origin);
  check(url.origin === origin && url.protocol === 'https:' && url.hostname === '127.0.0.1' && url.port);
  check(token.test(moodleCookieName) && !moodleCookieName.startsWith('__Host-clear-'));
  check(Array.isArray(routes) && routes.length > 0 && routes.length <= 256);
  const inventory = routes.map(route => {
    check(route && Object.keys(route).every(k => ['owner', 'path', 'methods', 'query', 'slashArguments', 'walletDocument'].includes(k)));
    check(['A', 'C'].includes(route.owner) && safePath(route.path));
    check(Array.isArray(route.methods) && route.methods.length > 0
      && route.methods.every(v => ['GET', 'POST', 'DELETE'].includes(v)));
    check(Array.isArray(route.query) && route.query.every(k => /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(k)));
    check(route.slashArguments === undefined || typeof route.slashArguments === 'boolean');
    check(route.walletDocument === undefined || typeof route.walletDocument === 'boolean');
    check(!route.walletDocument || route.owner === 'C' && !route.slashArguments
      && ['/local/clearbridge/index.php','/local/clearbridge/configure.php'].includes(route.path));
    check(!route.slashArguments || route.path !== '/' && !route.path.endsWith('/'));
    check(route.path !== callback || route.owner === 'A' && !route.slashArguments
      && route.methods.join(',') === 'GET' && route.query.every(k => /^privy_oauth_(code|state|provider)$/.test(k)));
    if (route.owner === 'C') {
      check(!route.path.startsWith('/auth') && !route.path.startsWith('/moodle/connect')
        && !route.path.startsWith('/bootcamp') && !route.path.startsWith('/clear-assets')
        && !route.query.some(k => /oauth|token|authorization|signature|csrf/i.test(k)));
      check(route.path !== '/local/clearbridge/authority.php' && route.path !== '/local/clearbridge/login_authority.php');
    }
    return Object.freeze({...route, methods: [...route.methods], query: [...route.query]});
  });
  check(new Set(inventory.map(r => r.path)).size === inventory.length);

  function classify(req) {
    check(req.socket?.encrypted === true && req.headers.host === url.host);
    check(!req.headers.authorization && !req.headers['proxy-authorization']
      && !req.headers['content-encoding'] && !req.headers.upgrade);
    check(typeof req.url === 'string' && req.url.length <= 8192 && !/[\x00-\x20\x7f\\#]/.test(req.url));
    const q = req.url.indexOf('?'), path = q < 0 ? req.url : req.url.slice(0, q);
    check(safePath(path));
    const candidates = inventory.filter(r => r.path === path || r.slashArguments && path.startsWith(r.path + '/'));
    check(candidates.length === 1);
    const route = candidates[0];
    check(route.methods.includes(req.method));
    const search = new URLSearchParams(q < 0 ? '' : req.url.slice(q + 1));
    check([...search.keys()].length === new Set(search.keys()).size
      && [...search].every(([k, v]) => route.query.includes(k) && v.length <= 4096 && !/[\x00-\x1f\x7f]/.test(v)));
    // Only A consumes OAuth return parameters. A must not forward or log them.
    check(path === callback || ![...search.keys()].some(k => /oauth|access_token|id_token/i.test(k)));
    if (req.method !== 'GET') check(req.headers.origin === origin && req.headers['sec-fetch-site'] === 'same-origin');
    if (req.headers.origin !== undefined) check(req.headers.origin === origin);
    return route;
  }
  function requestHeaders(owner, input, nonce) {
    check(['A', 'C'].includes(owner));
    const allowed = headersFor(owner), output = {host: url.host};
    for (const [key, value] of Object.entries(input)) if (allowed.has(key.toLowerCase())) output[key.toLowerCase()] = value;
    const names = new Set(), kept = [];
    check(input.cookie === undefined || typeof input.cookie === 'string' && input.cookie.length <= 16384);
    for (const part of (input.cookie ?? '').split(';')) {
      if (!part.trim()) continue;
      const match = /^\s*([^=;\s]+)=([^;\x00-\x20\x7f]*)\s*$/.exec(part);
      check(match && token.test(match[1]));
      const name = match[1];
      check(!names.has(name)); names.add(name);
      if (owner === 'A' ? clearCookie.test(name) : name === moodleCookieName) kept.push(name + '=' + match[2]);
    }
    if (kept.length) output.cookie = kept.join('; ');
    if (nonce !== undefined) {
      check(owner === 'C' && /^[A-Za-z0-9+/]{32}$/.test(nonce));
      output['x-clear-document-nonce'] = nonce;
    }
    return output;
  }
  function responseCookie(owner, raw) {
    check(typeof raw === 'string' && raw.length <= 8192 && !/[\r\n]/.test(raw));
    const parts = raw.split(';').map(p => p.trim()), pair = /^([^=]+)=([^;\x00-\x20\x7f]*)$/.exec(parts.shift());
    check(pair && (owner === 'A' ? clearCookie.test(pair[1]) : pair[1] === moodleCookieName));
    const attrs = new Map();
    for (const item of parts) {
      const at = item.indexOf('='), name = (at < 0 ? item : item.slice(0, at)).toLowerCase();
      check(!attrs.has(name)); attrs.set(name, at < 0 ? true : item.slice(at + 1));
    }
    check(!attrs.has('domain') && attrs.get('path') === '/' && attrs.get('secure') === true && attrs.get('httponly') === true);
    check(owner === 'A' ? String(attrs.get('samesite')).toLowerCase() === 'strict'
      : ['lax', 'strict'].includes(String(attrs.get('samesite')).toLowerCase()));
    return raw;
  }
  function responseHeaders(owner, input) {
    const output = {}, names = new Set();
    for (const [key, value] of Object.entries(input)) {
      const name = key.toLowerCase();
      check(!names.has(name)); names.add(name);
      if (name === 'set-cookie') output[name] = (Array.isArray(value) ? value : [value]).map(v => responseCookie(owner, v));
      else if (name === 'location') {
        check(typeof value === 'string' && !value.startsWith('//') && !/[\\\x00-\x20\x7f]/.test(value));
        const target = new URL(value, origin);
        check(target.origin === origin && !target.hash && !target.username && !target.password);
        const route = classify({url: target.pathname + target.search, method: 'GET', socket: {encrypted: true}, headers: {host: url.host}});
        // Cross-owner redirects need a dedicated, reviewed callback handler.
        check(route.owner === owner); output[name] = target.pathname + target.search;
      } else if (['content-type', 'content-length', 'content-encoding', 'content-security-policy', 'vary'].includes(name)) output[name] = value;
    }
    return {...output, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff'};
  }
  return Object.freeze({classify, requestHeaders, responseHeaders});
}

// Handlers receive the original Host/Origin and filtered credentials. C is a
// pinned local upstream adapter, not an arbitrary URL selected by the browser.
export function createMoodleFrontDoor({policy, handleA, handleC, rpcUrl}) {
  check(policy && typeof handleA === 'function' && typeof handleC === 'function');
  return async (req, res) => {
    try {
      const route = policy.classify(req);
      const nonce = route.walletDocument ? randomBytes(24).toString('base64') : undefined;
      req.headers = policy.requestHeaders(route.owner, req.headers, route.owner === 'C' ? nonce : undefined);
      req.rawHeaders = Object.entries(req.headers).flatMap(([name, value]) => [name, String(value)]);
      const originalSet = res.setHeader.bind(res), originalWriteHead = res.writeHead.bind(res);
      // Validate buffered headers together immediately before any bytes leave.
      res.writeHead = function(status, reason, supplied) {
        const headers = typeof reason === 'string' ? supplied : reason;
        check(headers === undefined || headers && !Array.isArray(headers));
        const filtered = policy.responseHeaders(route.owner, {...res.getHeaders(), ...headers});
        for (const key of res.getHeaderNames()) res.removeHeader(key);
        for (const [key, value] of Object.entries(filtered)) originalSet(key, value);
        if (nonce) originalSet('Content-Security-Policy', embeddedCsp(nonce, rpcUrl));
        return originalWriteHead(status);
      };
      await (route.owner === 'A' ? handleA : handleC)(req, res, {nonce});
    } catch {
      // Never include URLs, OAuth query values, cookies or upstream errors.
      if (res.headersSent) { res.destroy(); return; }
      for (const key of res.getHeaderNames()) res.removeHeader(key);
      res.statusCode = 403;
      // Bypass any rejected upstream header set when writing this fixed error.
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.end('{"error":"MOODLE_FRONT_DOOR_UNAVAILABLE"}');
    }
  };
}
