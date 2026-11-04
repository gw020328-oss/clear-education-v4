import {randomBytes} from 'node:crypto';
import {validateConfig, embeddedCsp} from '../../src/embedded-wallet/config.mjs';
const path = '/local/clearbridge/wallet-return';
export function createMoodleOAuthReturn({config, courseId}) {
  const c = validateConfig(config);
  if (c.surface !== 'MOODLE_NATIVE' || !Number.isSafeInteger(courseId) || courseId < 1) throw Error('MOODLE_OAUTH_RETURN_CONFIG');
  const publicConfig = JSON.stringify({...c, courseId}).replace(/</g, '\\u003c');
  return (req, res) => {
    if (req.url.split('?')[0] !== path) return false;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = () => {res.writeHead(403, {'Content-Type':'text/plain'});res.end('MOODLE_OAUTH_RETURN_UNAVAILABLE');return true;};
    if (req.method !== 'GET' || !req.socket.encrypted || req.headers.host !== new URL(c.origin).host
        || req.headers.authorization || req.url.length > 8192 || /[\\#\x00-\x20\x7f]/.test(req.url)) return fail();
    const query = new URL(req.url, c.origin).searchParams;
    const expected = ['privy_oauth_code','privy_oauth_state','privy_oauth_provider'];
    if ([...query.keys()].length !== 3 || !expected.every(k => query.getAll(k).length === 1 && query.get(k).length > 0)
        || query.get('privy_oauth_provider') !== 'google') return fail();
    const nonce = randomBytes(24).toString('base64');
    res.setHeader('Content-Security-Policy', embeddedCsp(nonce,c.rpcUrl));
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="sc-nonce" content="${nonce}"><title>Google 연결 확인</title><div id="clear-oauth-return"></div><script id="clear-oauth-config" type="application/json" nonce="${nonce}">${publicConfig}</script><script type="module" nonce="${nonce}" src="/clear-assets/moodle-oauth-return.js"></script></html>`);
    return true;
  };
}
