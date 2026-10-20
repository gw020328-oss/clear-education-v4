import {createHackerRankCollector} from './collector.mjs';
import {browserCookieReader} from './browser-source.mjs';
import {ACCOUNT_URL} from './recipes.mjs';
import {requestMessage} from './request.mjs';
import {check,freeze,hash,EvidenceError} from './values.mjs';

// Called inside an existing managed storage worker. The caller owns the locked
// session and must stopRecordedBrowser + removeSession after this settles.
// No command-line trust file/key/body is accepted and pending trust opens nothing.
export async function runHackerRankCollection(session,{trustConfig,commitmentKey,issueRequest,approveRequest,waitForReady,submit,signal}={}){
 if(trustConfig?.status!=='REVIEWED')return freeze({status:'BLOCKED',code:'TRUST_NOT_CONFIGURED',proofVerified:false,paymentAllowed:false});
 check(trustConfig.dataMode==='RECLAIM_SIGNED_RECORD','LIVE_SOURCE_REQUIRED');
 check([issueRequest,approveRequest,waitForReady,submit].every(x=>typeof x==='function'),'COLLECTOR_HOST_PORTS');
 check(process.env.CLEAR_LOCKED==='1','LOCKED_LAUNCHER_REQUIRED');
 const config=freeze(structuredClone(trustConfig));
 const at=Math.floor(Date.now()/1000);check(at>=config.notBefore&&at<config.expiresAt,'TRUST_EXPIRED');
 check(session&&Number.isSafeInteger(session.expiresAt)&&session.expiresAt>Date.now(),'COLLECTOR_SESSION');
 const scope=AbortSignal.any([signal,AbortSignal.timeout(Math.min(30*60*1000,session.expiresAt-Date.now()))].filter(Boolean));
 const collector=createHackerRankCollector({trustConfig:config,commitmentKey});let connection,route,browser,retainedLease;
 try{
  scope.throwIfAborted();process.env.LOG_LEVEL='silent';
  const [{openOfficialClient},{createRoute},{startChrome}]=await Promise.all([import('../ybm-collector/client.mjs'),import('../ybm-collector/route.mjs'),import('../mac-collector/chrome.mjs')]);
  connection=await openOfficialClient({signal:scope,proofMode:true});
  route=await createRoute({client:connection.client,signal:scope,allowHost:host=>['hackerrank.com','hrcdn.net'].some(d=>host===d||host.endsWith('.'+d))});
  const browserEnded=new AbortController(),live=AbortSignal.any([scope,route.signal,browserEnded.signal]);
  browser=await startChrome(session,{synthetic:false,proxyUrl:route.proxyUrl,headless:false,signal:live});
  browser.closed.then(()=>browserEnded.abort());
  const {targetInfos}=await browser.send('Target.getTargets'),page=targetInfos.find(t=>t.type==='page');check(page,'COLLECTOR_BROWSER_PAGE');
  const {sessionId}=await browser.send('Target.attachToTarget',{targetId:page.targetId,flatten:true});
  const navigation=await browser.send('Page.navigate',{url:ACCOUNT_URL},sessionId);check(!navigation.errorText,'COLLECTOR_NAVIGATION');
  // Host presents login/ready UI. No body is captured and no cookie is read
  // until ready, a new API request, and the participant's exact approval exist.
  await waitForReady({signal:live});live.throwIfAborted();
  const expectedRequest=freeze(structuredClone(await issueRequest({claimOwner:collector.claimOwner,trustConfigHash:hash('TRUST',config),recipeHash:hash('RECIPE',config.recipe),signal:live})));live.throwIfAborted();
  const envelope=await approveRequest({request:expectedRequest,message:requestMessage(expectedRequest),signal:live});live.throwIfAborted();
  const candidate=await collector.collect({envelope,expectedRequest,client:connection.client,routeClient:route.client,readCookies:browserCookieReader(browser,sessionId),submit:input=>{retainedLease=input.lease;return submit(input);},signal:live});
  return freeze({status:candidate.status,condition:candidate.condition,receiptHash:candidate.receiptHash,proofVerified:true,paymentAllowed:false});
 }catch(error){throw new EvidenceError(error instanceof EvidenceError?error.code:scope.aborted?'COLLECTOR_CANCELLED':'COLLECTION_FAILED');}
 finally{
  collector.close();
  let cleanupFailed=false;
  for(const close of [()=>browser?.close(),()=>route?.close(),()=>connection?.close()])try{await close();}catch{cleanupFailed=true;}
  if(cleanupFailed){retainedLease?.dispose();throw new EvidenceError('COLLECTOR_CLEANUP_FAILED');}
 }
}
