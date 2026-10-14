import {verificationFailureCode} from './proof-diagnostics.mjs';
import {fork} from 'node:child_process';
import {requireValue} from './values.mjs';
const rejected=reason=>{
  const error=new Error('PROOF_VERIFICATION_FAILED');
  error.verificationCode=verificationFailureCode({message:reason});return error;
};
export async function verifyIndependently(input,{signal,forkChild=fork}={}){
  signal?.throwIfAborted();
  requireValue(Buffer.byteLength(JSON.stringify(input))<=2*1024*1024,'PROOF_SIZE');
  let child;
  try{child=forkChild(new URL('./history-verifier-worker.mjs',import.meta.url),[],{execArgv:[],env:{PATH:'/usr/bin:/bin',LOG_LEVEL:'silent'},stdio:['ignore','ignore','ignore','ipc']});}
  catch{throw rejected();}
  return new Promise((resolve,reject)=>{
    let response,failed=false,stopping=false;
    const stop=()=>{
      failed=true;if(stopping)return;stopping=true;
      // A failed spawn has no PID. Node still emits close, but not exit.
      // A running verifier must finish closing before releasing its resources.
      child.kill('SIGKILL');
    };
    const timer=setTimeout(stop,30000);
    signal?.addEventListener('abort',stop,{once:true});
    child.on('error',stop);
    child.on('message',message=>{if(response){stop();return;}response=message;});
    child.once('close',(code)=>{
      clearTimeout(timer);signal?.removeEventListener('abort',stop);
      if(!failed&&!signal?.aborted&&code===0&&response?.ok===true&&response.result?.proofVerified===true)resolve(response.result);
      else reject(rejected(response?.reason));
    });
    try{child.send(input,error=>{if(error)stop();});}catch{stop();}
    if(signal?.aborted)stop();
  });
}
