// Synthetic bytes only. The peer is a local ws server with the same default
// receive limit as the published Attestor server source, not a remote attestor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {Wallet} from 'ethers';
import {installBoundedSender,PROOF_SEND_LIMIT,boundedSendFailure} from '../../src/ybm-collector/socket.mjs';
import {proto,SIGNATURES} from '../../src/ybm-collector/node_modules/@reclaimprotocol/attestor-core/lib/index.js';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
const WebSocket=require('ws'),{WebSocketServer}=WebSocket;
const MiB=1024*1024;
const envelope=req=>proto.RPCMessages.create({messages:[{id:1,claimTunnelRequest:req}]});
function sizedRequest(size){
 const proofData=new Uint8Array(size).fill(0x5a);
 const req=proto.ClaimTunnelRequest.create({data:{provider:'http',parameters:'{}',context:'{}'},zkEngine:proto.ZKProofEngine.ZK_ENGINE_STWO,
  transcript:[{sender:proto.TranscriptMessageSenderType.TRANSCRIPT_MESSAGE_SENDER_TYPE_SERVER,message:new Uint8Array([23]),reveal:{zkReveal:{proofs:[{proofData:proofData.subarray(0,size-1024)}]}}}],signatures:{requestSignature:new Uint8Array(65)}});
 const encoded=proto.RPCMessages.encode(envelope(req)).finish();
 req.transcript[0].reveal.zkReveal.proofs[0].proofData=proofData.subarray(0,size-1024+(size-encoded.length));
 return req;
}
async function peer(t){
 // Intentionally no maxPayload override, matching published create-server.ts.
 const server=new WebSocketServer({host:'127.0.0.1',port:0,perMessageDeflate:false});await once(server,'listening');
 const received=[];server.on('connection',socket=>{socket.on('error',()=>{});socket.on('message',data=>{received.push(data.length);socket.send(Buffer.from([1]));});});
 t.after(async()=>{for(const s of server.clients)s.terminate();await new Promise(resolve=>server.close(resolve));});
 const socket=new WebSocket(`ws://127.0.0.1:${server.address().port}`,{perMessageDeflate:false,maxPayload:4*MiB});socket.on('error',()=>{});await once(socket,'open');
 t.after(()=>socket.terminate());return {socket,server,received};
}

test('100MiB encoded and signed synthetic proof crosses real local ws masking/receive boundaries',async t=>{
 const {socket,received}=await peer(t);installBoundedSender(socket,{proofMode:true});
 const rssBefore=process.memoryUsage().rss,owner=Wallet.createRandom(),signer=SIGNATURES[proto.ServiceSignatureType.SERVICE_SIGNATURE_TYPE_ETH];
 const req=sizedRequest(PROOF_SEND_LIMIT);req.signatures=undefined;
 let start=performance.now();const unsigned=proto.ClaimTunnelRequest.encode(req).finish();const unsignedEncodeMs=performance.now()-start;
 start=performance.now();const signature=await signer.sign(unsigned,owner.privateKey);const signMs=performance.now()-start;
 req.signatures={requestSignature:signature};start=performance.now();const bytes=proto.RPCMessages.encode(envelope(req)).finish();const rpcEncodeMs=performance.now()-start;
 assert.equal(bytes.length,PROOF_SEND_LIMIT);assert.equal(signature.length,65);
 const acknowledgment=once(socket,'message');start=performance.now();await socket.sendPromise(bytes);const writeMs=performance.now()-start;await acknowledgment;const loopbackMs=performance.now()-start;
 assert.deepEqual(received,[PROOF_SEND_LIMIT]);assert.equal(socket.bufferedAmount,0);
 // The local peer only checks transport. It does not validate a ZK proof.
 t.diagnostic(JSON.stringify({scope:'SYNTHETIC_ENCODE_SIGN_LOOPBACK_NOT_ZK_OR_REMOTE',frameBytes:bytes.length,unsignedBytes:unsigned.length,unsignedEncodeMs,signMs,rpcEncodeMs,writeMs,loopbackMs,rssBefore,rssAfter:process.memoryUsage().rss,processPeakRssBytes:process.resourceUsage().maxRSS*1024}));
});

test('one-byte excess encoded frame is rejected locally before any ws send',async t=>{
 const {socket,received}=await peer(t);let calls=0;const send=socket.send.bind(socket);socket.send=(...args)=>{calls++;return send(...args);};
 installBoundedSender(socket,{proofMode:true});const bytes=proto.RPCMessages.encode(envelope(sizedRequest(PROOF_SEND_LIMIT+1))).finish();assert.equal(bytes.length,PROOF_SEND_LIMIT+1);
 await assert.rejects(socket.sendPromise(bytes),error=>boundedSendFailure(error)==='ATTESTOR_MESSAGE_LIMIT');assert.equal(calls,0);assert.deepEqual(received,[]);
});

test('local unmodified ws server rejects a message above its 100MiB default',async t=>{
 const {socket,received}=await peer(t),closed=once(socket,'close');socket.send(Buffer.alloc(PROOF_SEND_LIMIT+1),()=>{});
 const [code]=await closed;assert.equal(code,1009);assert.deepEqual(received,[]);
});
