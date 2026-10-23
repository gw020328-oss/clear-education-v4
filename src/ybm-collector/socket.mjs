import WebSocket from 'ws';

export const TRANSPORT_SEND_LIMIT=2*1024*1024, PROOF_SEND_LIMIT=32*1024*1024;
const boundedFailures=new WeakMap();
const sendFailure=code=>{const error=new Error(code);boundedFailures.set(error,code);return error;};
// Only errors minted by this sender carry provenance. Never inspect messages,
// types, causes or transport payloads supplied by a caller.
export const boundedSendFailure=error=>boundedFailures.get(error)??null;
function stopWithFailure(socket,reject,code){
  const error=sendFailure(code);
  // A failed termination must not replace or prevent the original send failure.
  // The collection owner still performs its normal connection cleanup.
  try{socket.terminate();}catch{}
  reject(error);
}
export function makeSocket(url,{proofMode=false}={}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'wss:' || parsed.hostname !== 'attestor.reclaimprotocol.org' || parsed.port !== '444' || parsed.pathname !== '/ws' || parsed.username || parsed.password) throw new Error('INVALID_ATTESTOR_URL');
  const socket = new WebSocket(url, {rejectUnauthorized: true, followRedirects: false, handshakeTimeout: 25000, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false, closeTimeout: 1000});
  installBoundedSender(socket,{proofMode});
  return socket;
}
export function installBoundedSender(socket,{proofMode=false}={}) {
  const limit=proofMode?PROOF_SEND_LIMIT:TRANSPORT_SEND_LIMIT;
  socket.sendPromise = bytes => new Promise((resolve, reject) => {
    if (bytes.length + socket.bufferedAmount > limit) {
      stopWithFailure(socket,reject,'ATTESTOR_BACKPRESSURE_LIMIT'); return;
    }
    const timer = setTimeout(() => stopWithFailure(socket,reject,'ATTESTOR_SEND_TIMEOUT'), proofMode?60000:10000);
    try{socket.send(bytes, error => {clearTimeout(timer);if(error)reject(sendFailure('ATTESTOR_SEND_FAILED'));else resolve();});}
    catch{clearTimeout(timer);reject(sendFailure('ATTESTOR_SEND_FAILED'));}
  });
  return socket;
}
