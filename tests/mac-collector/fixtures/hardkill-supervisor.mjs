// Test-only process ownership and cancellation. Never imported by the collector.
import {spawn,execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {chromePath,gatePrefix,usesProfile} from '../../../src/mac-collector/browser-recovery.mjs';
const safeCodes=new Set(['CHILD_BINDING_FAILED','CHILD_BINDING_PARENT','CHILD_BINDING_COMMAND','CHILD_BINDING_TIME','PROCESS_QUERY_FAILED','SPAWN_FAILED','FIXTURE_NOT_KILLED','KILL_POINT_MISSING','PROCESS_IDENTITY_CHANGED','PROCESS_OWNER_CHANGED','BROWSER_IDENTITY_CHANGED','PROCESS_STILL_RUNNING','TRIAL_CANCELLED','RECOVERY_EXIT_FAILED','RECOVERY_SUMMARY_FAILED','LEGACY_ORPHAN_NOT_LIVE','LEGACY_ORPHAN_NOT_OWNED','ORPHAN_NOT_READY','DELETE_OBSERVER_MISSING','DELETE_WITH_LIVE_BROWSER','ROOT_REMOVE_RESULT_UNKNOWN','CLEANUP_FAILED_ROOT_PRESERVED']);
export const safeCode=(error,fallback='UNEXPECTED_ERROR')=>safeCodes.has(error?.message)?error.message:fallback;
export const fail=code=>{throw new Error(code);};
export const check=(ok,code)=>{if(!ok)fail(code);};
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const generation=(a,b)=>Boolean(a&&b&&a.pid===b.pid&&a.uid===b.uid&&a.start===b.start&&a.boot===b.boot);
export const identical=(a,b)=>generation(a,b)&&a.command===b.command&&a.pgid===b.pgid;
export function bounded(promise,ms,code,signal,now=performance.now.bind(performance)){
 const deadline=now()+ms;
 return new Promise((resolve,reject)=>{
  let timer,settled=false;
  const finish=(fn,value)=>{
   if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
   if(now()>=deadline){reject(new Error(code));return;}fn(value);
  };
  const abort=()=>finish(reject,new Error('TRIAL_CANCELLED'));
  Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,new Error(safeCode(error,code))));
  timer=setTimeout(()=>finish(reject,new Error(code)),ms);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 });
}
// Capture exit/error immediately, cache the result, and never expose a raw error.
export function observeChild(child){
 let result=null;
 const exited=new Promise(resolve=>{
  const done=value=>{if(result)return;result=value;resolve(value);};
  child.once('error',()=>done({error:'SPAWN_FAILED'}));
  child.once('exit',(code,signal)=>done({code,signal}));
  if(child.exitCode!==null&&child.exitCode!==undefined)done({code:child.exitCode,signal:null});
  else if(child.signalCode)done({code:null,signal:child.signalCode});
 });
 return {child,exited,get result(){return result;}};
}
export function batchLatch(){let failed=false;return {check(){check(!failed,'NOT_RUN_PREVIOUS_TRIAL_FAILED');},fail(){failed=true;}};}
export function trialScope({signal,emit=()=>{},trial,phase}){
 let stopped=false,preserved=false,cleanupPromise,removalStarted=false,cleanupFailed=false,cleanupState='PENDING';const started=performance.now(),pending=new Set();
 const diagnostic=(stage,event,code)=>emit(JSON.stringify({phase,trial,stage,event,elapsedMs:Math.round(performance.now()-started),...(code?{code}:{})}));
 const cancel=()=>{stopped=true;};signal?.addEventListener('abort',cancel,{once:true});
 const active=()=>check(!stopped&&!signal?.aborted,'TRIAL_CANCELLED');
 return {active,cancel,diagnostic,preserve(){preserved=true;},get preserved(){return preserved;},get cleanupState(){return cleanupState;},
  removing(){check(!cleanupFailed,'ROOT_REMOVE_RESULT_UNKNOWN');removalStarted=true;cleanupState='REMOVAL_STARTED';diagnostic('CLEANUP','REMOVE_BEGIN');},
  removed(){check(!cleanupFailed,'ROOT_REMOVE_RESULT_UNKNOWN');cleanupState='REMOVED';},
  async step(stage,ms,fn){
   active();diagnostic(stage,'BEGIN');
   const operation=Promise.resolve().then(()=>{active();return fn();});pending.add(operation);
   operation.then(()=>pending.delete(operation),()=>pending.delete(operation));
   try {const value=await bounded(operation,ms,stage+'_FAILED',signal);active();diagnostic(stage,'END');return value;}
   catch(error){cancel();diagnostic(stage,'FAILED',safeCode(error,stage+'_FAILED'));throw new Error(stage+'_FAILED');}
  },
  cleanup(fn){
   if(!cleanupPromise){cancel();cleanupPromise=(async()=>{diagnostic('CLEANUP','BEGIN');try{await fn();diagnostic('CLEANUP','END');}catch{cleanupFailed=true;preserved=!removalStarted;cleanupState=removalStarted?'RESULT_UNKNOWN':'PRESERVED';const code=removalStarted?'ROOT_REMOVE_RESULT_UNKNOWN':'CLEANUP_FAILED_ROOT_PRESERVED';diagnostic('CLEANUP','FAILED',code);throw new Error(code);}finally{signal?.removeEventListener('abort',cancel);}})();}
   return cleanupPromise;
  },
  async settled(){await bounded(Promise.allSettled([...pending]),2000,'PENDING_OPERATION');},
 };
}
// Only fixed-format synthetic evidence is written inside the new private test root.
export function record(root,event){appendFileSync(join(root,'lifecycle.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});}
export function records(root){
 const path=join(root,'lifecycle.jsonl');if(!existsSync(path))return [];
 const text=readFileSync(path,'utf8');check(text.length<262144,'REGISTRY_LIMIT');
 try{return text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{fail('REGISTRY_INVALID');}
}
const query=(file,args)=>{
 try{return execFileSync(file,args,{encoding:'utf8',timeout:1500,killSignal:'SIGKILL',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LC_ALL:'en_US.UTF-8'}});}
 catch{fail('PROCESS_QUERY_FAILED');}
};
export function nativeSnapshot(){
 const boot=query('/usr/sbin/sysctl',['-n','kern.boottime']).trim();
 return query('/bin/ps',['-axww','-o','pid=,ppid=,pgid=,uid=,lstart=,stat=,command=']).split('\n').filter(line=>line.trim()).map(line=>{
  const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+(\S+)\s+(.+)$/);
  check(m,'PROCESS_QUERY_FAILED');return {pid:+m[1],ppid:+m[2],pgid:+m[3],uid:+m[4],start:m[5],state:m[6],command:m[7],boot};
 }).filter(p=>!p.state.startsWith('Z'));
}
export function registerSelf(root,role){
 const identity=nativeSnapshot().find(p=>p.pid===process.pid);check(identity,'SELF_IDENTITY_MISSING');
 record(root,{type:'SELF',role,identity});return identity;
}
export function bindChildIdentity(child,identity,{commands,parentPid,uid,boot,bornAt,profile}){
 const exited=()=>child.exitCode!==null&&child.exitCode!==undefined||Boolean(child.signalCode);
 if(exited())return null;
 check(identity&&identity.pid===child.pid&&identity.ppid===parentPid&&identity.pgid===child.pid,'CHILD_BINDING_PARENT');
 check(identity.uid===uid&&identity.boot===boot&&commands.includes(identity.command),'CHILD_BINDING_COMMAND');
 const start=Date.parse(identity.start);
 check(Number.isFinite(start)&&start>=Math.floor(bornAt/1000)*1000&&start<=Date.now(),'CHILD_BINDING_TIME');
 if(profile)check(browserCommand(identity,profile),'CHILD_BINDING_FAILED');
 if(exited())return null;
 return identity;
}
export function registerChild(root,child,role,profile,binding){
 const all=nativeSnapshot();
 const identity=bindChildIdentity(child,all.find(p=>p.pid===child.pid),{...binding,parentPid:process.pid,uid:process.getuid(),boot:all.find(p=>p.pid===process.pid)?.boot,profile:role==='CHROME'?profile:undefined});
 if(identity)record(root,{type:'PROCESS',role,identity,commands:binding.commands,...(profile?{profile}:{})});
}
export function ownedEntries(root){
 const events=records(root),entries=events.filter(e=>e.type==='PROCESS');
 for(const self of events.filter(e=>e.type==='SELF')){
  // exec transitions and lockf's worker child must be bound to a recorded creation.
  if(entries.some(e=>e.commands?.includes(self.identity.command)&&e.identity.uid===self.identity.uid&&e.identity.boot===self.identity.boot&&e.identity.pgid===self.identity.pgid&&(generation(e.identity,self.identity)||self.identity.ppid===e.identity.pid)))entries.push(self);
 }
 return entries;
}
export const browserCommand=(p,path)=>usesProfile(p.command,path)&&(p.command.startsWith(chromePath+' ')||p.command.startsWith('/Applications/Google Chrome.app/Contents/Frameworks/')||p.command.startsWith(gatePrefix));
export function assertAbsent(all,path,entries=[]){
 check(!all.some(p=>usesProfile(p.command,path)),'DELETE_WITH_LIVE_BROWSER');
 for(const e of entries.filter(e=>e.role==='CHROME'&&e.profile===path))check(!all.some(p=>generation(e.identity,p)),'DELETE_WITH_LIVE_BROWSER');
}
export async function observedDelete({path,entries,snapshot,active,remove,emit}){
 active();const all=await bounded(Promise.resolve().then(snapshot),2000,'PROCESS_QUERY_FAILED');
 active();assertAbsent(all,path,entries);emit('DELETE_BEFORE');active();
 const result=await remove();emit('DELETE_AFTER');return result;
}
export function verifyGroup(all,anchor,{profile,entries=[],uid}){
 const members=all.filter(p=>p.pgid===anchor.pgid);if(!members.length)return [];
 const leader=members.find(p=>p.pid===anchor.pid);
 // A missing Chrome leader may leave helpers. Each helper still needs exact profile ownership.
 if(leader)check(generation(anchor,leader),'PROCESS_IDENTITY_CHANGED');
 for(const p of members){
  check(p.uid===uid&&p.boot===anchor.boot,'PROCESS_OWNER_CHANGED');
  if(profile){check(browserCommand(p,profile),'BROWSER_IDENTITY_CHANGED');continue;}
  const known=entries.some(e=>identical(e.identity,p));
  // The product's process-identity queries may briefly be children of a pinned worker.
  const queryChild=/^\/(?:bin\/ps|usr\/sbin\/sysctl) /.test(p.command)&&members.some(parent=>parent.pid===p.ppid&&entries.some(e=>identical(e.identity,parent)));
  check(known||queryChild,'PROCESS_IDENTITY_CHANGED');
 }
 return members;
}
export async function stopOwnedGroup(anchor,options,{snapshot=nativeSnapshot,signalGroup=(pid,signal)=>process.kill(-pid,signal),wait=sleep,graceMs=500,now=performance.now.bind(performance),guard=()=>{}}={}){
 for(const signal of ['SIGTERM','SIGKILL']){
  guard();const all=await bounded(Promise.resolve().then(snapshot),2000,'PROCESS_QUERY_FAILED');
  if(!verifyGroup(all,anchor,options).length)return;
  guard();try{await signalGroup(anchor.pgid,signal);}catch(e){if(e.code!=='ESRCH')fail('PROCESS_SIGNAL_FAILED');}
  const until=now()+graceMs;
  do{
   guard();const current=await bounded(Promise.resolve().then(snapshot),2000,'PROCESS_QUERY_FAILED');
   if(!verifyGroup(current,anchor,options).length)return;
   await wait(25);
  }while(now()<until);
 }
 fail('PROCESS_STILL_RUNNING');
}
export function spawnTracked(root,role,args,options={}){
 const bornAt=Date.now(),child=spawn(process.execPath,args,{...options,detached:true,stdio:['ignore','pipe','pipe']});
 const tracked=observeChild(child),closed=new Promise(resolve=>child.once('close',resolve));let output='',bytes=0,overflow=false;
 for(const pipe of [child.stdout,child.stderr])pipe.on('data',b=>{bytes+=b.length;if(bytes<=65536)output+=b;else overflow=true;});
 // The direct child handle is registered synchronously before control returns to the test.
 // A very fast child may already be gone, which is safe; its exit is still observed.
 return {...tracked,closed,binding:{commands:[[process.execPath,...args].join(' ')],bornAt},get result(){return tracked.result;},get output(){check(!overflow,'CHILD_OUTPUT_LIMIT');return output;}};
}
export function markCancelled(root){writeFileSync(join(root,'cancelled'),'1',{mode:0o600});}
