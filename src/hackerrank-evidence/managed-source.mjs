import {openOfficialClient} from '../ybm-collector/client.mjs';
import {createRoute} from '../ybm-collector/route.mjs';
import {startChrome} from '../mac-collector/chrome.mjs';
import {prepareHackerRankSource} from './prepared-source.mjs';
import {createHackerRankVerifier} from './verifier.mjs';
import {browserCookieReader} from './browser-source.mjs';
import {ACCOUNT_URL} from './recipes.mjs';
import {check,freeze,isSourceId,EvidenceError} from './values.mjs';

// Trusted managed-worker port, not an HTTP/CLI input. The callback builds the
// immutable mapping from source.pins(), then uses that same source in the live
// context. It must finish consuming the lease before returning. The outer
// worker still owns stopRecordedBrowser + removeSession after this settles.
export async function withManagedHackerRankSource(session,{
 trustConfig,commitmentKey,selectedCertificateId=null,waitForReady,useSource,signal,
 openClient=openOfficialClient,openRoute=createRoute,launchBrowser=startChrome,
}={}){
 if(trustConfig?.status!=='REVIEWED')return freeze({status:'BLOCKED',code:'TRUST_NOT_CONFIGURED',proofVerified:false,paymentAllowed:false});
 let config,key,connection,route,browser,source,live,onAbort;
 const cancelled=new AbortController();
 try{
  config=freeze(structuredClone(trustConfig));
  check(config.dataMode==='RECLAIM_SIGNED_RECORD','LIVE_SOURCE_REQUIRED');
  check(process.env.CLEAR_LOCKED==='1','LOCKED_LAUNCHER_REQUIRED');
  check(session&&typeof session.path==='string'&&Number.isSafeInteger(session.expiresAt)&&session.expiresAt>Date.now(),'COLLECTOR_SESSION');
  check(typeof waitForReady==='function'&&typeof useSource==='function','COLLECTOR_HOST_PORTS');
  check(selectedCertificateId===null||isSourceId(selectedCertificateId),'REQUEST_SELECTION');
  // Reject invalid/pending/synthetic profiles before any network or browser.
  createHackerRankVerifier({trustConfig:config,commitmentKey});
  key=Buffer.from(commitmentKey);
  const duration=Math.min(30*60*1000,session.expiresAt-Date.now(),config.expiresAt*1000-Date.now());
  check(Math.floor(Date.now()/1000)>=config.notBefore&&duration>0,'TRUST_EXPIRED');
  const scope=AbortSignal.any([signal,cancelled.signal,AbortSignal.timeout(duration)].filter(Boolean));
  scope.throwIfAborted();process.env.LOG_LEVEL='silent';
  connection=await openClient({signal:scope,proofMode:true});scope.throwIfAborted();
  route=await openRoute({client:connection.client,signal:scope,allowHost:host=>['hackerrank.com','hrcdn.net'].some(d=>host===d||host.endsWith('.'+d))});
  const browserEnded=new AbortController();
  live=AbortSignal.any([scope,route.signal,browserEnded.signal]);live.throwIfAborted();
  browser=await launchBrowser(session,{synthetic:false,proxyUrl:route.proxyUrl,headless:false,signal:live});
  browser.closed.then(()=>browserEnded.abort(),()=>browserEnded.abort());live.throwIfAborted();
  const {targetInfos}=await browser.send('Target.getTargets'),page=targetInfos.find(t=>t.type==='page');check(page,'COLLECTOR_BROWSER_PAGE');
  const {sessionId}=await browser.send('Target.attachToTarget',{targetId:page.targetId,flatten:true});live.throwIfAborted();
  source=prepareHackerRankSource({trustConfig:config,commitmentKey:key,selectedCertificateId,
   client:connection.client,routeClient:route.client,readCookies:browserCookieReader(browser,sessionId)});
  onAbort=()=>source.close();live.addEventListener('abort',onAbort,{once:true});live.throwIfAborted();
  const navigation=await browser.send('Page.navigate',{url:ACCOUNT_URL},sessionId);check(!navigation.errorText,'COLLECTOR_NAVIGATION');
  await waitForReady({signal:live});live.throwIfAborted();check(source.pins(),'TRUST_EXPIRED');
  // Only this port crosses to the integration owner: no browser, cookie reader,
  // signing key, transcript or raw claim. API request issuance stays external.
  const result=await useSource(source,{signal:live});live.throwIfAborted();
  return result;
 }catch(error){
  throw new EvidenceError(error instanceof EvidenceError?error.code:signal?.aborted||live?.aborted?'COLLECTOR_CANCELLED':'COLLECTION_FAILED');
 }finally{
  if(onAbort)live.removeEventListener('abort',onAbort);
  source?.close();key?.fill(0);cancelled.abort();
  let failed=false;
  for(const close of [()=>browser?.close(),()=>route?.close(),()=>connection?.close()])try{await close();}catch{failed=true;}
  if(failed)throw new EvidenceError('COLLECTOR_CLEANUP_FAILED');
 }
}
