// Canonical time readiness is a read, never a new transaction or a new target.
// The original authority/source/review/message deadlines are exclusive.
export async function waitForNormalChainTime({requiredAt,businessUntil,authorityUntil,readBlock,signal,clock=Date.now,pollMs=50}){
 const ensure=(v,c)=>{if(!v)throw Error(c);};
 for(const n of [requiredAt,businessUntil,authorityUntil])ensure(Number.isSafeInteger(n)&&n>0,'BC_NORMAL_CHAIN_TIME_BOUND');
 const expiresAt=Math.min(businessUntil,authorityUntil);let last=clock(),reads=0,firstBlockTime=null;
 const check=()=>{const at=clock();ensure(Number.isSafeInteger(at)&&at>=last,'BC_NORMAL_CHAIN_TIME_REVERSED');last=at;ensure(!signal?.aborted,'BC_NORMAL_CHAIN_TIME_ABORTED');ensure(at<expiresAt*1000,'BC_NORMAL_CHAIN_TIME_EXPIRED');return at;};
 const bounded=fn=>new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>finish(Error('BC_NORMAL_CHAIN_TIME_ABORTED'));
  const timer=setTimeout(()=>finish(Error('BC_NORMAL_CHAIN_TIME_EXPIRED')),Math.max(1,expiresAt*1000-check()));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
  Promise.resolve().then(fn).then(value=>finish(null,value),error=>finish(error));
 });
 for(;;){
  check();const block=await bounded(readBlock);reads++;const observedAt=Math.floor(check()/1000),time=Number(block?.timestamp);
  ensure(Number.isSafeInteger(time)&&time>0,'BC_NORMAL_CHAIN_TIME_BLOCK');firstBlockTime??=time;
  ensure(time<businessUntil,'BC_NORMAL_CHAIN_TIME_EXPIRED');
  if(time>=requiredAt)return Object.freeze({requiredAt,firstBlockTime,blockTime:time,observedAt,reads,expiresAt,businessUntil,authorityUntil});
  await bounded(()=>new Promise(resolve=>setTimeout(resolve,pollMs)));
 }
}
