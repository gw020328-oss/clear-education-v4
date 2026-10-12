import {verificationFailureCode} from './proof-diagnostics.mjs';
import {fork} from 'node:child_process';
import {requireValue} from './values.mjs';
export async function verifyIndependently(input,{signal}={}){
  signal?.throwIfAborted();
  requireValue(Buffer.byteLength(JSON.stringify(input))<=128*1024,'PROOF_SIZE');
  const child=fork(new URL('./verifier-worker.mjs',import.meta.url),[],{execArgv:[],env:{PATH:'/usr/bin:/bin',LOG_LEVEL:'silent'},stdio:['ignore','ignore','ignore','ipc']});
  return new Promise((resolve,reject)=>{
    let response,failed=false;
    const stop=()=>{failed=true;child.kill('SIGKILL');};
    const timer=setTimeout(stop,30000);
    signal?.addEventListener('abort',stop,{once:true});
    child.once('error',stop);
    child.on('message',message=>{if(response){stop();return;}response=message;});
    child.once('exit',(code)=>{
      clearTimeout(timer);signal?.removeEventListener('abort',stop);
      if(!failed&&!signal?.aborted&&code===0&&response?.ok===true&&response.result?.proofVerified===true)resolve(response.result);
      else {const error=new Error('PROOF_VERIFICATION_FAILED');error.verificationCode=verificationFailureCode({message:response?.reason});reject(error);}
    });
    child.send(input,error=>{if(error)stop();});
    if(signal?.aborted)stop();
  });
}
