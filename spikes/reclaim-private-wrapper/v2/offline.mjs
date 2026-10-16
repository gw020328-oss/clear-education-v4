// JS network tripwire for a trusted research worker. Not an OS sandbox.
import net from 'node:net';import dns from 'node:dns';
import {syncBuiltinESMExports} from 'node:module';
const denied=()=>{throw Error('WORKER_NETWORK_DISABLED');};
net.Socket.prototype.connect=denied;net.Server.prototype.listen=denied;
dns.lookup=denied;dns.resolve=denied;globalThis.fetch=denied;
syncBuiltinESMExports();
