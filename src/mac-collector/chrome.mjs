import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { writePrivate, requireValue } from './storage.mjs';
const exec=promisify(execFile);
import { chromePath, gateScript, parseProcesses, browserRecovery } from './browser-recovery.mjs';
export { chromePath } from './browser-recovery.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const recovery=browserRecovery({
  uid:process.getuid(),wait:delay,
  readProcesses:async()=>parseProcesses((await exec('/bin/ps',['-axww','-o','pid=,pgid=,uid=,stat=,command='],{maxBuffer:8*1024*1024})).stdout),
  signalGroup:(pid,signal)=>process.kill(-pid,signal),
});
const stopBrowserGroup=recovery.stopGroup;
export async function stopRecordedBrowser(path) {
  const record=await fs.readFile(join(path,'browser.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  let pid;
  if(record){
    // A crashed write can leave an incomplete record. Discovery is still
    // mandatory; missing/malformed metadata is never proof of browser exit.
    try{pid=JSON.parse(record).pid;}catch(error){if(!(error instanceof SyntaxError))throw error;}
    if(pid!==undefined)requireValue(Number.isSafeInteger(pid)&&pid>1,'INVALID_BROWSER_PID');
  }
  await recovery.recover(path,pid);
}
export async function startChrome(session,{ headless=false, synthetic=true, proxyUrl, signal }={}) {
  requireValue(synthetic,'LIVE_COLLECTOR_NOT_CONNECTED');
  requireValue(!proxyUrl,'SYNTHETIC_PROXY_FORBIDDEN');
  signal?.throwIfAborted();
  const args=['--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--disable-extensions','--disable-breakpad','--disable-crash-reporter','--metrics-recording-only','--password-store=basic','--use-mock-keychain','--disable-quic','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${join(session.path,'profile')}`,`--disk-cache-dir=${join(session.path,'cache')}`,`--crash-dumps-dir=${join(session.path,'crash')}`,'about:blank'];
  if(headless)args.unshift('--headless=new');
  // CDP has inherited pipes rather than an unauthenticated listening port.
  const child=spawn('/bin/sh',['-c',gateScript,'clear-chrome-gate',chromePath,...args],{detached:true,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,TMPDIR:join(session.path,'tmp')},stdio:['pipe','ignore','ignore','pipe','pipe']});
  let ended=false, sequence=0, pending=new Map(), buffer=Buffer.alloc(0);
  const failAll=()=>{ended=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('BROWSER_CLOSED'));}pending.clear();};
  const abort=()=>failAll();
  signal?.addEventListener('abort',abort,{once:true});
  child.once('error',failAll);child.once('exit',failAll);child.stdin.on('error',failAll);child.stdio[3].on('error',failAll);child.stdio[4].on('error',failAll);
  child.stdio[4].on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    if(buffer.length>2*1024*1024){failAll();child.kill('SIGTERM');return;}
    for(let end;(end=buffer.indexOf(0))!==-1;) {
      let msg;try{msg=JSON.parse(buffer.subarray(0,end));}catch{failAll();return;}
      buffer=buffer.subarray(end+1);
      const p=pending.get(msg.id);if(!p)continue;pending.delete(msg.id);clearTimeout(p.timer);
      if(msg.error)p.reject(new Error('BROWSER_COMMAND_FAILED'));else p.resolve(msg.result);
    }
  });
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason);return;}
    if(Date.now()>=session.expiresAt){reject(new Error('SESSION_EXPIRED'));return;}
    if(ended){reject(new Error('BROWSER_CLOSED'));return;}
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('BROWSER_TIMEOUT'));},10000);
    pending.set(id,{resolve,reject,timer});
    child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
  });
  try {
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new Error('CHROME_NOT_AVAILABLE')));});
    await writePrivate(join(session.path,'browser.json'),JSON.stringify({pid:child.pid}));
    signal?.throwIfAborted();
    child.stdin.end('launch\n');
    await send('Browser.getVersion');
    await send('Browser.setDownloadBehavior',{behavior:'deny'});
  } catch(e) {
    // The in-memory child is authoritative even before browser.json is written.
    try { if(child.pid)await stopBrowserGroup(session.path,child.pid); }
    catch(stopError) { session.browserStopFailed=true;throw stopError; }
    finally { signal?.removeEventListener('abort',abort);failAll();child.stdin.destroy();child.stdio[3].destroy();child.stdio[4].destroy(); }
    throw e;
  }
  return {pid:child.pid,send,async close(){
    if(!ended)await send('Browser.close').catch(()=>{});
    for(let i=0;i<40&&!ended;i++)await delay(50);
    await stopBrowserGroup(session.path,child.pid);
    signal?.removeEventListener('abort',abort);
    failAll();child.stdin.destroy();child.stdio[3].destroy();child.stdio[4].destroy();
  }};
}
