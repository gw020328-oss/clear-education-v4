import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {exactKeys, requireRule as check} from '../../src/policy/values.mjs';
import {readLoginJson, protectLoginResponse} from './moodle-login-wire.mjs';

const popup = '/moodle/connect';
const script = popup + '/popup.js';
const redeem = popup + '/redeem';
const googleStart = popup + '/google-start';
const nativeBootstrap = popup + '/bootstrap';
const scriptBytes = readFileSync(new URL('./moodle-login-popup.js', import.meta.url));
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function createMoodleLoginBrowser({origin, moodleOrigin, ownerRunId, intents, now, signal, native = false}) {
  const clear = new URL(origin), moodle = new URL(moodleOrigin);
  check(clear.origin === origin && clear.protocol === 'https:' && clear.hostname === '127.0.0.1'
    && moodle.origin === moodleOrigin && ['https:', 'http:'].includes(moodle.protocol)
    && /^[a-z0-9.-]+$/.test(moodle.hostname) && (moodle.protocol === 'https:' || moodle.hostname === '127.0.0.1'),
    'MOODLE_LOGIN_BROWSER_CONFIG');
  check(typeof native === 'boolean' && (!native || origin === moodleOrigin), 'MOODLE_LOGIN_NATIVE_ORIGIN');
  const cookiePrefix = '__Host-clear-ml-' + createHash('sha256').update(ownerRunId).digest('hex').slice(0, 24);
  const paths = native ? [nativeBootstrap, redeem] : [popup, script, redeem, googleStart];
  const bootstrapName = cookiePrefix + '-boot', bindingName = cookiePrefix + '-binding';
  const cookie = (name, value, age) => name + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + age;
  function readCookie(header = '', name) {
    check(header.length <= 4096, 'MOODLE_LOGIN_COOKIE');
    const entries = header.split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
    if (!entries.length) return null;
    const value = entries[0].slice(name.length + 1);
    check(entries.length === 1 && hex(value), 'MOODLE_LOGIN_COOKIE');
    return value;
  }
  return Object.freeze({
    native,
    matches: path => paths.includes(path),
    async handle(req, res) {
      protectLoginResponse(res);
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      try {
        signal?.throwIfAborted();
        check(req.socket.encrypted && req.headers.host === clear.host
          && !req.headers.authorization, 'MOODLE_LOGIN_BROWSER');
        check(paths.includes(req.url), 'MOODLE_LOGIN_BROWSER');
        if (req.url === popup && req.method === 'GET') {
          check(req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document',
            'MOODLE_LOGIN_BROWSER');
          const boot = intents.bootstrap();
          res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8',
            'Set-Cookie': cookie(bootstrapName, boot.bootstrapCookie, boot.expiresAtExclusive - now())});
          res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>CLEAR 연결</title><main data-moodle-origin="${moodleOrigin}" data-challenge="${boot.challenge}">Moodle 연결을 확인하는 중입니다.</main><script src="${script}" defer></script></html>`);
          return;
        }
        check(req.headers['sec-fetch-site'] === 'same-origin', 'MOODLE_LOGIN_BROWSER');
        if (native && req.url === nativeBootstrap) {
          check(req.method === 'POST' && req.headers.origin === origin, 'MOODLE_LOGIN_BROWSER');
          const {value} = await readLoginJson(req);
          exactKeys(value, [], 'MOODLE_LOGIN_BOOTSTRAP');
          signal?.throwIfAborted();
          check(!intents.browserPending(readCookie(req.headers.cookie, bindingName)), 'MOODLE_LOGIN_BROWSER_BUSY');
          const boot = intents.bootstrap();
          res.writeHead(200, {'Content-Type': 'application/json',
            'Set-Cookie': cookie(bootstrapName, boot.bootstrapCookie, boot.expiresAtExclusive - now())});
          res.end(JSON.stringify({challenge: boot.challenge, expiresAtExclusive: boot.expiresAtExclusive}));
          return;
        }
        if (req.url === script && req.method === 'GET') {
          res.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8'});
          res.end(scriptBytes);
          return;
        }
        check([redeem, googleStart].includes(req.url) && req.method === 'POST'
          && req.headers.origin === origin, 'MOODLE_LOGIN_BROWSER');
        const {value} = await readLoginJson(req);
        signal?.throwIfAborted();
        if (req.url === googleStart) {
          exactKeys(value, [], 'MOODLE_LOGIN_GOOGLE_START');
          const start = intents.takeGoogleStart(readCookie(req.headers.cookie, bindingName));
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({start}));
          return;
        }
        exactKeys(value, ['code', 'challenge', 'browserProof'], 'MOODLE_LOGIN_LAUNCH');
        check(!intents.browserPending(readCookie(req.headers.cookie, bindingName)), 'MOODLE_LOGIN_BROWSER_BUSY');
        const binding = intents.redeem({...value, bootstrapCookie: readCookie(req.headers.cookie, bootstrapName)}, {native});
        if (native) {
          check(['/onboarding', '/operator'].includes(binding.location), 'MOODLE_LOGIN_ROLE');
          res.writeHead(200, {'Content-Type': 'application/json', 'Set-Cookie': [
            cookie(bootstrapName, '', 0), cookie(bindingName, binding.browserBinding, binding.expiresAtExclusive - now()),
          ]});
          res.end(JSON.stringify({status: 'WAITING', role: binding.location === '/operator' ? 'operator' : 'participant',
            expiresAtExclusive: binding.expiresAtExclusive,commandBinding:binding.commandBinding}));
          return;
        }
        res.writeHead(303, {Location: binding.location, 'Set-Cookie': [
          cookie(bootstrapName, '', 0), cookie(bindingName, binding.browserBinding, binding.expiresAtExclusive - now()),
        ]});
        res.end();
      } catch {
        res.writeHead(403, {'Content-Type': 'application/json'});
        res.end('{"error":"MOODLE_LOGIN_UNAVAILABLE"}');
      }
    },
    async complete(context, req, res, requestSignal) {
      const binding = readCookie(req.headers.cookie, bindingName);
      if (!binding) return {status: 'NOT_REQUESTED'};
      await intents.complete(binding, context, {signal: AbortSignal.any([requestSignal, signal].filter(Boolean))});
      res.setHeader('Set-Cookie', cookie(bindingName, '', 0));
      return {status: 'RETURN_TO_MOODLE'};
    },
  });
}
