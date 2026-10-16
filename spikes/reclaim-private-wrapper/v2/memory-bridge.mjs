import {fork} from 'node:child_process';
import {exactKeys} from '../../../src/ybm-collector/values.mjs';
const publicResult=()=>({scope:'PUBLIC_SYNTHETIC_ONLY',claimSignatureVerified:true,sourcePolicyPinned:true,
 wholeTableIntegrity:true,sourceCoverageConfirmed:false,zkParserIntegrated:false,independentClaim:'NO_GO',paymentAllowed:false});
export async function syntheticMemoryCheck(input,{signal,timeoutMs=30000,forkChild=fork,workerUrl=new URL('./memory-worker.mjs',import.meta.url)}={}){
 if(signal?.aborted)throw Error('MEMORY_CHECK_ABORTED');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('MEMORY_CHECK_TIMEOUT_CONFIG');
 if(input?.scope!=='PUBLIC_SYNTHETIC_ONLY')throw Error('LIVE_DISABLED');
 if(Buffer.byteLength(JSON.stringify(input))>65536)throw Error('MEMORY_CHECK_SIZE');
 let child;try{child=forkChild(workerUrl,[],{execArgv:[],env:{PATH:'/usr/bin:/bin',LOG_LEVEL:'silent'},stdio:['ignore','ignore','ignore','ipc']});}catch{throw Error('MEMORY_CHECK_SPAWN');}
 return new Promise((resolve,reject)=>{
  let message,failed=false,stopping=false;
  const stop=()=>{failed=true;if(!stopping){stopping=true;child.kill('SIGKILL');}};
  const timer=setTimeout(stop,timeoutMs);signal?.addEventListener('abort',stop,{once:true});
  child.on('error',stop);child.on('message',value=>{if(message){stop();return;}message=value;});
  child.once('close',code=>{
   clearTimeout(timer);signal?.removeEventListener('abort',stop);
   // Resolve/reject only after worker close, never merely after its IPC reply.
   try{
    if(failed||signal?.aborted||code!==0||message?.ok!==true)throw Error();
    exactKeys(message,['ok','result']);const expected=publicResult();exactKeys(message.result,Object.keys(expected));
    for(const [key,value] of Object.entries(expected))if(message.result[key]!==value)throw Error();
    resolve(expected); // never forward arbitrary worker payloads to the caller
   }catch{reject(Error('MEMORY_CHECK_FAILED'));}
  });
  try{child.send(input,error=>{if(error)stop();});}catch{stop();}
  if(signal?.aborted)stop();
 });
}
