import {fork} from 'node:child_process';
// Official SDK alternative engine. Its resources are fetched at the immutable
// commit pinned by installed zk-symmetric-crypto 5.1.6, never at branch HEAD.
export function snarkHistoryOperators({signal,forkChild=fork}={}){
 let worker,serial=0,closed=false,releasePromise;
 const pending=new Map();
 const fail=()=>{for(const {reject} of pending.values())reject(new Error('SNARK_WORKER_OPERATION_FAILED'));pending.clear();};
 const release=()=>{
  if(releasePromise)return releasePromise;
  closed=true;signal?.removeEventListener('abort',release);fail();
  releasePromise=worker&&worker.exitCode===null&&worker.signalCode===null?new Promise(resolve=>{worker.once('close',resolve);worker.kill('SIGTERM');}):Promise.resolve();return releasePromise;
 };
 const call=(algorithm,method,args)=>{
  signal?.throwIfAborted();if(closed)return Promise.reject(new Error('SNARK_WORKER_CLOSED'));
  if(!worker){
   worker=forkChild(new URL('./history-snarkjs-worker.mjs',import.meta.url),[],{execArgv:[],env:{PATH:'/usr/bin:/bin',LOG_LEVEL:'silent'},serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});
   worker.on('error',()=>{void release();});worker.on('exit',()=>{closed=true;fail();signal?.removeEventListener('abort',release);});
   worker.on('message',message=>{const job=pending.get(message?.id);if(!job)return;pending.delete(message.id);if(message.ok===true)job.resolve(message.result);else job.reject(new Error('SNARK_WORKER_OPERATION_FAILED'));});
  }
  return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});try{worker.send({id,algorithm,method,args},error=>{if(error){pending.delete(id);reject(new Error('SNARK_WORKER_OPERATION_FAILED'));}});}catch{pending.delete(id);reject(new Error('SNARK_WORKER_OPERATION_FAILED'));}});
 };
 signal?.addEventListener('abort',release,{once:true});
 return Object.fromEntries(['aes-128-ctr','aes-256-ctr','chacha20'].map(algorithm=>{
 return [algorithm,{generateWitness:input=>call(algorithm,'generateWitness',[input]),groth16Prove:witness=>call(algorithm,'groth16Prove',[witness]),groth16Verify:(input,proof)=>call(algorithm,'groth16Verify',[input,proof]),release}];
 }));
}
export async function releaseSnarkOperators(operators){
 for(const op of Object.values(operators??{}))await op.release?.();
 // Also clean any old direct-engine caches used by prior diagnostic imports.
 await globalThis.curve_bn128?.terminate();await globalThis.curve_bls12381?.terminate();
}
