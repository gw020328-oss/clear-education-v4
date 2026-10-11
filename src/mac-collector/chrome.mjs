import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { writePrivate, requireValue } from './storage.mjs';
const exec=promisify(execFile);
export const chromePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function groupMembers(pid) {
  try {
    const {stdout}=await exec('/bin/ps',['-g',String(pid),'-o','pid=,uid=,stat=,command=']);
    return stdout.trim().split('\n').filter(Boolean).map(line=>{
      const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      requireValue(m,'BROWSER_PROCESS_CHECK_FAILED');return {pid:Number(m[1]),uid:Number(m[2]),state:m[3],command:m[4]};
    }).filter(p=>!p.state.startsWith('Z'));
  }catch(e){if(e.code===1)return [];throw e;}
}
export async function stopRecordedBrowser(path) {
  const record=await fs.readFile(join(path,'browser.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(!record)return;
  const {pid}=JSON.parse(record);
  requireValue(Number.isSafeInteger(pid)&&pid>1,'INVALID_BROWSER_PID');
  const validate=members=>{
    for(const m of members) {
      requireValue(m.uid===process.getuid(),'BROWSER_OWNER_MISMATCH');
      requireValue(m.command.startsWith(chromePath+' ') || m.command.startsWith('/Applications/Google Chrome.app/Contents/Frameworks/'),'BROWSER_EXECUTABLE_MISMATCH');
      requireValue(m.command.includes(`--user-data-dir=${join(path,'profile')}`),'BROWSER_PROFILE_MISMATCH');
    }
  };
  // ps can briefly lose an exiting process's full argv. Recheck without signalling
  // or deleting anything; a persistent identity mismatch remains a hard stop.
  const verifiedMembers=async()=>{
    for(let i=0;i<20;i++) {
      const members=await groupMembers(pid);
      try { validate(members);return members; }
      catch(e) { if(i===19)throw e;await delay(50); }
    }
  };
  let members=await verifiedMembers();if(!members.length)return;
  try{process.kill(-pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}
  for(let i=0;i<40;i++){if(!(await groupMembers(pid)).length)return;await delay(50);}
  members=await verifiedMembers();if(!members.length)return;
  try{process.kill(-pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}
  for(let i=0;i<40;i++){if(!(await groupMembers(pid)).length)return;await delay(50);}
  throw new Error('BROWSER_STILL_RUNNING');
}
export async function startChrome(session,{ headless=false, synthetic=true, proxyUrl }={}) {
  requireValue(synthetic,'LIVE_COLLECTOR_NOT_CONNECTED');
  requireValue(!proxyUrl,'SYNTHETIC_PROXY_FORBIDDEN');
  const args=['--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--disable-extensions','--disable-breakpad','--disable-crash-reporter','--metrics-recording-only','--password-store=basic','--use-mock-keychain','--disable-quic','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--user-data-dir=${join(session.path,'profile')}`,`--disk-cache-dir=${join(session.path,'cache')}`,`--crash-dumps-dir=${join(session.path,'crash')}`,'about:blank'];
  if(headless)args.unshift('--headless=new');
  // CDP has inherited pipes rather than an unauthenticated listening port.
  const child=spawn(chromePath,args,{detached:true,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,TMPDIR:join(session.path,'tmp')},stdio:['ignore','ignore','ignore','pipe','pipe']});
  let ended=false, sequence=0, pending=new Map(), buffer=Buffer.alloc(0);
  const failAll=()=>{ended=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('BROWSER_CLOSED'));}pending.clear();};
  child.once('error',failAll);child.once('exit',failAll);child.stdio[3].on('error',failAll);child.stdio[4].on('error',failAll);
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
    await send('Browser.getVersion');
    await send('Browser.setDownloadBehavior',{behavior:'deny'});
  } catch(e) { try{process.kill(-child.pid,'SIGKILL');}catch{}throw e; }
  return {pid:child.pid,send,async close(){
    if(!ended)await send('Browser.close').catch(()=>{});
    for(let i=0;i<40&&!ended;i++)await delay(50);
    await stopRecordedBrowser(session.path);
    failAll();child.stdio[3].destroy();child.stdio[4].destroy();
  }};
}
