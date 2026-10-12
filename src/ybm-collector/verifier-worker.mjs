// Offline child: deny network primitives before loading the verifier/SDK.
import {verificationFailureCode} from './proof-diagnostics.mjs';
import net from 'node:net';
import dns from 'node:dns';
import {syncBuiltinESMExports} from 'node:module';
net.Socket.prototype.connect=()=>{throw new Error('VERIFIER_OFFLINE');};
dns.lookup=()=>{throw new Error('VERIFIER_OFFLINE');};
globalThis.fetch=()=>{throw new Error('VERIFIER_OFFLINE');};
syncBuiltinESMExports();
process.env.LOG_LEVEL='silent';
for(const key of ['log','warn','error','info','debug'])console[key]=()=>{};
let used=false;
process.on('message',async input=>{
  if(used)return;used=true;
  let result;
  try{const {verifyProofPair}=await import('./proof-verifier.mjs');result={ok:true,result:{...await verifyProofPair(input),independentProcess:true}};}
  catch(error){result={ok:false,reason:verificationFailureCode(error)};}
  process.send?.(result,()=>process.disconnect());
});
process.on('disconnect',()=>process.exit(0));
