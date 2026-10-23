// Execute the exact installed SDK's post-WFV block with actual protobuf and
// EIP-191 signing. This is a seam reproduction, not a full TLS/ZK proof run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Wallet} from 'ethers';
import {sdk} from './fixture.mjs';
import {installClaimRpcObserver,observeClaimRpc} from '../../src/ybm-collector/claim-rpc-observer.mjs';
import {installBoundedSender,boundedSendFailure,PROOF_SEND_LIMIT} from '../../src/ybm-collector/socket.mjs';
const require=createRequire(new URL('../../src/hackerrank-evidence/worker-source.mjs',import.meta.url));
const source=readFileSync(require.resolve('@reclaimprotocol/attestor-core'),'utf8');
const start='  onStep?.({ name: "waiting-for-verification" });',end='  async function fetchCertificateBytesFromAttestor';
assert.equal(source.split(start).length,2);
const block=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
assert.ok(block.endsWith('  return result;\n'));
const run=new (Object.getPrototypeOf(async function(){}).constructor)('onStep','ClaimTunnelRequest','claimTunnelReq','signatureAlg','ownerPrivateKey','client','logger2',block);
const quiet={info(){}};
const signer=sdk.SIGNATURES[sdk.proto.ServiceSignatureType.SERVICE_SIGNATURE_TYPE_ETH];
const request=()=>sdk.proto.ClaimTunnelRequest.create({data:{provider:'http',parameters:'{}',context:'{}'},transcript:[]});
test('installed post-verification block encodes and signs before invoking the same client RPC',async()=>{
 const order=[],owner=Wallet.createRandom(),req=request(),result={claim:{}};
 const client={async rpc(type,value){assert.equal(this,client);assert.equal(type,'claimTunnel');assert.equal(value,req);order.push('RPC');return result;}};
 installClaimRpcObserver(client);const stop=observeClaimRpc(client,state=>order.push(state));
 const returned=await run(step=>{assert.equal(step.name,'waiting-for-verification');order.push('WFV');},sdk.proto.ClaimTunnelRequest,req,signer,owner.privateKey,client,quiet);
 assert.equal(returned,result);assert.deepEqual(order,['WFV','STARTED','RPC','COMPLETED']);
 const signature=req.signatures.requestSignature;req.signatures=undefined;
 assert.equal(await signer.verify(sdk.proto.ClaimTunnelRequest.encode(req).finish(),signature,owner.address),true);stop();
});
test('actual encoder and signer failures occur after WFV but before the observed RPC method',async()=>{
 const owner=Wallet.createRandom();
 for(const kind of ['ENCODE','SIGN']){
  const order=[],client={async rpc(){assert.fail('must not reach RPC');}},req=request();
  if(kind==='ENCODE')req.fixedServerIV=null;
  installClaimRpcObserver(client);const stop=observeClaimRpc(client,state=>order.push(state));
  await assert.rejects(run(()=>order.push('WFV'),sdk.proto.ClaimTunnelRequest,req,signer,kind==='SIGN'?'SYNTHETIC_INVALID_KEY':owner.privateKey,client,quiet),error=>error instanceof Error);
  assert.deepEqual(order,['WFV']);stop();
 }
});
test('post-verification signed RPC envelope hits the production bounded sender without network',async()=>{
 const owner=Wallet.createRandom(),order=[],socket=installBoundedSender({bufferedAmount:PROOF_SEND_LIMIT,sent:0,terminate(){},send(){this.sent++;}},{proofMode:true});
 const client={async rpc(type,req){const bytes=sdk.proto.RPCMessages.encode(sdk.proto.RPCMessages.create({messages:[{id:1,claimTunnelRequest:req}]})).finish();await socket.sendPromise(bytes);}};
 installClaimRpcObserver(client);const stop=observeClaimRpc(client,(state,error)=>order.push([state,boundedSendFailure(error)]));
 await assert.rejects(run(()=>order.push(['WFV',null]),sdk.proto.ClaimTunnelRequest,request(),signer,owner.privateKey,client,quiet),error=>boundedSendFailure(error)==='ATTESTOR_BACKPRESSURE_LIMIT');
 assert.deepEqual(order,[['WFV',null],['STARTED',null],['FAILED','ATTESTOR_BACKPRESSURE_LIMIT']]);assert.equal(socket.sent,0);stop();
});
test('an invalid resolved RPC response throws inside the SDK after RPC completion and before return',async()=>{
 const order=[],client={async rpc(){return null;}},owner=Wallet.createRandom();
 installClaimRpcObserver(client);const stop=observeClaimRpc(client,state=>order.push(state));
 await assert.rejects(run(()=>order.push('WFV'),sdk.proto.ClaimTunnelRequest,request(),signer,owner.privateKey,client,quiet),error=>error instanceof TypeError);
 assert.deepEqual(order,['WFV','STARTED','COMPLETED']);stop();
});
test('claim RPC observer preserves arguments, identity, errors, cancellation and non-claim behavior',async()=>{
 let finish,seen=0;const error=Error('SYNTHETIC_PRIVATE'),args=['claimTunnel',{private:'SYNTHETIC_PRIVATE'},5];
 const client={rpc(...received){assert.equal(this,client);assert.deepEqual(received,args);return new Promise((resolve,reject)=>{finish=()=>reject(error);});}};
 assert.equal(observeClaimRpc(client,()=>{}),null);installClaimRpcObserver(client);const rpc=client.rpc;installClaimRpcObserver(client);assert.equal(client.rpc,rpc);
 const stop=observeClaimRpc(client,()=>{seen++;throw Error('SYNTHETIC_OBSERVER_FAILURE');});assert.equal(observeClaimRpc(client,()=>{}),null);
 const pending=client.rpc(...args);assert.equal(seen,1);stop();finish();await assert.rejects(pending,e=>e===error);assert.equal(seen,1);
 const other={async rpc(){return 7;}};installClaimRpcObserver(other);const stopOther=observeClaimRpc(other,()=>assert.fail('non-claim observation'));
 assert.equal(await other.rpc('disconnectTunnel',{}),7);stopOther();
});
