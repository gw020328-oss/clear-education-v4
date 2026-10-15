import {createCipheriv} from 'node:crypto';
import {snarkHistoryOperators,releaseSnarkOperators} from './history-snarkjs-operators.mjs';
import {quiet} from './client.mjs';
const start=Date.now(),operators=snarkHistoryOperators(),op=operators['aes-128-ctr'];
let ticks=0,lastTick=Date.now(),maxLagMs=0;const timer=setInterval(()=>{const now=Date.now();maxLagMs=Math.max(maxLagMs,now-lastTick-100);lastTick=now;ticks++;},100);
try{
 const key=Buffer.alloc(16,1),nonce=Buffer.alloc(12,2),counter=2,plain=Buffer.alloc(80,3),cipher=createCipheriv('aes-128-ctr',key,Buffer.concat([nonce,Buffer.from([0,0,0,counter])]));
 const input={key,in:Buffer.concat([cipher.update(plain),cipher.final()]),out:plain,noncesAndCounters:[{nonce,counter}]};
 const witness=await op.generateWitness(input,quiet),result=await op.groth16Prove(witness,quiet);
 const verified=await op.groth16Verify(input,result.proof,quiet),tampered=await op.groth16Verify({...input,out:Buffer.alloc(80,4)},result.proof,quiet);
 console.log(JSON.stringify({scope:'SYNTHETIC_SNARKJS_RUNTIME',proofVerified:verified,tamperRejected:!tampered,proofBytes:Buffer.byteLength(result.proof),elapsedSeconds:Math.round((Date.now()-start)/1000),timerTicks:ticks,maxLagMs}));
}catch(e){console.log(JSON.stringify({scope:'SYNTHETIC_SNARKJS_FAILURE',message:e.message.slice(0,500)}));process.exitCode=1;}finally{clearInterval(timer);await releaseSnarkOperators(operators);}
