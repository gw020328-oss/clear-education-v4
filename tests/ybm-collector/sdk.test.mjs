import test from 'node:test';
import assert from 'node:assert/strict';
import {openOfficialClient} from '../../src/ybm-collector/client.mjs';
import {makeSocket} from '../../src/ybm-collector/socket.mjs';

test('pinned SDK initializes crypto and RPC over an in-memory socket, then forbids another session',async()=>{
  // Exercise the real package exports/crypto/protobuf without reaching DNS or
  // a server. This catches missing exports and uninitialized crypto backends.
  process.env.LOG_LEVEL='silent';
  const {proto}=await import('../../src/ybm-collector/node_modules/@reclaimprotocol/attestor-core/lib/index.js');
  let created=0, socket;
  class MemorySocket extends EventTarget {
    OPEN=1;CLOSING=2;CLOSED=3;readyState=1;
    constructor(url){
      super();created++;socket=this;
      assert.equal(new URL(url).hostname,'attestor.reclaimprotocol.org');
      const init=proto.RPCMessages.decode(Buffer.from(new URL(url).searchParams.get('messages'),'base64')).messages[0];
      queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:proto.RPCMessages.encode(proto.RPCMessages.fromPartial({messages:[{id:init.id,initResponse:{}}]})).finish()})));
    }
    send(){}
    close(){this.readyState=this.CLOSED;this.dispatchEvent(new Event('close'));}
  }
  const connection=await openOfficialClient({socketFactory:url=>new MemorySocket(url)});
  assert.equal(connection.client.isInitialised,true);assert.equal(created,1);
  socket.sendPromise=async()=>{throw new Error('SYNTHETIC_SEND_FAILURE');};
  await assert.rejects(connection.client.rpc('createTunnel',{id:123,host:'example.invalid',port:443},1000),/SYNTHETIC_SEND_FAILURE/);
  await connection.close();await new Promise(resolve=>setImmediate(resolve));assert.equal(socket.readyState,3);
  await assert.rejects(openOfficialClient({socketFactory:()=>{throw new Error('MUST_NOT_RECONNECT');}}),/NEW_WORKER_REQUIRED/);
});

test('official WebSocket cannot be redirected to a different endpoint',()=>{
  for(const url of ['ws://attestor.reclaimprotocol.org:444/ws','wss://evil.example:444/ws','wss://attestor.reclaimprotocol.org/ws','wss://attestor.reclaimprotocol.org:444/else','wss://user:password@attestor.reclaimprotocol.org:444/ws'])assert.throws(()=>makeSocket(url),/INVALID_ATTESTOR_URL/);
});
