import {makeSnarkJsZKOperator} from '@reclaimprotocol/zk-symmetric-crypto/snarkjs';
import {makeRemoteFileFetch} from '@reclaimprotocol/zk-symmetric-crypto';
import {quiet} from './client.mjs';
// TLS witness material stays in process memory. No source pages, cookies, keys,
// witness buffers or proof values are logged or persisted by this worker.
for(const key of ['log','warn','error','info','debug'])console[key]=()=>{};
const operators=new Map();
const algorithms=new Set(['aes-128-ctr','aes-256-ctr','chacha20']);
const methods=new Set(['generateWitness','groth16Prove','groth16Verify']);
const fetcher=makeRemoteFileFetch({maxRetries:1,logger:quiet});
process.on('disconnect',()=>process.exit(0));
process.on('message',async({id,algorithm,method,args})=>{
 try{
  if(!algorithms.has(algorithm)||!methods.has(method))throw new Error('INVALID_METHOD');
  if(!operators.has(algorithm))operators.set(algorithm,makeSnarkJsZKOperator({algorithm,fetcher,options:{maxProofConcurrency:1}}));
  const result=await operators.get(algorithm)[method](...args,quiet);
  process.send?.({id,ok:true,result});
 }catch{process.send?.({id,ok:false,code:'SNARK_WORKER_OPERATION_FAILED'});}
});
