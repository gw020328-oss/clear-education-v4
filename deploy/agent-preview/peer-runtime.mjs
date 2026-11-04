import {join,dirname} from 'node:path';
import {readSecret} from './config.mjs';
import {readPrivateJson,validateRelease,validateRegistration} from './peer-release.mjs';
import {createPeerReplayStore} from './vendor/b-peer/peer-transport.mjs';
import {openStore} from './store.mjs';
import {createPeerEngine} from './peer-engine.mjs';
import {createPeerServer} from './peer-http.mjs';
import {peerReceipts} from './peer-receipts.mjs';

export async function startPeerRuntime(releasePath) {
  const release=validateRelease(readPrivateJson(releasePath));
  if(!peerReceipts.ready || release.receiptContract!==peerReceipts.id)throw Error('RECEIPT_CONTRACT_PENDING');
  if(release.mode!=='ACTUAL_GEMINI')throw Error('OFFLINE_TRANSPORT_REQUIRES_TEST_COMPOSITION');
  const registration=validateRegistration(readPrivateJson(process.env.CLEAR_PEER_REGISTRATION),release,Date.now());
  const key=Buffer.from(readSecret(release.config.sharedSecretFile,/^[a-f0-9]{64}$/),'hex');
  let store,replay,engine,server;
  try {
    store=openStore(release.config.databasePath);
    replay=createPeerReplayStore({path:join(dirname(release.config.databasePath),'peer-replay.sqlite')});
    engine=createPeerEngine({release,registration,key,replay,store,receipts:peerReceipts});
    // Dedicated TLS proxy on the same host must preserve the exact public Host.
    server=createPeerServer({engine,origin:release.config.publicOrigin});
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(release.config.port,'127.0.0.1',resolve);
    });
  } catch(e) {engine?.close();replay?.close();store?.close();throw e;}
  finally {key.fill(0);}
  console.log(JSON.stringify({event:'PEER_LISTENING',mode:release.mode,port:release.config.port,paymentAllowed:false}));
  let stopping=false;
  const stop=()=>{
    if(stopping)return;
    stopping=true;
    engine.close();
    server.close(()=>{replay.close();store.close();});
    server.closeAllConnections();
  };
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  return {server,stop};
}
