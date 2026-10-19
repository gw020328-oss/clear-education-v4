// Preloaded only by the hard-kill harness. No product flags or package changes.
import {promises as fs,writeFileSync,existsSync} from 'node:fs';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {safeCode,check,record,records,nativeSnapshot,registerSelf,registerChild,observedDelete,sleep,bounded} from './hardkill-supervisor.mjs';
const root=process.env.CLEAR_LIFECYCLE_ROOT,role=process.env.CLEAR_LIFECYCLE_ROLE;
check(root&&root===process.env.CLEAR_TEST_ROOT,'TEST_ROOT_REQUIRED');
registerSelf(root,role);
const spawn=cp.spawn,open=fs.open.bind(fs),rm=fs.rm.bind(fs);
const observer=import.meta.url,holder=fileURLToPath(new URL('./hardkill-lifecycle-holder.mjs',import.meta.url));
const phase=process.env.CLEAR_KILL_PHASE;let gateRegistered=Promise.resolve();
cp.spawn=function(command,args,options){
 check(!existsSync(join(root,'cancelled')),'TRIAL_CANCELLED');
 const gate=command==='/bin/sh'&&args[2]==='clear-chrome-gate';
 const worker=command==='/bin/sh'&&args[2]==='clear-worker-launch';
 let profile;
 if(gate){
  const flag=args.find(arg=>arg.startsWith('--user-data-dir='));check(flag,'PROFILE_REQUIRED');profile=dirname(flag.slice('--user-data-dir='.length));
  if(phase==='legacy-missing'){
   // Keep CDP's pipe owner alive independently of the killed collector. No port is opened.
   writeFileSync(join(root,'holder-config.json'),JSON.stringify({command:args[3],args:args.slice(4),profile}),{mode:0o600});
   command=process.execPath;args=[holder,root];options={...options,env:{...options.env,CLEAR_TEST_ROOT:root}};
  }
 }
 if(worker){
  const at=args.indexOf(process.execPath);check(at>=0,'WORKER_EXEC_REQUIRED');
  args=[...args.slice(0,at+1),'--import',observer,...args.slice(at+1)];
  options={...options,env:{...options.env,CLEAR_LIFECYCLE_ROOT:root,CLEAR_LIFECYCLE_ROLE:'RECOVERY_WORKER'}};
 }
 const bornAt=Date.now(),commands=[[command,...args].join(' ')];
 if(worker){const at=args.indexOf('/usr/bin/lockf');commands.push(args.slice(at).join(' '));const node=args.indexOf(process.execPath);commands.push(args.slice(node).join(' '));}
 if(gate&&phase!=='legacy-missing')commands.push([args[3],...args.slice(4)].join(' '));
 const child=spawn(command,args,options);
 if(gate||worker){
  gateRegistered=new Promise((resolve,reject)=>{
   child.once('error',()=>reject(new Error('SPAWN_FAILED')));
   child.once('spawn',()=>{try{registerChild(root,child,worker?'WORKER_GROUP':phase==='legacy-missing'?'HOLDER':'CHROME',profile,{commands,bornAt});resolve();}catch(error){record(root,{type:'FIXTURE_FAILURE',code:safeCode(error)});reject(error);}});
  });
  // Observe rejection immediately even if the product has not reached browser.json yet.
  gateRegistered.catch(()=>{});
 }
 if(gate&&phase==='after-release'){
  const end=child.stdin.end.bind(child.stdin);
  child.stdin.end=(...values)=>{const result=end(...values);setTimeout(()=>{record(root,{type:'KILL_POINT',phase});process.kill(process.pid,'SIGKILL');},25);return result;};
 }
 return child;
};
syncBuiltinESMExports();
fs.open=async function(path,...args){
 if(String(path).endsWith('/browser.json')&&phase&&phase!=='after-release'){
  await gateRegistered;
  if(phase==='legacy-missing')await bounded((async()=>{while(!records(root).some(e=>e.type==='ORPHAN_READY'))await sleep(25);})(),10000,'ORPHAN_NOT_READY');
  if(phase==='empty-record'){const file=await open(path,...args);await file.close();}
  if(phase==='partial-record'){const file=await open(path,...args);await file.writeFile('{');await file.close();}
  if(phase!=='legacy-missing')await sleep(25);
  record(root,{type:'KILL_POINT',phase});process.kill(process.pid,'SIGKILL');await new Promise(()=>{});
 }
 return open(path,...args);
};
fs.rm=async function(path,...args){
 if(dirname(String(path))===root&&/^session-[0-9a-f-]+$/.test(basename(String(path)))){
  return observedDelete({path:String(path),entries:records(root),snapshot:nativeSnapshot,
   active:()=>check(!existsSync(join(root,'cancelled')),'TRIAL_CANCELLED'),
   remove:()=>rm(path,...args),emit:type=>record(root,{type,path:String(path)})});
 }
 return rm(path,...args);
};
