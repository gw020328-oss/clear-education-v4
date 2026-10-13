// Offline synthetic tripwire, not an OS/network sandbox for child Chrome.
import net from 'node:net';
import dns from 'node:dns';
import {syncBuiltinESMExports} from 'node:module';
net.Socket.prototype.connect = function () { throw new Error('NETWORK_DISABLED'); };
dns.lookup = function () { throw new Error('NETWORK_DISABLED'); };
globalThis.fetch = function () { throw new Error('NETWORK_DISABLED'); };
syncBuiltinESMExports();
