import './network-guard.mjs';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const [chrome,root,output]=process.argv.slice(2);
const checks=[];const add=(id,status)=>checks.push({id,status});
// Run only under the PowerShell Job Object host. Environment is an assertion,
// not a security boundary; the enclosing host owns containment and final cleanup.
if(process.platform!=='win32'||process.env.CLEAR_SYNTHETIC_JOB!=='1')throw new Error('WINDOWS_JOB_HOST_REQUIRED');
for(const name of ['profile','cache','tmp','crash'])await mkdir(join(root,name),{recursive:false});
const child=spawn(chrome,['--headless=new','--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-sync','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-crash-reporter','--disable-breakpad','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND','--user-data-dir='+join(root,'profile'),'--disk-cache-dir='+join(root,'cache'),'--crash-dumps-dir='+join(root,'crash'),'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true,env:{...process.env,TEMP:join(root,'tmp'),TMP:join(root,'tmp')}});
let seq=0,buffer=Buffer.alloc(0),closed=false;const pending=new Map();
const fail=()=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CHROME_CLOSED'));}pending.clear();};
child.on('error',fail);child.on('exit',fail);
for(const stream of [child.stdio[3],child.stdio[4]])stream.on('error',fail);
child.stdio[4].on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);if(buffer.length>1024*1024){fail();return;}
  for(let end;(end=buffer.indexOf(0))>=0;){let msg;try{msg=JSON.parse(buffer.subarray(0,end));}catch{fail();return;}buffer=buffer.subarray(end+1);const p=pending.get(msg.id);if(!p)continue;pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error('CDP_ERROR')):p.resolve(msg.result);}
});
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{if(closed){reject(new Error('CHROME_CLOSED'));return;}const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_TIMEOUT'));},10000);pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
try {
  await send('Browser.getVersion');add('chrome-private-pipe','PASS');
  await send('Browser.setDownloadBehavior',{behavior:'deny'});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const result=await send('Runtime.evaluate',{expression:'6*7',returnByValue:true},sessionId);
  add('chrome-synthetic-cdp-roundtrip',result.result.value===42?'PASS':'FAIL');
  await send('Browser.close').catch(()=>{});
  for(let i=0;i<100&&!closed;i++)await new Promise(r=>setTimeout(r,50));
  add('chrome-normal-exit',closed?'PASS':'FAIL');
} catch {add('chrome-pipe-execution','FAIL');}
finally {
  // Job host closes the entire owned tree after this probe, including on timeout.
  if(!closed)child.kill();fail();child.stdio[3].destroy();child.stdio[4].destroy();
  await writeFile(output,JSON.stringify({schemaVersion:1,scope:'SYNTHETIC_ONLY',checks,realYbm:false},null,2)+'\n',{flag:'wx'});
}
process.exitCode=checks.some(x=>x.status==='FAIL')?1:0;
