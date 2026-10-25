import WebSocket from 'ws';
import {currentSendContext} from './send-context.mjs';

const MiB=1024*1024;
// Whole encoded RPC messages, including their protobuf envelope. The pinned
// official server constructs ws without a maxPayload override (100 MiB default).
// This local policy is not evidence of the deployed server's configuration.
export const TRANSPORT_SEND_LIMIT=2*MiB, PROOF_SEND_LIMIT=100*MiB;
// Reserve one maximum proof plus the previous 32 MiB backlog budget. Counting
// active AND waiting bytes also admits a large proof behind a small tunnel send.
export const PROOF_RETAINED_LIMIT=PROOF_SEND_LIMIT+32*MiB, MAX_PENDING_SENDS=64;
const POLL_MS=10;
const boundedFailures=new WeakMap(),installed=new WeakSet();
const sendFailure=(code,details)=>{
 const error=new Error(code);boundedFailures.set(error,{code,details:Object.freeze(details)});return error;
};
// Exact local object provenance only; never inspect arbitrary errors or payloads.
export const boundedSendFailure=error=>boundedFailures.get(error)?.code??null;
export const boundedSendDetails=error=>boundedFailures.get(error)?.details??null;

export function makeSocket(url,{proofMode=false,signal}={}) {
 signal?.throwIfAborted();
 const parsed=new URL(url);
 if(parsed.protocol!=='wss:'||parsed.hostname!=='attestor.reclaimprotocol.org'||parsed.port!=='444'||parsed.pathname!=='/ws'||parsed.username||parsed.password)throw new Error('INVALID_ATTESTOR_URL');
 const socket=new WebSocket(url,{rejectUnauthorized:true,followRedirects:false,handshakeTimeout:25000,maxPayload:4*MiB,perMessageDeflate:false,closeTimeout:1000});
 installBoundedSender(socket,{proofMode,signal});
 return socket;
}

