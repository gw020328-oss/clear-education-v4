import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {check} from './config.mjs';

export function signature(secret, timestamp, nonce, path, body) {
  return createHmac('sha256', secret).update(`${timestamp}\n${nonce}\nPOST\n${path}\n${createHash('sha256').update(body).digest('hex')}`).digest('hex');
}
export function authenticate(req, rawBody, {secret, config, store, now}) {
  check(req.headers.host === new URL(config.publicOrigin).host, 'HOST_REJECTED');
  check(!req.headers.origin && !req.headers.cookie && !req.headers['sec-fetch-site'], 'SERVER_TO_SERVER_ONLY');
  const timestamp=req.headers['x-clear-timestamp'], nonce=req.headers['x-clear-nonce'], mac=req.headers['x-clear-signature'];
  check(typeof timestamp === 'string' && /^[0-9]{10}$/.test(timestamp)
    && Math.abs(now-Number(timestamp)*1000)<=60000 && typeof nonce==='string'
    && /^[a-f0-9]{32}$/.test(nonce) && typeof mac==='string' && /^[a-f0-9]{64}$/.test(mac), 'AUTH_REQUIRED');
  const expected=signature(secret,timestamp,nonce,req.url,rawBody);
  check(timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(expected,'hex')), 'AUTH_REQUIRED');
  store.nonce(nonce,now);
}
