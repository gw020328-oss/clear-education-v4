import {promises as fs,mkdtempSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {prepareRoot} from '../../../src/mac-collector/storage.mjs';
import {chromePath,usesProfile} from '../../../src/mac-collector/browser-recovery.mjs';
import {safeCode,check,bounded,sleep,trialScope,records,record,nativeSnapshot,registerChild,spawnTracked,markCancelled,ownedEntries,stopOwnedGroup,assertAbsent,browserCommand} from './hardkill-supervisor.mjs';
const worker=fileURLToPath(new URL('../../../src/mac-collector/worker.mjs',import.meta.url));
const launcher=fileURLToPath(new URL('../../../src/mac-collector/launch.mjs',import.meta.url));
const observer=fileURLToPath(new URL('./hardkill-lifecycle-observer.mjs',import.meta.url));
export async function runTrial(t,{phase,trial,batch}){
 batch.check();
 const scope=trialScope({signal:t.signal,phase,trial,emit:line=>t.diagnostic(line)});
 let root;const children=[],profiles=new Set();
 const snapshot=()=>{try{return nativeSnapshot();}catch{scope.preserve();throw new Error('PROCESS_QUERY_FAILED');}};
 const getEntries=()=>ownedEntries(root);
 const start=(role,args,extra={})=>{
  scope.active();
  const child=spawnTracked(root,role,['--import',pathToFileURL(observer).href+'?trial='+root.split('/').at(-1),...args],{env:{...process.env,CLEAR_LOCKED:'1',CLEAR_TEST_ROOT:root,CLEAR_LIFECYCLE_ROOT:root,CLEAR_LIFECYCLE_ROLE:role,...extra}});
  children.push(child);try{registerChild(root,child.child,role,undefined,child.binding);}catch{scope.preserve();throw new Error('CHILD_BINDING_FAILED');}return child;
 };
 const cleanup=()=>scope.cleanup(async()=>{
  if(!root)return;
  markCancelled(root);const until=performance.now()+12000;
  const deadline=()=>check(performance.now()<until,'CLEANUP_DEADLINE');
  const perform=async()=>{
   let entries=getEntries();for(const e of entries)if(e.profile)profiles.add(e.profile);
   const groups=new Map();
   for(const e of entries.filter(e=>e.role!=='CHROME'))if(!groups.has(e.identity.pgid))groups.set(e.identity.pgid,e.identity);
   // Stop every producer before scanning/removing sessions. Launcher and its lockf worker
   // have different groups; the pipe holder is another independently tracked producer.
   for(const anchor of groups.values()){deadline();await stopOwnedGroup(anchor,{uid:process.getuid(),entries},{snapshot,guard:deadline});}
   for(const child of children){deadline();await bounded(child.exited,1000,'CHILD_NOT_EXITED');}
   await scope.settled();deadline();
   entries=getEntries();for(const e of entries)if(e.profile)profiles.add(e.profile);
   for(const name of await fs.readdir(root))if(/^session-[0-9a-f-]+$/.test(name))profiles.add(join(root,name));
   for(const profile of profiles){
    const all=snapshot(),matching=all.filter(p=>usesProfile(p.command,profile));
    for(const pgid of new Set(matching.map(p=>p.pgid))){
     deadline();const anchor=matching.find(p=>p.pid===pgid)||matching.find(p=>p.pgid===pgid);
     check(browserCommand(anchor,profile),'BROWSER_IDENTITY_CHANGED');
     await stopOwnedGroup(anchor,{uid:process.getuid(),profile,entries},{snapshot,guard:deadline});
    }
    assertAbsent(snapshot(),profile,entries);
   }
   deadline();check(!scope.preserved,'ROOT_PRESERVED');
   // No producer remains, no in-flight body operation remains, and every owned profile
   // has been checked. A late completion cannot start work: scope is already cancelled.
   scope.removing();await bounded(fs.rm(root,{recursive:true,force:true}),2000,'ROOT_REMOVE_RESULT_UNKNOWN');
   const exists=await fs.stat(root).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw new Error('ROOT_STAT_FAILED');});check(!exists,'ROOT_NOT_REMOVED');deadline();scope.removed();
  };
  await bounded(perform(),12500,'CLEANUP_DEADLINE');
 });
 t.after(async()=>{try{await cleanup();}catch(error){batch.fail();throw new Error(safeCode(error,'CLEANUP_FAILED'));}});
 try{
  await scope.step('ROOT_READY',5000,async()=>{
   root=mkdtempSync(join(realpathSync(tmpdir()),'clear-hardkill-lifecycle-'));
   scope.active();await fs.chmod(root,0o700);scope.active();await prepareRoot(root,{synthetic:true});
  });
  await scope.step('WORKER_EXIT',15000,async()=>{
   const child=start('FAULT_WORKER',[worker,'--test-browser-hold'],{CLEAR_KILL_PHASE:phase});
   const result=await child.exited;for(const event of records(root).filter(e=>e.type==='FIXTURE_FAILURE'))scope.diagnostic('WORKER_EXIT','FIXTURE_FAILURE',event.code);check(result.signal==='SIGKILL','FIXTURE_NOT_KILLED');
   check(records(root).some(e=>e.type==='KILL_POINT'&&e.phase===phase),'KILL_POINT_MISSING');
  });
  let oldPath;
  await scope.step('ORPHAN_CHECK',5000,async()=>{
   const names=(await fs.readdir(root)).filter(n=>n.startsWith('session-'));check(names.length===1,'SESSION_COUNT');oldPath=join(root,names[0]);profiles.add(oldPath);
   const value=await fs.readFile(join(oldPath,'browser.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw new Error('RECORD_READ_FAILED');});
   if(['before-record','legacy-missing'].includes(phase))check(value===null,'RECORD_MUST_BE_MISSING');
   if(phase==='empty-record')check(value==='','RECORD_MUST_BE_EMPTY');
   if(phase==='partial-record')check(value==='{','RECORD_MUST_BE_PARTIAL');
   if(phase==='after-release'){let parsed;try{parsed=JSON.parse(value);}catch{}check(parsed?.pid>1,'RECORD_MUST_BE_COMPLETE');}
   const all=snapshot(),live=all.filter(p=>usesProfile(p.command,oldPath)&&p.command.startsWith(chromePath+' '));
   if(phase==='legacy-missing'){
    const entries=getEntries();check(live.length>0,'LEGACY_ORPHAN_NOT_LIVE');
    check(live.every(p=>p.uid===process.getuid()&&entries.some(e=>e.role==='CHROME'&&e.profile===oldPath&&e.identity.pid===p.pid&&e.identity.start===p.start&&e.identity.boot===p.boot)),'LEGACY_ORPHAN_NOT_OWNED');
    record(root,{type:'ORPHAN_CONFIRMED'});
   }else if(['before-record','empty-record','partial-record'].includes(phase))check(live.length===0,'CHROME_EXECUTED_BEFORE_RECORD');
  });
  await scope.step('RECOVERY_LAUNCH',20000,async()=>{
   const child=start('LAUNCHER',[launcher]);const result=await child.exited;await bounded(child.closed,1000,'CHILD_CLOSE_FAILED');
   check(result.code===0,'RECOVERY_EXIT_FAILED');check(/"staleSessionsRemoved":1/.test(child.output)&&/"profilesDeleted":true/.test(child.output),'RECOVERY_SUMMARY_FAILED');
  });
  await scope.step('DELETE_CHECK',5000,async()=>{
   const events=records(root),before=events.findIndex(e=>e.type==='DELETE_BEFORE'&&e.path===oldPath),after=events.findIndex(e=>e.type==='DELETE_AFTER'&&e.path===oldPath);
   check(before>=0&&after>before,'DELETE_OBSERVER_MISSING');
   // Existing late-recreation check remains in addition to the actual pre-delete observer.
   await sleep(1000);check((await fs.readdir(root)).filter(n=>n.startsWith('session-')).length===0,'SESSION_RECREATED');assertAbsent(snapshot(),oldPath,getEntries());
  });
 }catch{batch.fail();throw new Error('HARDKILL_TRIAL_FAILED');}
 finally{try{await cleanup();}catch(error){batch.fail();throw new Error(safeCode(error,'CLEANUP_FAILED'));}}
}
