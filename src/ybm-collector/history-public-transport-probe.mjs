// Public YBM homepage only; fabricated cookie and throwaway owner. No user login.
import {Wallet} from 'ethers';
import {openOfficialClient,quiet} from './client.mjs';
import {makeSocket as smallSocket} from './socket.mjs';
import {makeSocket as largeSocket} from './history-socket.mjs';
import {snarkHistoryOperators,releaseSnarkOperators} from './history-snarkjs-operators.mjs';
import {historyOperators} from './history-operators.mjs';
import {loadAttestorTrust} from './trust.mjs';
import {minimalClaim} from './proof.mjs';
import {proofErrorDiagnostic} from './proof-diagnostics.mjs';
process.env.LOG_LEVEL='silent';
const useSnark=process.argv.includes('--snarkjs');let operators;
const makeSocket=useSnark?smallSocket:largeSocket;
const largeRequest=process.argv.includes('--large-request');
const prefixBytes=process.argv[2]==='2048'?2048:4500;
const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),300000);let connection,lastProgress=0;
const start=Date.now();
try{
 const trust=await loadAttestorTrust({signal:controller.signal});
 connection=await openOfficialClient({signal:controller.signal,proofMode:true,socketFactory:url=>{
 const socket=makeSocket(url,{proofMode:true}),send=socket.sendPromise;let lastNetwork=Date.now();
 for(const event of ['message','ping','pong'])socket.on(event,()=>{lastNetwork=Date.now();});
 socket.on('close',code=>console.log(JSON.stringify({scope:'ANONYMOUS_SOCKET_CLOSE',code,elapsedSeconds:Math.round((Date.now()-start)/1000),deadlineAborted:controller.signal.aborted,lastNetworkEventAgoMs:Date.now()-lastNetwork})));
 socket.on('error',error=>console.log(JSON.stringify({scope:'ANONYMOUS_SOCKET_ERROR',code:['ECONNRESET','EPIPE','ETIMEDOUT','WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'].includes(error.code)?error.code:'OTHER'})));
 socket.sendPromise=bytes=>{if(bytes.length>1024*1024)console.log(JSON.stringify({scope:'ANONYMOUS_SEND',bytes:bytes.length,readyState:socket.readyState,lastNetworkEventAgoMs:Date.now()-lastNetwork}));return send(bytes);};return socket;
 }});
 connection.client.addEventListener('connection-terminated',event=>console.log(JSON.stringify({scope:'ANONYMOUS_CONNECTION_TERMINATED',code:event.data?.code,message:event.data?.message?.slice(0,300)})));
 const core=await import('@reclaimprotocol/attestor-core');
 const params={url:'https://exam.toeic.co.kr/',method:'GET',headers:{'Accept-Encoding':'identity','User-Agent':'reclaim/0.0.1'},writeRedactionMode:'zk',responseRedactions:[{regex:'^[\\s\\S]{'+prefixBytes+'}'}],responseMatches:[{type:'contains',value:'html'}]};
 operators=useSnark?snarkHistoryOperators({signal:controller.signal}):historyOperators({signal:controller.signal});
 const result=await core.createClaimOnAttestor({name:'http',params,secretParams:{cookieStr:'CLEAR_DIAGNOSTIC=SYNTHETIC'+(largeRequest?'A'.repeat(4096):'')},ownerPrivateKey:Wallet.createRandom().privateKey,context:{purpose:'ANONYMOUS_PUBLIC_TRANSPORT_ONLY'},client:connection.client,zkEngine:useSnark?'snarkjs':'stwo',zkOperators:operators,zkProofConcurrency:1,maxRetries:1,logger:quiet,onStep:s=>{if(Date.now()-lastProgress>10000||s.name==='waiting-for-verification'){lastProgress=Date.now();console.log(JSON.stringify({scope:'ANONYMOUS_PROGRESS',step:s.name,elapsedSeconds:Math.round((Date.now()-start)/1000),...(Number.isSafeInteger(s.proofsDone)?{done:s.proofsDone,total:s.proofsTotal}:{})}));}}});
 if(result.error)console.log(JSON.stringify({scope:'ANONYMOUS_PROVIDER_ERROR',code:result.error.code,message:result.error.message?.slice(0,600)}));
 const proof=minimalClaim(result);if(!trust.includes(proof.attestor.toLowerCase()))throw new Error('UNTRUSTED_ATTESTOR');
 await core.assertValidClaimSignatures(result);
 console.log(JSON.stringify({scope:'ANONYMOUS_TRANSPORT_RESULT',publicSourceOnly:true,userLogin:false,proofVerified:true,elapsedSeconds:Math.round((Date.now()-start)/1000)}));
}catch(error){console.log(JSON.stringify({scope:'ANONYMOUS_TRANSPORT_FAILURE',...proofErrorDiagnostic(error)}));process.exitCode=1;}
finally{clearTimeout(deadline);await connection?.close();if(useSnark)await releaseSnarkOperators(operators);}
