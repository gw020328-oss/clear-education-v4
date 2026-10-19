import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {bounded,observeChild,batchLatch,trialScope,bindChildIdentity,stopOwnedGroup,assertAbsent,observedDelete} from './fixtures/hardkill-supervisor.mjs';
import {chromePath} from '../../src/mac-collector/browser-recovery.mjs';
const path='/tmp/SYNTHETIC/session-one',start=new Date(Math.floor(Date.now()/1000)*1000).toString();
const proc=(extra={})=>({pid:300,ppid:10,pgid:300,uid:501,start,boot:'SYNTHETIC_BOOT',state:'S',command:`${chromePath} --user-data-dir=${path}/profile --headless=new`,...extra});
const child=()=>Object.assign(new EventEmitter(),{pid:300,exitCode:null,signalCode:null});
const binding={commands:[proc().command],parentPid:10,uid:501,boot:'SYNTHETIC_BOOT',bornAt:Date.parse(start),profile:path};
function recovery(initial,{onSignal,read,graceMs=1}={}){
 let all=initial;const signals=[];let clock=0;
 return {signals,options:{snapshot:read??(()=>all),signalGroup:async(pid,signal)=>{signals.push([pid,signal]);all=onSignal?onSignal(all,signal):[];},wait:async()=>{clock+=25;},now:()=>clock,graceMs}};
}
test('fast exit is cached for every waiter, including already exited child',async()=>{
 const c=child(),tracked=observeChild(c);c.emit('exit',0,null);assert.deepEqual(await tracked.exited,{code:0,signal:null});assert.deepEqual(await tracked.exited,tracked.result);
 const old=child();old.exitCode=7;assert.equal((await observeChild(old).exited).code,7);
});
test('spawn error is bounded and never exposes the raw message',async()=>{
 const c=child(),tracked=observeChild(c);c.emit('error',new Error('SYNTHETIC_PRIVATE_DETAIL'));assert.deepEqual(await tracked.exited,{error:'SPAWN_FAILED'});
});
test('missing child exit cannot wait indefinitely',async()=>{await assert.rejects(bounded(observeChild(child()).exited,10,'WORKER_TIMEOUT'),/WORKER_TIMEOUT/);});
test('completion after monotonic deadline loses even before timer callback',async()=>{
 let clock=0,resolve;const promise=new Promise(r=>{resolve=r;});const result=bounded(promise,1000,'LATE',undefined,()=>clock);clock=1001;resolve('would otherwise succeed');await assert.rejects(result,/LATE/);
});
test('abort settles once; a late completion cannot change failure',async()=>{
 let resolve;const c=new AbortController(),p=bounded(new Promise(r=>{resolve=r;}),1000,'TIMEOUT',c.signal);c.abort();resolve('late');await assert.rejects(p,/TRIAL_CANCELLED/);
});
test('stage failure latches cancellation and prevents a later spawn',async()=>{
 let spawns=0;const s=trialScope({phase:'synthetic',trial:1});await assert.rejects(s.step('WAIT',10,()=>new Promise(()=>{})),/WAIT_FAILED/);await assert.rejects(s.step('SPAWN',100,()=>{spawns++;}));assert.equal(spawns,0);
});
test('cleanup is a shared promise and late body cannot delete',async()=>{
 const s=trialScope({phase:'synthetic',trial:1});let finish,removes=0,cleanups=0;
 const body=s.step('WAIT',1000,async()=>{await new Promise(r=>{finish=r;});s.active();removes++;});await Promise.resolve();
 const clean=()=>{cleanups++;};const first=s.cleanup(clean),second=s.cleanup(clean);assert.equal(first,second);finish();await assert.rejects(body);await first;assert.equal(cleanups,1);assert.equal(removes,0);
});
test('cleanup failure preserves root and cannot become a successful second cleanup',async()=>{
 const s=trialScope({phase:'synthetic',trial:1});const first=s.cleanup(async()=>{throw new Error('unsafe');});await assert.rejects(first,/ROOT_PRESERVED/);assert.equal(s.preserved,true);assert.equal(s.cleanup(()=>{}),first);
});
test('batch failure blocks all subsequent trial setup instead of counting success',()=>{const b=batchLatch();b.check();b.fail();let spawns=0;assert.throws(()=>{b.check();spawns++;},/NOT_RUN_PREVIOUS_TRIAL_FAILED/);assert.equal(spawns,0);});
test('initial binding requires exact expected child, generation context and profile',()=>{const c=child();assert.equal(bindChildIdentity(c,proc(),binding).pid,300);});
for(const [name,change] of [['other command',{command:'/bin/sleep 100'}],['other parent',{ppid:11}],['other group',{pgid:301}],['other uid',{uid:502}],['other boot',{boot:'OTHER'}],['older start',{start:new Date(Date.parse(start)-10000).toString()}],['future reused start',{start:new Date(Date.now()+10000).toString()}],['other profile',{command:proc().command.replace('/profile','/different')}]] )test(`initial binding rejects ${name} without registering or signalling`,()=>{
 let registered=0,signals=0;assert.throws(()=>{bindChildIdentity(child(),proc(change),binding);registered++;signals++;},/CHILD_BINDING_/);assert.equal(registered,0);assert.equal(signals,0);
});
test('fast exit then reused PID is never bound, even when queried afterwards',()=>{
 const c=child();c.exitCode=0;assert.equal(bindChildIdentity(c,proc({command:'/bin/sleep 100',start:new Date().toString()}),binding),null);
});
test('TERM unresponsive group escalates to KILL and confirms absence',async()=>{
 const r=recovery([proc()],{onSignal:(all,signal)=>signal==='SIGKILL'?[]:all});await stopOwnedGroup(proc(),{profile:path,uid:501},r.options);assert.deepEqual(r.signals,[[300,'SIGTERM'],[300,'SIGKILL']]);
});
test('launcher gone does not hide a live separately pinned worker group',async()=>{
 const worker=proc({pid:400,pgid:400,command:'/node worker'}),r=recovery([worker]);await stopOwnedGroup(worker,{uid:501,entries:[{identity:worker}]},r.options);assert.deepEqual(r.signals,[[400,'SIGTERM']]);
});
test('query rejection sends no signal',async()=>{
 const r=recovery([],{read:()=>{throw new Error('PRIVATE');}});await assert.rejects(stopOwnedGroup(proc(),{profile:path,uid:501},r.options),/PROCESS_QUERY_FAILED/);assert.deepEqual(r.signals,[]);
});
test('query that never settles is bounded and sends no signal',{timeout:3000},async()=>{
 const r=recovery([],{read:()=>new Promise(()=>{})});await assert.rejects(stopOwnedGroup(proc(),{profile:path,uid:501},r.options),/PROCESS_QUERY_FAILED/);assert.deepEqual(r.signals,[]);
});
test('PID generation change after TERM prevents KILL',async()=>{
 const r=recovery([proc()],{onSignal:all=>all.map(p=>({...p,start:'NEW_GENERATION'}))});await assert.rejects(stopOwnedGroup(proc(),{profile:path,uid:501},r.options),/PROCESS_IDENTITY_CHANGED/);assert.deepEqual(r.signals,[[300,'SIGTERM']]);
});
test('foreign profile in the same group prevents all signals',async()=>{
 const r=recovery([proc(),proc({pid:301,command:`${chromePath} --user-data-dir=/tmp/other/profile`})]);await assert.rejects(stopOwnedGroup(proc(),{profile:path,uid:501},r.options),/BROWSER_IDENTITY_CHANGED/);assert.deepEqual(r.signals,[]);
});
test('stubborn process after KILL fails; absence cannot be assumed',async()=>{
 const r=recovery([proc()],{onSignal:all=>all});await assert.rejects(stopOwnedGroup(proc(),{profile:path,uid:501},r.options),/PROCESS_STILL_RUNNING/);
});
test('pre-delete observer checks actual order and only emits completion after remove',async()=>{
 const order=[];await observedDelete({path,entries:[],active:()=>{},snapshot:()=>{order.push('snapshot');return [];},remove:async()=>{order.push('remove');},emit:e=>order.push(e)});assert.deepEqual(order,['snapshot','DELETE_BEFORE','remove','DELETE_AFTER']);
});
for(const [name,snapshot] of [['live browser',()=>[proc()]],['query error',()=>{throw new Error('PRIVATE');}]])test(`pre-delete observer preserves directory on ${name}`,async()=>{
 let removed=0;await assert.rejects(observedDelete({path,entries:[],active:()=>{},snapshot,remove:()=>{removed++;},emit:()=>{}}));assert.equal(removed,0);
});
test('cancellation during query blocks late delete',async()=>{
 let resolve,removed=0,cancelled=false;const p=observedDelete({path,entries:[],active:()=>{if(cancelled)throw new Error('CANCELLED');},snapshot:()=>new Promise(r=>{resolve=r;}),remove:()=>{removed++;},emit:()=>{}});await Promise.resolve();cancelled=true;resolve([]);await assert.rejects(p,/CANCELLED/);assert.equal(removed,0);
});
test('recorded same-generation Chrome with lost profile flag still blocks deletion',()=>{assert.throws(()=>assertAbsent([proc({command:'unexpected changed command'})],path,[{role:'CHROME',profile:path,identity:proc()}]),/DELETE_WITH_LIVE_BROWSER/);});
test('diagnostics contain only fixed stage/trial/time and never exception payload',async()=>{
 const events=[],s=trialScope({phase:'legacy-missing',trial:2,emit:value=>events.push(JSON.parse(value))});await assert.rejects(s.step('WORKER_EXIT',100,()=>{throw new Error('/PRIVATE/argv cookie=secret');}));assert.deepEqual(Object.keys(events[0]),['phase','trial','stage','event','elapsedMs']);assert.doesNotMatch(JSON.stringify(events),/PRIVATE|argv|cookie/);
});
test('exact UTF-8 command binding stays strict for a non-ASCII runtime path',()=>{
 const p=proc({command:'/tmp/한글/node --import file:///tmp/trial-unique/observer.mjs worker'});
 assert.equal(bindChildIdentity(child(),p,{...binding,commands:[p.command],profile:undefined}),p);
 assert.throws(()=>bindChildIdentity(child(),{...p,command:p.command.replace('한글','OTHER')},{...binding,commands:[p.command],profile:undefined}),/CHILD_BINDING_/);
});
test('cleanup deadline reached after TERM prevents a late KILL',async()=>{
 let allowed=true;const r=recovery([proc()],{onSignal:all=>{allowed=false;return all;}});
 await assert.rejects(stopOwnedGroup(proc(),{profile:path,uid:501},{...r.options,guard:()=>{if(!allowed)throw new Error('CLEANUP_DEADLINE');}}),/CLEANUP_DEADLINE/);assert.deepEqual(r.signals,[[300,'SIGTERM']]);
});
test('blocking completion past deadline cancels the stage before any following side effect',async()=>{
 const s=trialScope({phase:'synthetic',trial:1});let effects=0;
 await assert.rejects(s.step('BLOCKING',1,()=>{const end=performance.now()+5;while(performance.now()<end){}return 'late';}),/BLOCKING_FAILED/);
 assert.throws(()=>{s.active();effects++;},/TRIAL_CANCELLED/);assert.equal(effects,0);
});
test('removal I/O failure is unknown, never a preserved-root claim',async()=>{
 const s=trialScope({phase:'synthetic',trial:1});await assert.rejects(s.cleanup(async()=>{s.removing();throw new Error('IO failed');}),/ROOT_REMOVE_RESULT_UNKNOWN/);assert.equal(s.preserved,false);assert.equal(s.cleanupState,'RESULT_UNKNOWN');
});
test('late removal completion cannot overwrite a timed-out unknown result',async()=>{
 const s=trialScope({phase:'synthetic',trial:1});let finish;
 const actual=(async()=>{s.removing();await new Promise(r=>{finish=r;});s.removed();})();
 await assert.rejects(s.cleanup(()=>bounded(actual,10,'ROOT_REMOVE_RESULT_UNKNOWN')),/ROOT_REMOVE_RESULT_UNKNOWN/);finish();await assert.rejects(actual,/ROOT_REMOVE_RESULT_UNKNOWN/);assert.equal(s.cleanupState,'RESULT_UNKNOWN');assert.equal(s.preserved,false);
});
for(const [name,occupant] of [
 ['leader gone and helper lost profile argument',proc({pid:301,command:'/Applications/Google Chrome.app/Contents/Frameworks/Synthetic Helper --type=renderer'})],
 ['recorded PGID reused by an unrelated process',proc({pid:300,start:'NEW_GENERATION',command:'/bin/sleep 100'})],
])test(`ambiguous occupied Chrome group preserves root: ${name}`,async()=>{
 const s=trialScope({phase:'synthetic',trial:1}),entries=[{role:'CHROME',profile:path,identity:proc()}];let removes=0;
 await assert.rejects(s.cleanup(()=>observedDelete({path,entries,snapshot:()=>[occupant],active:()=>{},remove:()=>{removes++;},emit:()=>{}})),/CLEANUP_FAILED_ROOT_PRESERVED/);
 assert.equal(removes,0);assert.equal(s.cleanupState,'PRESERVED');assert.equal(s.preserved,true);
 // Neither profile discovery nor owned-group validation grants a signal to this occupant.
 assert.equal(occupant.command.includes('--user-data-dir='+path+'/profile'),false);
 const r=recovery([occupant]);await assert.rejects(stopOwnedGroup(proc(),{profile:path,uid:501,entries},r.options),/IDENTITY_CHANGED/);assert.deepEqual(r.signals,[]);
});