export function installBoundedSender(socket,{proofMode=false,signal}={}) {
 if(installed.has(socket))return socket;
 installed.add(socket);
 const frameLimit=proofMode?PROOF_SEND_LIMIT:TRANSPORT_SEND_LIMIT;
 const retainedLimit=proofMode?PROOF_RETAINED_LIMIT:TRANSPORT_SEND_LIMIT;
 const timeoutMs=proofMode?60000:10000;
 const queue=[];let active=null,retainedBytes=0,count=0,poll=null,terminal=null,terminalDetails=null;
 const queuedBytes=()=>{
  try{const n=socket.bufferedAmount;return Number.isSafeInteger(n)&&n>=0?n:null;}catch{return null;}
 };
 const details=(item,phase)=>{
  const now=performance.now();
  return Object.freeze({phase,frameBytes:item.frameBytes,socketQueuedBytes:queuedBytes(),
   retainedBytes,pendingCount:count,frameLimitBytes:frameLimit,retainedLimitBytes:retainedLimit,
   pendingCountLimit:MAX_PENDING_SENDS,timeoutMs:item.budgetMs,
   waitMs:Math.max(0,(item.sentAt??now)-item.enteredAt),sendMs:item.sentAt===null?null:Math.max(0,now-item.sentAt),
   terminalReason:terminal,terminalFrameBytes:terminalDetails?.frameBytes??null,
   terminalSocketQueuedBytes:terminalDetails?.socketQueuedBytes??null,
   terminalRetainedBytes:terminalDetails?.retainedBytes??null,terminalPendingCount:terminalDetails?.pendingCount??null});
 };
 const notify=(item,state,error,metadata)=>{try{item.observe?.(state,error,metadata);}catch{}};
 const finish=(item,error,metadata)=>{
  if(item.done)return;
  item.done=true;clearTimeout(item.timer);item.timer=null;
  if(item.reserved){retainedBytes-=item.frameBytes;count--;item.reserved=false;}
  // Drop sender-owned references before settling. ws/SDK may retain their own
  // copies until close/return; this does not claim secure memory erasure.
  item.bytes=null;
  notify(item,error?'FAILED':'COMPLETED',error,metadata);
  item.observe=null;
  if(error)item.reject(error);else item.resolve();
  item.resolve=item.reject=null;
 };
 const cleanup=()=>{
  clearTimeout(poll);poll=null;
  socket.removeEventListener?.('close',onClose);socket.removeEventListener?.('error',onError);
  signal?.removeEventListener('abort',onAbort);
 };
 const stop=(code,trigger=null,terminate=true)=>{
  if(terminal)return;
  terminal=code;terminalDetails={frameBytes:trigger?.frameBytes??null,socketQueuedBytes:queuedBytes(),retainedBytes,pendingCount:count};cleanup();
  const waiting=queue.splice(0),current=active;active=null;
  // Report the initiating failure first. Other admitted sends are closed by
  // that failure; do not mislabel their smaller frames as MESSAGE_LIMIT.
  if(trigger&&!trigger.done){const d=details(trigger,trigger.phase);finish(trigger,sendFailure(code,d),d);}
  for(const item of [current,...waiting])if(item&&!item.done){
   const d=details(item,item.phase),other=code==='ATTESTOR_SEND_ABORTED'?code:'ATTESTOR_SEND_CLOSED';
   finish(item,sendFailure(other,d),d);
  }
  if(terminate)try{socket.terminate();}catch{}
 };
 const onClose=()=>stop('ATTESTOR_SEND_CLOSED',active,false);
 const onError=()=>stop('ATTESTOR_SEND_FAILED',active);
 const onAbort=()=>stop('ATTESTOR_SEND_ABORTED',active);
 const expired=item=>performance.now()>=item.deadline;
 const expire=item=>{
  if(item.done||terminal)return;
  if(item.sentAt!==null){stop('ATTESTOR_SEND_TIMEOUT',item);return;}
  // An unsent expired control RPC can be discarded safely. In particular, a
  // 5s disconnect waiting behind a proof must not abort that unrelated proof.
  if(active===item){active=null;clearTimeout(poll);poll=null;}
  const index=queue.indexOf(item);if(index>=0)queue.splice(index,1);
  const d=details(item,item.phase);finish(item,sendFailure('ATTESTOR_QUEUE_TIMEOUT',d),d);
  queueMicrotask(pump);
 };
 const sendActive=()=>{
  poll=null;const item=active;if(!item||item.done||terminal)return;
  if(signal?.aborted){onAbort();return;}
  if(expired(item)){expire(item);return;}
  if(socket.readyState!==1){stop('ATTESTOR_SEND_CLOSED',item);return;}
  const queued=queuedBytes();if(queued===null){stop('ATTESTOR_SEND_FAILED',item);return;}
  if(queued!==0){
   if(item.phase!=='DRAIN_WAIT'){item.phase='DRAIN_WAIT';notify(item,'OBSERVED',undefined,details(item,item.phase));}
   if(terminal||item.done)return;
   if(signal?.aborted){onAbort();return;}
   if(expired(item)){expire(item);return;}
   // ws has no public drain event. Do not inspect _socket/_sender internals.
   poll=setTimeout(sendActive,Math.min(POLL_MS,Math.max(1,item.deadline-performance.now())));return;
  }
  item.phase='SENDING';
  notify(item,'STARTED',undefined,details(item,item.phase));
  // Observer persistence is synchronous; recheck after it returns too.
  if(terminal||item.done)return;
  if(signal?.aborted){onAbort();return;}
  if(expired(item)){expire(item);return;}
  item.sentAt=performance.now();
  try{socket.send(item.bytes,error=>{
   if(item.done||terminal)return;
   if(error){stop('ATTESTOR_SEND_FAILED',item);return;}
   if(signal?.aborted){onAbort();return;}
   if(expired(item)){expire(item);return;}
   const d=details(item,'COMPLETE');active=null;finish(item,null,d);
   queueMicrotask(pump);
  });}catch{if(!item.done)stop('ATTESTOR_SEND_FAILED',item);}
 };
 const pump=()=>{
  if(terminal||active||!queue.length)return;
  active=queue.shift();sendActive();
 };
 socket.addEventListener?.('close',onClose);socket.addEventListener?.('error',onError);
 signal?.addEventListener('abort',onAbort,{once:true});
 socket.sendPromise=bytes=>new Promise((resolve,reject)=>{
  // Capture at admission: a later pump may run in another RPC's ALS context.
  const context=currentSendContext(),enteredAt=performance.now();
  const deadline=Math.min(enteredAt+timeoutMs,context?.deadline??Infinity);
  const frameBytes=bytes instanceof Uint8Array?bytes.byteLength:null;
  const item={bytes,frameBytes,enteredAt,deadline,budgetMs:Math.max(0,deadline-enteredAt),sentAt:null,
   observe:context?.observe,resolve,reject,timer:null,reserved:false,done:false,phase:'ADMISSION'};
  if(terminal){const d=details(item,item.phase);finish(item,sendFailure(terminal==='ATTESTOR_SEND_ABORTED'?terminal:'ATTESTOR_SEND_CLOSED',d),d);return;}
  if(signal?.aborted){stop('ATTESTOR_SEND_ABORTED',item);return;}
  if(frameBytes===null){stop('ATTESTOR_SEND_FAILED',item);return;}
  if(expired(item)){expire(item);return;}
  // Encoding may have delayed timer callbacks. Expired reservations must not
  // turn the next valid admission into an artificial queue overflow. The
  // snapshot contains at most MAX_PENDING_SENDS entries.
  for(const previous of [active,...queue])if(previous&&!previous.done&&expired(previous))expire(previous);
  if(terminal){const d=details(item,item.phase);finish(item,sendFailure(terminal==='ATTESTOR_SEND_ABORTED'?terminal:'ATTESTOR_SEND_CLOSED',d),d);return;}
  if(expired(item)){expire(item);return;}
  if(frameBytes>frameLimit){stop('ATTESTOR_MESSAGE_LIMIT',item);return;}
  if(retainedBytes+frameBytes>retainedLimit||count>=MAX_PENDING_SENDS){stop('ATTESTOR_QUEUE_LIMIT',item);return;}
  item.reserved=true;retainedBytes+=frameBytes;count++;queue.push(item);item.phase='QUEUED';
  item.timer=setTimeout(()=>expire(item),Math.max(1,deadline-performance.now()));
  notify(item,'OBSERVED',undefined,details(item,item.phase));
  pump();
 });
 if(signal?.aborted)onAbort();
 return socket;
}
