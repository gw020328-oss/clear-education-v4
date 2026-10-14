import {setImmediate as yieldToIO} from 'node:timers/promises';
import {makeStwoZkOperator} from '@reclaimprotocol/zk-symmetric-crypto/stwo';
// STWO's WASM prover runs synchronously. Awaiting resolved promises in the SDK
// queue alone can starve WebSocket ping/pong and cancellation for a long batch.
// Yield between chunks without changing the proof algorithm or verification.
export function yieldingStwoOperator(algorithm,{signal}={}){
 const base=makeStwoZkOperator({algorithm});
 return {...base,async groth16Prove(witness){signal?.throwIfAborted();await yieldToIO();signal?.throwIfAborted();const result=await base.groth16Prove(witness);await yieldToIO();signal?.throwIfAborted();return result;}};
}
export const historyOperators=options=>Object.fromEntries(['aes-128-ctr','aes-256-ctr','chacha20'].map(a=>[a,yieldingStwoOperator(a,options)]));
