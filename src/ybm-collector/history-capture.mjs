import {endpoints as allEndpoints,methods,MAX_HTML_BYTES} from './source-policy.mjs';
import {requireValue} from './values.mjs';
import {createExtraction} from './extraction.mjs';

const endpoints={score:allEndpoints.score};

// Opt-in, response-only layout diagnostic. Does not query cookies or browser
// storage, or read bodies outside the two exact URLs. CDP request metadata may
// transiently contain auth headers; do not inspect, retain, or serialize them.
export function createCapture({browser,collection,signal,onProgress=()=>{},extractionFactory=createExtraction,onSourceRequest}){
  const extraction=extractionFactory(collection),sessions=new Set(),targets=new Set(),unsubscribers=[],tasks=new Set(),seen=new Set();
  let armed=false,closed=false,settled=false,closing=false,inflight=0,bodyReads=0,resolveDone,rejectDone,completion;
  const received={registration:false,score:false};let failureCode=null,sourceRole=null;
  const safeCodes=new Set(['HISTORY_SIZE','HISTORY_DOCUMENT','SOURCE_REQUEST_BODY','SOURCE_COOKIES','SOURCE_COOKIE_DOMAIN','SECRET_SCOPE','SOURCE_HTTP_STATUS','SOURCE_CONTENT_TYPE','SOURCE_SIZE','SOURCE_BODY','SOURCE_TEXT_LAYOUT','PAGE_LIMIT','CAPTURE_CAPACITY','HTML_SIZE','HTML_ENCODING','EXAM_TYPE','EXAM_DATE','EXAM_NUMBER','SCORE','AMBIGUOUS_REGISTRATION','REGISTRATION_LAYOUT','SCORE_LAYOUT','SCORE_ROW_COUNT','DUPLICATE_EXAM','EXAM_JOIN','SESSION_EXPIRED','BROWSER_COMMAND_FAILED','BROWSER_CLOSED','BROWSER_TIMEOUT']);
  const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
  // Callers may still be setting up their race when a protocol event fails.
  done.catch(()=>{});
  const fail=(error,role)=>{if(!settled){if(role==='registration'||role==='score')sourceRole=role;failureCode=safeCodes.has(error?.message)?error.message:'COLLECTION_CHECK_FAILED';settled=true;closed=true;extraction.close();rejectDone(new Error('COLLECTION_CHECK_FAILED'));}};
  const completeWhenDrained=()=>{
    if(completion&&!tasks.size&&!settled&&!closing){settled=true;resolveDone(completion);}
  };
  const track=promise=>{
    tasks.add(promise);
    promise.then(()=>{tasks.delete(promise);completeWhenDrained();},error=>{tasks.delete(promise);fail(error);});
    return promise;
  };
  const check=()=>{requireValue(armed&&!closed,'CAPTURE_CLOSED');signal?.throwIfAborted();collection.assertActive();};
  async function attach(info){
    if(info.type!=='page'||targets.has(info.targetId)||closed)return;
    requireValue(targets.size<8,'PAGE_LIMIT');targets.add(info.targetId);
    const {sessionId}=await browser.send('Target.attachToTarget',{targetId:info.targetId,flatten:true});
    if(closed)return;
    sessions.add(sessionId);
    await browser.send('Fetch.enable',{patterns:Object.values(endpoints).map(urlPattern=>({urlPattern,requestStage:'Response'})),handleAuthRequests:false},sessionId);
  }
  async function paused(event,sessionId){
    // Ignore events belonging to unrelated CDP sessions entirely.
    if(!sessions.has(sessionId))return;
    const requestId=event.requestId;
    let counted=false,requestRole;
    try{
      if(closed)return;
      check();
      const role=Object.keys(endpoints).find(role=>event.request?.url===endpoints[role]&&event.request?.method===methods[role]);
      if(!role)return;
      requestRole=role;
      sourceRole=role;
      requireValue(event.responseStatusCode===200&&!event.responseErrorReason,'SOURCE_HTTP_STATUS');
      if(seen.has(role))return;
      requireValue(inflight<2,'CAPTURE_CAPACITY');inflight++;counted=true;seen.add(role);
      const headers=event.responseHeaders??[];
      const types=headers.filter(h=>h.name.toLowerCase()==='content-type');
      requireValue(types.length===1&&/^text\/html(?:\s*;\s*charset=["']?utf-8["']?)?\s*$/i.test(types[0].value),'SOURCE_CONTENT_TYPE');
      const lengths=headers.filter(h=>h.name.toLowerCase()==='content-length');
      requireValue(lengths.length<=1&&(!lengths.length||(/^\d+$/.test(lengths[0].value)&&Number(lengths[0].value)<=MAX_HTML_BYTES)),'SOURCE_SIZE');
      bodyReads++;
      let response=await browser.send('Fetch.getResponseBody',{requestId},sessionId);
      check();
      requireValue(typeof response.body==='string'&&typeof response.base64Encoded==='boolean','SOURCE_BODY');
      requireValue(response.body.length<=(response.base64Encoded?Math.ceil(MAX_HTML_BYTES/3)*4:MAX_HTML_BYTES),'SOURCE_SIZE');
      const bytes=Buffer.from(response.body,response.base64Encoded?'base64':'utf8');response=undefined;
      let result;
      try{await onSourceRequest?.(role,event.request,sessionId);check();result=extraction.accept(role,bytes);}
      finally{bytes.fill(0);}
      received[role]=true;
      onProgress({role,complete:result.complete});
      if(result.complete){closed=true;completion=result;}
    }catch(error){
      fail(error,requestRole);throw error;
    }finally{
      if(counted)inflight--;
      // Always release the paused browser request, including mismatch/errors.
      try{await browser.send('Fetch.continueRequest',{requestId},sessionId);}
      catch(error){fail(error,requestRole);throw error;}
    }
  }
  const abort=()=>fail();signal?.addEventListener('abort',abort,{once:true});
  return {
    done,
    summary:()=>({bodyReads,received:{...received},failureCode,sourceRole}),
    async arm(){
      requireValue(!armed&&!closed,'CAPTURE_STATE');signal?.throwIfAborted();collection.start();armed=true;
      unsubscribers.push(browser.on('Fetch.requestPaused',(e,s)=>{if(tasks.size>=32){fail();return;}track(paused(e,s));}));
      unsubscribers.push(browser.on('Target.targetCreated',({targetInfo})=>track(attach(targetInfo))));
      try{
        await browser.send('Target.setDiscoverTargets',{discover:true});
        const {targetInfos}=await browser.send('Target.getTargets');
        await Promise.all(targetInfos.map(info=>track(attach(info))));
        while(tasks.size)await Promise.all([...tasks]);
        if(!settled)check();
      }catch(error){fail(error);throw new Error('COLLECTION_CHECK_FAILED');}
    },
    async close(){
      closing=true;closed=true;extraction.close();signal?.removeEventListener('abort',abort);
      for(const off of unsubscribers)off();
      // Let in-flight body reads release paused requests before disabling Fetch.
      await Promise.allSettled([...tasks]);
      await Promise.all([...sessions].map(s=>browser.send('Fetch.disable',{},s).catch(()=>{})));
      sessions.clear();targets.clear();seen.clear();
      resolveDone({complete:false,proofVerified:false,paymentAllowed:false});
    },
  };
}
