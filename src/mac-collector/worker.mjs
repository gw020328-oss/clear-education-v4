import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { defaultRoot, clearAbandoned, createSession, removeSession, TTL, requireValue } from './storage.mjs';
import { stopRecordedBrowser, startChrome } from './chrome.mjs';
import { syntheticBrowserCheck } from './synthetic.mjs';
process.umask(0o077);
requireValue(process.env.CLEAR_LOCKED==='1','LOCKED_LAUNCHER_REQUIRED');
const root=process.env.CLEAR_TEST_ROOT || defaultRoot();
let session,cleaning;
const cleanup=()=>cleaning??=(async()=>{if(session){await stopRecordedBrowser(session.path);await removeSession(root,session.path);}})();
for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.once(signal,()=>{cleanup().then(()=>process.exit(0),()=>process.exit(1));});
for(const event of ['uncaughtException','unhandledRejection'])process.once(event,()=>{
  console.error('CLEAR: 예상하지 못한 오류로 종료합니다.');
  cleanup().then(()=>process.exit(1),()=>process.exit(1));
});
const deadline=setTimeout(()=>{cleanup().then(()=>process.exit(1),()=>process.exit(1));},TTL);deadline.unref();
try{
  const removed=await clearAbandoned(root,stopRecordedBrowser);
  session=await createSession(root,Date.now(),process.pid);
  if(process.argv.includes('--test-hold') || process.argv.includes('--test-browser-hold')){
    requireValue(Boolean(process.env.CLEAR_TEST_ROOT),'TEST_ONLY');
    if(process.argv.includes('--test-browser-hold'))await startChrome(session,{headless:true});
    await fs.writeFile(join(root,'test-ready'),String(process.pid),{mode:0o600});
    await new Promise(()=>setInterval(()=>{},1000));
  }else{
    console.log('CLEAR: 합성 Chrome 저장 경계 확인을 시작합니다.');
    const result=await syntheticBrowserCheck(session,{headless:!process.argv.includes('--show-browser')});
    await cleanup();
    console.log(JSON.stringify({...result,staleSessionsRemoved:removed,profilesDeleted:true}));
    console.log('완료: 임시 프로필을 삭제했습니다. 실제 로그인 기능은 아직 연결되지 않았습니다.');
  }
}catch(error){
  const codes=new Set(['ACTIVE_SESSION_OWNER','BROWSER_IDENTITY_MISMATCH','BROWSER_OWNER_MISMATCH','BROWSER_EXECUTABLE_MISMATCH','BROWSER_PROFILE_MISMATCH','BROWSER_STILL_RUNNING','BROWSER_PROCESS_CHECK_FAILED','INVALID_SESSION_METADATA','BROWSER_TIMEOUT','SYNTHETIC_COOKIE_CHECK_FAILED']);
  if(codes.has(error.message))console.error('진단 코드: '+error.message);
  console.error('CLEAR: 실행을 중단했습니다. 진단 보고서에 개인정보는 기록하지 않았습니다.');
  try{await cleanup();}catch{console.error('임시 자료 정리를 완료하지 못했습니다. 다음 실행 전에 다시 확인해야 합니다.');}
  process.exitCode=1;
}finally{clearTimeout(deadline);}
