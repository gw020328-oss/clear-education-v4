import {freeze,requireRule as check} from '../../policy/values.mjs';
import {runContextHash} from '../../product-workflow/contract.mjs';
import {validateReaderPin,reviewQueryHash,assertReviewQueryCurrent,checkMs,bridgeHash,
 createReviewAcquisition,reviewAcquisitionHash} from '../common/contract.mjs';
import {readReviewFacts} from './facts.mjs';

// Trusted in-process host callbacks only. No registry authority or durable acceptance.
// Facts v1 is unchanged; the envelope binds this execution's actual site_info reader.
export async function readReviewAcquisition({client,context,query,getCurrentQuery,getCurrentContext,getCurrentPin,signal,now=()=>Date.now()}){
 const capturedContext=freeze(structuredClone(context)),capturedQuery=freeze(structuredClone(query));
 const queryHash=reviewQueryHash(capturedQuery),pin=capturedQuery.pin;
 validateReaderPin(pin,capturedContext);
 check(typeof client?.call==='function'&&[getCurrentQuery,getCurrentContext,getCurrentPin,now].every(f=>typeof f==='function'),'REVIEW_CURRENT_REQUIRED');
 const cancelled=()=>check(!signal?.aborted,'REVIEW_CANCELLED');
 let lastNow=-1;
 const clock=()=>{const value=now();checkMs(value);check(value>=lastNow,'REVIEW_CLOCK');lastNow=value;return value;};
 async function resolveCurrent(resolver){
  cancelled();
  try{const value=structuredClone(await resolver());cancelled();return value;}
  catch(e){cancelled();throw Error('REVIEW_UNAVAILABLE');}
 }
 async function currentQuery(){
  const current=await resolveCurrent(getCurrentQuery);
  assertReviewQueryCurrent(capturedQuery,reviewQueryHash(current),clock());
 }
 async function current(){
  await currentQuery();
  const c=await resolveCurrent(getCurrentContext);
  check(runContextHash(c)===runContextHash(capturedContext),'REVIEW_STALE_RUN');
  const p=await resolveCurrent(getCurrentPin);
  check(bridgeHash('PIN',p)===bridgeHash('PIN',pin),'REVIEW_STALE_MAPPING');
  // Callback reads are not atomic. Recheck the query after async context/pin reads.
  await currentQuery();
 }
 await current();
 let observedReaderId,identityCalls=0;
 const proxy={async call(method,args,requestSignal){
  cancelled();
  // Isolate the response from later mutation by an injected transport/caller.
  let response;
  try{response=structuredClone(await client.call(method,args,requestSignal));}
  catch(e){
   cancelled();
   const safe=['REVIEW_AUTH','REVIEW_ACCESS','REVIEW_TIMEOUT','REVIEW_UNAVAILABLE','REVIEW_NOT_FOUND_OR_UNAVAILABLE',
    'REVIEW_CANCELLED','REVIEW_RESPONSE_LIMIT','REVIEW_PARAMETERS','REVIEW_READ_ONLY','REVIEW_CONFIG'];
   throw Error(safe.includes(e?.message)?e.message:'REVIEW_UNAVAILABLE');
  }
  cancelled();
  if(method==='core_webservice_get_site_info'){
   check(++identityCalls===1,'REVIEW_READER_MISMATCH');observedReaderId=response?.userid;
  }
  return response;
 }};
 const facts=await readReviewFacts({client:proxy,context:capturedContext,pin,getCurrentContext:()=>resolveCurrent(getCurrentContext),getCurrentPin:()=>resolveCurrent(getCurrentPin),signal,now:clock});
 await current();cancelled();
 check(identityCalls===1,'REVIEW_READER_MISMATCH');
 // Shared validation rejects forged/mismatched facts, reader, pin, hashes or lease.
 const acquisition=createReviewAcquisition({facts,query:capturedQuery,observedReaderId});
 check(acquisition.queryHash===queryHash,'RB_STALE_QUERY');
 const sourceReceiptHash=reviewAcquisitionHash(acquisition);
 assertReviewQueryCurrent(capturedQuery,queryHash,clock());cancelled();
 return freeze({facts,acquisition,sourceReceiptHash});
}
