import {randomUUID} from 'node:crypto';
import {freeze,requireRule as check} from '../../policy/values.mjs';
import {p0Hash} from '../../../specs/bootcamp/p0-contract.mjs';
import {testOperationsHash,TEST_OPERATIONS} from '../../../specs/bootcamp/hackathon-test-contract.mjs';
import {bootcampMoodleRequestHash,validateBootcampMoodleResult} from './bootcamp.mjs';

// Source-only preparation seam. Trusted host callbacks, not an E1 consumer or acceptance ledger.
// No restore(serializedHandle) API: each raw owner is a new process-local closure.
export async function openMoodleSourceSession({request,collect,resolveCurrent,signal,subscribeCurrent,now=()=>Date.now()}){
 const q=freeze(structuredClone(request)),requestHash=bootcampMoodleRequestHash(q),controller=new AbortController();
 check(typeof collect==='function'&&typeof resolveCurrent==='function','MSE_CONFIG');
 const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const processLeaseId='source-'+randomUUID();let owned,metadata,closed=false,timer,last=-1,expiry=Infinity,epoch,unwatch;
 function dispose(){if(closed)return;closed=true;owned=undefined;clearTimeout(timer);try{unwatch?.();}catch{}finally{controller.abort();}}
 function current(){
  if(closed||combined.aborted){dispose();return false;}
  try{
   const n=now();check(Number.isSafeInteger(n)&&n>=last&&n>=q.context.issuedAtMs,'MSE_CLOCK');last=n;
   const state=resolveCurrent();check(state&&state.available===true&&state.requestHash===requestHash
    &&state.pinHash===p0Hash('MOODLE-PIN',q.pin)&&typeof state.sourceEpoch==='string','MSE_CURRENT');
   if(epoch===undefined)epoch=state.sourceEpoch;else check(epoch===state.sourceEpoch,'MSE_EPOCH');
   const limits=[state.authExpiresAtMs,state.rawExpiresAtMs,state.queryExpiresAtMs,q.context.expiresAtMs,q.context.issuedAtMs+TEST_OPERATIONS.sourceLifetime.maxRawSeconds*1000];
   check(limits.every(v=>Number.isSafeInteger(v)&&v>=0),'MSE_LEASE');
   const next=Math.min(expiry,...limits);check(n<next,'MSE_EXPIRED');
   if(next<expiry){expiry=next;clearTimeout(timer);timer=setTimeout(dispose,Math.min(2147483647,Math.max(1,expiry-n)));timer.unref?.();}
   return true;
  }catch{dispose();return false;}
 }
 function requireCurrent(){check(current(),'MSE_RAW_UNAVAILABLE');}
 const abort=()=>dispose();combined.addEventListener('abort',abort,{once:true});
 async function fetchSource(){
  requireCurrent();let result;
  try{result=await collect(q,{signal:combined});requireCurrent();validateBootcampMoodleResult(result,{request:q,expectedReceiptHash:result.receiptHash,nowMs:now()});}
  catch(e){dispose();const code=e?.message;throw Error(/^(REVIEW|BCM|MSE)_[A-Z0-9_]+$/.test(code??'')?code:'MSE_SOURCE_UNAVAILABLE');}
  return result;
 }
 if(subscribeCurrent){try{check(typeof subscribeCurrent==='function','MSE_CONFIG');unwatch=subscribeCurrent(()=>current());check(unwatch===undefined||typeof unwatch==='function','MSE_CONFIG');if(closed)unwatch?.();}catch{dispose();throw Error('MSE_CURRENT_UNAVAILABLE');}}
 try{
  owned=await fetchSource();
  metadata=freeze({version:'clear-moodle-source-handle.1',execution:'LOCAL_SYNTHETIC_SOURCE_PREPARATION',processLeaseId,
   testOperationsProfileHash:testOperationsHash(),requestHash,sourceReceiptHash:owned.receiptHash,
   sourceHash:owned.acquisition.sourceHash,facts:structuredClone(owned.facts),acquisition:structuredClone(owned.acquisition),
   sourceVisibility:'OBSERVED_AS_OF_LAST_SUCCESSFUL_PROBE',rawIsSerialized:false,acceptanceImplemented:false,productionEnabled:false});
 }catch(e){dispose();throw e;}
 return Object.freeze({
  metadata,
  isCurrent:current, // Local host/lease state only. External source changes require getRaw/refresh.
  get expiresAtMs(){return current()?expiry:null;},
  async getRaw({signal:readSignal}={}){
   requireCurrent();if(readSignal?.aborted){dispose();throw Error('MSE_RAW_UNAVAILABLE');}
   const onReadAbort=()=>dispose();readSignal?.addEventListener('abort',onReadAbort,{once:true});
   try{
    const fresh=await fetchSource();requireCurrent();
    if(fresh.acquisition.sourceHash!==metadata.sourceHash){dispose();throw Error('MSE_SOURCE_CHANGED');}
    // Do not replace original acquisition times, receipt or extend the original lease.
    owned=fresh;requireCurrent();return freeze(structuredClone(owned.source));
   }finally{readSignal?.removeEventListener('abort',onReadAbort);}
  },
  authorityChanged:current,dispose,cancel:dispose,
 });
}
