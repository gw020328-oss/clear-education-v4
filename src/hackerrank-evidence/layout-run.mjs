import {createInterface} from 'node:readline';
import {openOfficialClient} from '../ybm-collector/client.mjs';
import {createRoute} from '../ybm-collector/route.mjs';
import {startChrome} from '../mac-collector/chrome.mjs';
import {createLayoutCapture} from './layout-capture.mjs';
import {ACCOUNT_URL} from './recipes.mjs';
import {check,EvidenceError} from './values.mjs';

// Transport only. Google login content is outside the source observer.
// No Google suffix wildcard or speculative static/API hosts.
const googleLoginHosts=new Set(['accounts.google.com','fonts.gstatic.com','www.gstatic.com','www.google.com']);
export const layoutTransportHost=host=>googleLoginHosts.has(host)||['hackerrank.com','hrcdn.net'].some(d=>host===d||host.endsWith('.'+d));
// Observation candidates are not transport permissions. Never retain an
// arbitrary denied host, URL, request data or account-derived label.
const googleResourceCandidates=new Map([
 ['ssl.gstatic.com','GOOGLE_STATIC_CANDIDATE'],
 ['www.gstatic.com','GOOGLE_STATIC_CANDIDATE'],
 ['fonts.gstatic.com','GOOGLE_STATIC_CANDIDATE'],
 ['www.google.com','GOOGLE_RESOURCE_CANDIDATE'],
]);
export function createLayoutTransportDiagnostics(){
 const counts=new Map();
 return {
  allowHost(host){const allowed=layoutTransportHost(host);if(!allowed&&googleResourceCandidates.has(host))counts.set(host,Math.min(1000,(counts.get(host)??0)+1));return allowed;},
  summary(){return Object.freeze([...counts].sort(([a],[b])=>a.localeCompare(b)).map(([host,count])=>Object.freeze({host,category:googleResourceCandidates.get(host),count})));},
 };
}

// No proof API, cookie API, approval/signing key, submit port or payment port.
export async function runHackerRankLayout(session,{signal,input=process.stdin,output=console.log,openClient=openOfficialClient,openRoute=createRoute,launchBrowser=startChrome}={}){
 const transportDiagnostics=createLayoutTransportDiagnostics();
 const cancelled=new AbortController(),scope=AbortSignal.any([signal,cancelled.signal,AbortSignal.timeout(15*60*1000)].filter(Boolean));
 let connection,route,browser,capture,lines,abort,live,readyTask,phase='MANAGED_WORKER';
 try{
  check(process.env.CLEAR_LOCKED==='1'&&session&&typeof session.path==='string','LAYOUT_MANAGED_WORKER');
  phase='ATTESTOR_CONNECT';connection=await openClient({signal:scope,proofMode:false});
  phase='LOCAL_ROUTE';route=await openRoute({client:connection.client,signal:scope,allowHost:transportDiagnostics.allowHost});
  live=AbortSignal.any([scope,route.signal]);
  phase='CHROME_START';browser=await launchBrowser(session,{synthetic:false,proxyUrl:route.proxyUrl,headless:false,signal:live});
  phase='CHROME_TARGET';const {targetInfos}=await browser.send('Target.getTargets'),page=targetInfos.find(t=>t.type==='page');check(page,'LAYOUT_BROWSER_PAGE');
  const {sessionId}=await browser.send('Target.attachToTarget',{targetId:page.targetId,flatten:true});
  phase='DASHBOARD_NAVIGATE';const navigation=await browser.send('Page.navigate',{url:ACCOUNT_URL},sessionId);check(!navigation.errorText,'LAYOUT_NAVIGATION');
  output('HackerRank 원천 형식 진단입니다. 증명 생성·API 수락·지급은 하지 않습니다.');
  output('이 새 Chrome에서 본인 계정으로 로그인한 뒤 터미널에 ready를 입력하세요. close로 종료할 수 있습니다.');
  capture=createLayoutCapture({browser,sessionId,signal:live,onProgress:({role})=>output(role==='account'?'계정 페이지 구조 관찰 완료. 같은 탭에서 본인의 프로필·인증서 화면을 열어 주세요.':'인증서 응답 구조 관찰 완료.')});
  phase='READY_WAIT';lines=createInterface({input,terminal:false});
  return await new Promise((resolve,reject)=>{
   let armed=false;
   abort=()=>reject(new EvidenceError('LAYOUT_CANCELLED'));live.addEventListener('abort',abort,{once:true});
   capture.done.then(resolve,reject);
   lines.once('close',()=>resolve(capture.summary()));browser.closed.then(()=>resolve(capture.summary()),reject);
   lines.on('line',line=>{
    if(line.trim()==='close')lines.close();
    else if(line.trim()==='ready'&&!armed){armed=true;phase='SOURCE_LAYOUT';readyTask=(async()=>{await capture.arm();live.throwIfAborted();const r=await browser.send('Page.navigate',{url:ACCOUNT_URL},sessionId);check(!r.errorText,'LAYOUT_NAVIGATION');})();readyTask.catch(reject);}
   });
   if(live.aborted)abort();
  });
 }catch{const failure=new EvidenceError('LAYOUT_DIAGNOSTIC_FAILED');failure.phase=phase;throw failure;}
 finally{
  if(abort)live?.removeEventListener('abort',abort);lines?.close();await readyTask?.catch(()=>{});let failed=false;
  // Disable observation while CDP is still live. Aborting first invalidates CDP
  // and would turn every successful run into a cleanup failure.
  try{await capture?.close();}catch{failed=true;}
  cancelled.abort();
  for(const close of [()=>browser?.close(),()=>route?.close(),()=>connection?.close()])try{await close();}catch{failed=true;}
  output(JSON.stringify({scope:'HACKERRANK_LAYOUT_LOGIN_TRANSPORT',deniedGoogleResources:transportDiagnostics.summary()}));
  if(failed){const failure=new EvidenceError('LAYOUT_CLEANUP_FAILED');failure.phase='TRANSPORT_CLEANUP';throw failure;}
 }
}
