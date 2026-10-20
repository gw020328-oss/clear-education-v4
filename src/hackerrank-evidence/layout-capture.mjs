import {ACCOUNT_URL,CERTIFICATE_URL} from './recipes.mjs';
import {inspectSourceLayout} from './layout-review.mjs';
import {createFocusedLayoutReview} from './layout-focused.mjs';
import {check,isSourceId,freeze,EvidenceError} from './values.mjs';
function sourceRole(url){
 if(url===ACCOUNT_URL)return 'account';
 try{const parsed=new URL(url),username=parsed.searchParams.get('username');if(isSourceId(username)&&url===CERTIFICATE_URL+'?username='+encodeURIComponent(username))return 'certificate';}catch{}
 return null;
}
export function createLayoutCapture({browser,sessionId,signal,onProgress=()=>{}}){
 const pending=new Map(),tasks=new Set(),readingRoles=new Set(),off=[],layouts={},focused=createFocusedLayoutReview();
 let closed=false,armed=false,resolveDone,rejectDone,failed=false,transportEnded=false,mainFrameId,selectionObserved=false;
 browser.closed.then(()=>{transportEnded=true;},()=>{transportEnded=true;});
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});
 const fail=()=>{if(!failed){failed=true;closed=true;pending.clear();focused.dispose();rejectDone(new EvidenceError('LAYOUT_CAPTURE_FAILED'));}};
 const summary=()=>freeze({scope:'HACKERRANK_LAYOUT_DIAGNOSTIC_ONLY',layouts:{...layouts},focusedReview:focused.summary(),
  observationsComplete:!!(layouts.account&&layouts.certificate&&selectionObserved),
  proofVerified:false,authenticatedAccountControlProven:false,requestBound:false,apiAcceptance:'HOLD',paymentAllowed:false});
 function complete(){
  if(!closed&&layouts.account&&layouts.certificate&&selectionObserved){closed=true;const result=summary();focused.dispose();resolveDone(result);}
 }
 function navigation(url){
  if(closed||typeof url!=='string')return;
  // Observe only this tab's committed top-level certificate path, never its
  // body, query, title or DOM. A SPA link is a selection observation, not proof.
  if(!url.startsWith('https://www.hackerrank.com/certificates/'))return;
  const match=/^https:\/\/www\.hackerrank\.com\/certificates\/([A-Za-z0-9]{1,80})\/?$/.exec(url);
  focused.select(match?.[1]);const first=!selectionObserved;selectionObserved=true;
  if(first)onProgress({role:'selection'});complete();
 }
 async function finished({requestId},sid){
  if(sid!==sessionId||closed||!pending.has(requestId))return;
  const row=pending.get(requestId);pending.delete(requestId);check(row.ready,'LAYOUT_RESPONSE_REQUIRED');const role=row.role;if(layouts[role]||readingRoles.has(role))return;
  readingRoles.add(role);
  signal?.throwIfAborted();let response=await browser.send('Network.getResponseBody',{requestId},sessionId),bytes;
  try{
   check(!closed,'LAYOUT_CLOSED');signal?.throwIfAborted();const limit=role==='account'?1024*1024:65536;
   check(typeof response.body==='string'&&typeof response.base64Encoded==='boolean'&&response.body.length<=(response.base64Encoded?Math.ceil(limit/3)*4:limit),'LAYOUT_SIZE');
   bytes=Buffer.from(response.body,response.base64Encoded?'base64':'utf8');response=undefined;
   layouts[role]=inspectSourceLayout(role,bytes);
   if(role==='account')focused.account(bytes);
   else focused.certificate(bytes,new URL(row.url).searchParams.get('username'));
   onProgress({role});complete();
  }finally{bytes?.fill(0);response=undefined;}
 }
 const abort=()=>fail();
 return {
  done,summary,
  async arm(){
   check(!armed&&!closed,'LAYOUT_CAPTURE_STATE');signal?.throwIfAborted();armed=true;
   const frame=await browser.send('Page.getFrameTree',{},sessionId);mainFrameId=frame.frameTree?.frame?.id;
   check(typeof mainFrameId==='string'&&mainFrameId.length>0,'LAYOUT_MAIN_FRAME');
   off.push(browser.on('Page.frameNavigated',(event,sid)=>{
    if(closed||sid!==sessionId||!event.frame||event.frame.parentId)return;
    mainFrameId=event.frame.id;navigation(event.frame.url);
   }));
   off.push(browser.on('Page.navigatedWithinDocument',(event,sid)=>{
    if(!closed&&sid===sessionId&&event.frameId===mainFrameId)navigation(event.url);
   }));
   await browser.send('Page.enable',{},sessionId);
   off.push(browser.on('Network.requestWillBeSent',(event,sid)=>{
    if(closed||sid!==sessionId)return;const role=sourceRole(event.request?.url);if(!role||layouts[role]||readingRoles.has(role))return;
    if(event.request.method!=='GET'||event.redirectResponse||pending.size>=8){fail();return;}
    pending.set(event.requestId,{role,ready:false,url:event.request.url});
   }));
   off.push(browser.on('Network.responseReceived',(event,sid)=>{
    if(closed||sid!==sessionId||!pending.has(event.requestId))return;const row=pending.get(event.requestId),role=sourceRole(event.response?.url);if(!role||layouts[role])return;
    // Headers are never retained. The pending source URL is private, used only
    // for exact response/query comparison, then cleared; it is never logged.
    if(role!==row.role||event.response.url!==row.url||event.response.status!==200||event.response.fromServiceWorker||event.response.fromDiskCache||!(role==='account'?/^text\/html$/i:/^(application|text)\/json$/i).test(event.response.mimeType??'')){fail();return;}
    row.ready=true;
   }));
   off.push(browser.on('Network.loadingFinished',(event,sid)=>{
    if(closed||sid!==sessionId||!pending.has(event.requestId))return;
    if(tasks.size>=8){fail();return;}const task=finished(event,sid);tasks.add(task);task.then(()=>tasks.delete(task),()=>{tasks.delete(task);fail();});
   }));
   off.push(browser.on('Network.loadingFailed',({requestId},sid)=>{if(sid===sessionId&&pending.has(requestId))fail();}));
   signal?.addEventListener('abort',abort,{once:true});
   await browser.send('Network.enable',{maxTotalBufferSize:2*1024*1024,maxResourceBufferSize:1024*1024},sessionId);
   await browser.send('Network.setCacheDisabled',{cacheDisabled:true},sessionId);
   await browser.send('Network.setBypassServiceWorker',{bypass:true},sessionId);
  },
  async close(){
   closed=true;signal?.removeEventListener('abort',abort);for(const remove of off)remove();
   try{await Promise.allSettled([...tasks]);pending.clear();readingRoles.clear();if(armed&&!signal?.aborted&&!transportEnded)await browser.send('Network.disable',{},sessionId);resolveDone(summary());}
   finally{focused.dispose();}
  },
 };
}
