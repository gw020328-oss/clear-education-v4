import {defaultRoot,clearAbandoned,createSession,removeSession,requireValue} from '../mac-collector/storage.mjs';
import {stopRecordedBrowser} from '../mac-collector/chrome.mjs';
import {runHackerRankLayout} from './layout-run.mjs';
process.umask(0o077);
requireValue(process.env.CLEAR_LOCKED==='1'&&process.argv.length===2,'LOCKED_LAUNCHER_REQUIRED');
const root=defaultRoot(),controller=new AbortController();let session,result,failed=false;
for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,()=>controller.abort());
for(const name of ['uncaughtException','unhandledRejection'])process.on(name,()=>{failed=true;controller.abort();});
const timer=setTimeout(()=>controller.abort(),15*60*1000);timer.unref();
try{
 await clearAbandoned(root,stopRecordedBrowser);controller.signal.throwIfAborted();
 session=await createSession(root,Date.now(),process.pid);controller.signal.throwIfAborted();
 result=await runHackerRankLayout(session,{signal:controller.signal});
}catch{failed=true;}
finally{
 clearTimeout(timer);
 try{if(session){requireValue(!session.browserStopFailed,'BROWSER_STILL_RUNNING');await stopRecordedBrowser(session.path);await removeSession(root,session.path);}}
 catch{failed=true;result=undefined;console.error('HACKERRANK_LAYOUT_CLEANUP_FAILED: 임시 자료 정리를 확인하지 못했습니다.');}
}
if(failed){console.error('HACKERRANK_LAYOUT_FAILED: 원문·개인 경로·로그를 공유하지 마세요.');process.exitCode=1;}
else console.log(JSON.stringify({...result,profilesDeleted:true}));
