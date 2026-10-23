import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {AttestorError,getAttestorClientFromPool,proto} from '../../src/ybm-collector/node_modules/@reclaimprotocol/attestor-core/lib/index.js';
import {boundedSendFailure,installBoundedSender,PROOF_SEND_LIMIT} from '../../src/ybm-collector/socket.mjs';

const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;}};
const privateText='SYNTHETIC_PRIVATE_TRANSPORT_DETAIL';
const transportRequire=createRequire(new URL('../../src/ybm-collector/client.mjs',import.meta.url));
const {setCryptoImplementation}=await import(transportRequire.resolve('@reclaimprotocol/tls'));
const {webcryptoCrypto}=await import(transportRequire.resolve('@reclaimprotocol/tls/webcrypto'));
setCryptoImplementation(webcryptoCrypto);
let serial=0;
async function memoryClient(t,{mode='success',queueDelta}={}){
 let socket,created=0;
 class MemorySocket extends EventTarget{
  OPEN=1;CLOSING=2;CLOSED=3;readyState=1;bufferedAmount=0;sent=0;terminated=0;callback=null;frameLength=0;
  constructor(url){
   super();created++;socket=this;
   const initial=proto.RPCMessages.decode(Buffer.from(new URL(url).searchParams.get('messages'),'base64')).messages[0];
   queueMicrotask(()=>this.receive({id:initial.id,initResponse:{}}));
   installBoundedSender(this,{proofMode:true});
   const bounded=this.sendPromise;
   this.sendPromise=bytes=>{this.frameLength=bytes.length;if(queueDelta!==undefined)this.bufferedAmount=PROOF_SEND_LIMIT-bytes.length+queueDelta;return bounded(bytes);};
  }
  receive(message){this.dispatchEvent(new MessageEvent('message',{data:proto.RPCMessages.encode(proto.RPCMessages.create({messages:[message]})).finish()}));}
  send(bytes,callback){
   this.sent++;this.callback=callback;
   const request=proto.RPCMessages.decode(bytes).messages[0];
   assert.ok(request.claimTunnelRequest);
   if(mode==='sync-failure')throw Error(privateText);
   if(mode==='callback-failure'){callback(Error(privateText));return;}
   if(mode==='pending')return;
   callback();
   queueMicrotask(()=>this.receive(mode==='remote-error'?{id:request.id,requestError:{code:proto.ErrorCode.ERROR_INVALID_CLAIM,message:privateText,data:JSON.stringify({private:privateText})}}:{id:request.id,claimTunnelResponse:{}}));
  }
  terminate(){this.terminated++;this.readyState=this.CLOSING;queueMicrotask(()=>this.close());}
  close(){if(this.readyState===this.CLOSED)return;this.readyState=this.CLOSED;this.dispatchEvent(new Event('close'));}
 }
 // The real pinned factory and RPC codec run entirely against this memory port.
 const client=getAttestorClientFromPool(`wss://synthetic.invalid/claim-rpc-${++serial}`,()=>({logger:quiet,makeWebSocket:url=>new MemorySocket(url)}));
 const wait=client.waitForResponse.bind(client);
 // Match the production client's observation of a response promise when send fails.
 client.waitForResponse=(...args)=>{const pending=wait(...args);pending.catch(()=>{});return pending;};
 await client.waitForInit();assert.equal(created,1);t.after(()=>socket.close());
 return {client,socket};
}
const request=(size=16)=>proto.ClaimTunnelRequest.create({transcript:[{sender:proto.TranscriptMessageSenderType.TRANSCRIPT_MESSAGE_SENDER_TYPE_CLIENT,message:new Uint8Array(size)}]});

test('real claim RPC preserves exact combined frame-and-queue boundaries without retry',async t=>{
 for(const queueDelta of [-1,0,1]){
  const {client,socket}=await memoryClient(t,{queueDelta});
  if(queueDelta<=0){await client.rpc('claimTunnel',request());assert.equal(socket.sent,1);assert.equal(socket.terminated,0);}
  else{await assert.rejects(client.rpc('claimTunnel',request()),error=>boundedSendFailure(error)==='ATTESTOR_BACKPRESSURE_LIMIT');assert.equal(socket.sent,0);assert.equal(socket.terminated,1);}
  assert.equal(socket.frameLength+socket.bufferedAmount,PROOF_SEND_LIMIT+queueDelta);socket.close();
 }
});

test('real RPC rejects a synthetic frame larger than the proof cap before socket send',async t=>{
 const {client,socket}=await memoryClient(t);
 await assert.rejects(client.rpc('claimTunnel',request(PROOF_SEND_LIMIT+1)),error=>boundedSendFailure(error)==='ATTESTOR_BACKPRESSURE_LIMIT'&&!(error instanceof AttestorError));
 assert.ok(socket.frameLength>PROOF_SEND_LIMIT);assert.equal(socket.sent,0);assert.equal(socket.terminated,1);
});

test('real RPC keeps local callback failure provenance separate from a remote AttestorError',async t=>{
 for(const mode of ['callback-failure','sync-failure']){
 const local=await memoryClient(t,{mode});
 await assert.rejects(local.client.rpc('claimTunnel',request()),error=>{
  assert.equal(boundedSendFailure(error),'ATTESTOR_SEND_FAILED');assert.equal(error.message,'ATTESTOR_SEND_FAILED');
  assert.equal(error instanceof AttestorError,false);assert.equal(Object.hasOwn(error,'cause'),false);assert.equal(Object.hasOwn(error,'data'),false);return true;
 });
 assert.equal(local.socket.sent,1);assert.equal(local.socket.terminated,0);local.socket.close();
 }
 const remote=await memoryClient(t,{mode:'remote-error'});
 await assert.rejects(remote.client.rpc('claimTunnel',request()),error=>error instanceof AttestorError&&error.code==='ERROR_INVALID_CLAIM'&&boundedSendFailure(error)===null);
 assert.equal(remote.socket.sent,1);assert.equal(remote.socket.terminated,0);remote.socket.close();
});

test('proof send timeout precedes RPC timeout and late callbacks cannot replace its failure',async t=>{
 const {client,socket}=await memoryClient(t,{mode:'pending'});
 t.mock.timers.enable({apis:['setTimeout']});
 let settled=0;
 const pending=client.rpc('claimTunnel',request()).then(()=>assert.fail('must reject'),error=>{settled++;return error;});
 t.mock.timers.tick(59999);await Promise.resolve();assert.equal(settled,0);assert.equal(socket.terminated,0);
 t.mock.timers.tick(1);const error=await pending;
 assert.equal(boundedSendFailure(error),'ATTESTOR_SEND_TIMEOUT');assert.equal(error instanceof AttestorError,false);assert.equal(socket.terminated,1);assert.equal(socket.sent,1);
 socket.callback();socket.callback(Error(privateText));t.mock.timers.tick(90000);await Promise.resolve();
 assert.equal(settled,1);assert.equal(boundedSendFailure(error),'ATTESTOR_SEND_TIMEOUT');assert.equal(error.message,'ATTESTOR_SEND_TIMEOUT');assert.equal(socket.terminated,1);
});
