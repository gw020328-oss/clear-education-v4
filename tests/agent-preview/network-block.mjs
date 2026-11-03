import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';
const blocked=()=>{throw Error('OFFLINE_NETWORK_FORBIDDEN');};
globalThis.fetch=blocked;net.connect=blocked;net.createConnection=blocked;net.Socket.prototype.connect=blocked;
http.request=blocked;http.get=blocked;https.request=blocked;https.get=blocked;dgram.createSocket=blocked;
syncBuiltinESMExports();
