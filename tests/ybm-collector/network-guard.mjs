// Tests may use IPv4 loopback only. This is a test tripwire, not an OS sandbox.
import net from 'node:net';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const a = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof a[0] === 'object' ? a[0] : { port: a[0], host: a[1] };
  if (options.host !== '127.0.0.1') throw new Error('EXTERNAL_NETWORK_DISABLED');
  return original.apply(this, args);
};
globalThis.fetch = () => { throw new Error('FETCH_DISABLED'); };
const lookup = dns.lookup;
dns.lookup = (host, ...rest) => { if(host !== '127.0.0.1') throw new Error('DNS_DISABLED'); return lookup(host, ...rest); };
syncBuiltinESMExports();
