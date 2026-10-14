import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { defaultRoot, clearAbandoned, createSession, removeSession, TTL, requireValue } from './storage.mjs';
import { stopRecordedBrowser, startChrome } from './chrome.mjs';
import { syntheticBrowserCheck } from './synthetic.mjs';
import { parseOptions } from './options.mjs';
process.umask(0o077);
requireValue(process.env.CLEAR_LOCKED==='1','LOCKED_LAUNCHER_REQUIRED');
const root=process.env.CLEAR_TEST_ROOT || defaultRoot();
const options=parseOptions(process.argv.slice(2),process.env.CLEAR_TEST_ROOT);
const controller=new AbortController(),{signal}=controller;
let session,browser,exitCode=0;
// Signals request cancellation. The sole finally block waits for the current
// initialization/browser operation to settle before removing its resources.
const cancel=(code=0)=>{exitCode=Math.max(exitCode,code);controller.abort();};
for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,()=>cancel());
for(const name of ['uncaughtException','unhandledRejection'])process.once(name,()=>{
  console.error('CLEAR: 예상하지 못한 오류로 종료합니다.');cancel(1);
});
const deadline=setTimeout(()=>cancel(1),TTL);deadline.unref();
try{
  const removed=await clearAbandoned(root,stopRecordedBrowser);signal.throwIfAborted();
  session=await createSession(root,Date.now(),process.pid);signal.throwIfAborted();
  if(process.argv.includes('--test-hold') || process.argv.includes('--test-browser-hold')){
    requireValue(Boolean(process.env.CLEAR_TEST_ROOT),'TEST_ONLY');
    if(process.argv.includes('--test-browser-hold'))browser=await startChrome(session,{headless:true,signal});
    signal.throwIfAborted();
    await fs.writeFile(join(root,'test-ready'),String(process.pid),{mode:0o600});
    if(!signal.aborted)await new Promise(resolve=>{
      const timer=setInterval(()=>{},1000);
      signal.addEventListener('abort',()=>{clearInterval(timer);resolve();},{once:true});
    });
  }else if(options.network){
    const {runYbmRoute}=await import(options.historyCheck?'../ybm-collector/history-run.mjs':'../ybm-collector/run.mjs');
    const result=await runYbmRoute(session,{signal,interactive:options.interactive,collectionCheck:options.collectionCheck,proofCheck:options.proofCheck});
    await stopRecordedBrowser(session.path);await removeSession(root,session.path);session=null;
    console.log(JSON.stringify({...result,staleSessionsRemoved:removed,profilesDeleted:true}));
  }else{
    console.log('CLEAR: 합성 Chrome 저장 경계 확인을 시작합니다.');
    const result=await syntheticBrowserCheck(session,{headless:!process.argv.includes('--show-browser'),signal});
    await stopRecordedBrowser(session.path);await removeSession(root,session.path);session=null;
    console.log(JSON.stringify({...result,staleSessionsRemoved:removed,profilesDeleted:true}));
    console.log('완료: 임시 프로필을 삭제했습니다. 실제 로그인 기능은 아직 연결되지 않았습니다.');
  }
}catch(error){
  if(!signal.aborted){
    const codes=new Set(['ATTESTOR_UNAVAILABLE','PUBLIC_ROUTE_NOT_READY','ROUTE_RESTART_REQUIRES_LOGIN','ROUTE_SESSION_EXPIRED','ACTIVE_SESSION_OWNER','BROWSER_IDENTITY_MISMATCH','BROWSER_OWNER_MISMATCH','BROWSER_EXECUTABLE_MISMATCH','BROWSER_PROFILE_MISMATCH','BROWSER_STILL_RUNNING','BROWSER_PROCESS_CHECK_FAILED','INVALID_SESSION_METADATA','BROWSER_TIMEOUT','SYNTHETIC_COOKIE_CHECK_FAILED']);
    if(codes.has(error.message))console.error('진단 코드: '+error.message);
    console.error('CLEAR: 실행을 중단했습니다. 진단 보고서에 개인정보는 기록하지 않았습니다.');exitCode=1;
  }
}finally{
  clearTimeout(deadline);
  try{
    if(browser)await browser.close();
    requireValue(!session?.browserStopFailed,'BROWSER_STILL_RUNNING');
    if(session){await stopRecordedBrowser(session.path);await removeSession(root,session.path);}
  }catch{console.error('임시 자료 정리를 완료하지 못했습니다. 다음 실행 전에 다시 확인해야 합니다.');exitCode=1;}
  process.exitCode=exitCode;
}
