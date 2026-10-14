// Anonymous, synthetic data only. No browser, cookie, actual score, or proof upload.
import {createCipheriv} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {makeStwoZkOperator} from '@reclaimprotocol/zk-symmetric-crypto/stwo';
import {yieldingStwoOperator} from './history-operators.mjs';
import {openOfficialClient} from './client.mjs';
const mode=process.argv[2];if(!['baseline','yielding'].includes(mode))throw new Error('MODE');
const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),90000);
let connection,ticks=0,proofs=0,verified=false;
const timer=setInterval(()=>ticks++,100);let started;
try{
 connection=await openOfficialClient({signal:controller.signal});
 const op=mode==='yielding'?yieldingStwoOperator('aes-128-ctr',{signal:controller.signal}):makeStwoZkOperator({algorithm:'aes-128-ctr'});
 const key=Buffer.alloc(16,1),nonce=Buffer.alloc(12,2),counter=2,plain=Buffer.alloc(16,3),cipher=createCipheriv('aes-128-ctr',key,Buffer.concat([nonce,Buffer.from([0,0,0,counter])]));
 const input={key,in:Buffer.concat([cipher.update(plain),cipher.final()]),out:plain,noncesAndCounters:[{nonce,counter}]};
 const witness=await op.generateWitness(input);let last;
 ticks=0;started=Date.now();
 while(Date.now()-started<40000){last=await op.groth16Prove(witness);proofs++;}
 const ticksDuringProof=ticks;
 verified=await op.groth16Verify(input,last.proof);
 await delay(1000);
 console.log(JSON.stringify({mode,synthetic:true,liveProofUploaded:false,elapsedSeconds:Math.round((Date.now()-started)/1000),proofs,ticksDuringProof,proofVerified:verified,connectionOpenAfterBatch:connection.client.isOpen}));
}catch{console.log(JSON.stringify({mode,synthetic:true,probeFailed:true,proofs,proofVerified:verified}));process.exitCode=1;}
finally{clearInterval(timer);clearTimeout(deadline);await connection?.close();}
