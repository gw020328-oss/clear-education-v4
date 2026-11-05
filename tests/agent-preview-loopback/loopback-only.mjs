// Test preload: allow only loopback TCP (the local HTTPS/HTTP servers these
// tests start). Any other destination, UDP and fetch to a non-loopback host
// throw before a byte is sent.
import net from 'node:net';
import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const blocked = () => { throw Error('OFFLINE_NETWORK_FORBIDDEN'); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === 'object' && first !== null ? (first.path ? 'unix' : first.host ?? 'localhost')
    : typeof args[1] === 'string' ? args[1] : 'localhost';
  if (!LOOPBACK.has(host)) blocked();
  return connect.apply(this, args);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (!LOOPBACK.has(url.hostname.replace(/^\[|\]$/g, ''))) blocked();
  return realFetch(input, init);
};
dgram.createSocket = blocked;
syncBuiltinESMExports();
