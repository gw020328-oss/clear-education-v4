import test from 'node:test';
import assert from 'node:assert/strict';
import {browserRecovery,chromePath,gatePrefix,parseProcesses,usesProfile} from '../../src/mac-collector/browser-recovery.mjs';
const path='/tmp/Synthetic App/session-one';
const proc=(pid=300,overrides={})=>({pid,pgid:pid,uid:501,state:'S',command:`${chromePath} --user-data-dir=${path}/profile --headless=new`,...overrides});
function setup(initial,options={}){
 let processes=initial;const signals=[];
 const api=browserRecovery({uid:501,wait:async()=>{},readProcesses:async()=>processes,signalGroup:async(pid,signal)=>{signals.push([pid,signal]);processes=options.onSignal?options.onSignal(processes,pid,signal):processes.filter(p=>p.pgid!==pid);}});
 return {...api,signals};
}
test('no metadata: recover orphan and its helpers while leaving a different profile running',async()=>{
 const {recover,signals}=setup([proc(),proc(301,{pgid:300}),proc(400,{command:`${chromePath} --user-data-dir=${path}/profile-other`})]);
 await recover(path);assert.deepEqual(signals,[[300,'SIGTERM']]);
});
test('profile match is an entire argument, including paths with spaces',()=>{
 assert.equal(usesProfile(`${chromePath} --user-data-dir=${path}/profile`,path),true);
 for(const suffix of ['-other','/child',' other'])assert.equal(usesProfile(`${chromePath} --user-data-dir=${path}/profile${suffix}`,path),false);
 assert.equal(usesProfile(`--fake--user-data-dir=${path}/profile`,path),false);
});
for(const [name,overrides,error] of [
 ['foreign owner',{uid:502},'BROWSER_OWNER_MISMATCH'],
 ['unrelated executable',{command:`/bin/sleep --user-data-dir=${path}/profile`},'BROWSER_EXECUTABLE_MISMATCH'],
 ['unrelated group member',{pid:301,pgid:300,command:'/bin/sleep 100'},'BROWSER_EXECUTABLE_MISMATCH'],
])test(`missing record refuses ${name} without sending a signal`,async()=>{
 const {recover,signals}=setup([proc(),proc(300,overrides)]);await assert.rejects(recover(path),new RegExp(error));assert.deepEqual(signals,[]);
});
test('recorded PID reuse cannot signal another profile',async()=>{
 const {recover,signals}=setup([proc(300,{command:`${chromePath} --user-data-dir=/tmp/other/profile`})]);
 await assert.rejects(recover(path,300),/BROWSER_PROFILE_MISMATCH/);assert.deepEqual(signals,[]);
});
test('enumeration failure prevents deletion permission',async()=>{
 const {recover}=browserRecovery({uid:501,wait:async()=>{},readProcesses:async()=>{throw new Error('PS_FAILED');},signalGroup:()=>assert.fail()});
 await assert.rejects(recover(path),/PS_FAILED/);
});
test('stubborn browser fails closed after TERM and KILL',async()=>{
 const {recover,signals}=setup([proc()],{onSignal:p=>p});await assert.rejects(recover(path),/BROWSER_STILL_RUNNING/);assert.deepEqual(signals,[[300,'SIGTERM'],[300,'SIGKILL']]);
});
test('revalidate ownership before KILL if the group number is reused',async()=>{
 const {recover,signals}=setup([proc()],{onSignal:()=>[proc(300,{command:'/bin/sleep 100'})]});
 await assert.rejects(recover(path),/BROWSER_EXECUTABLE_MISMATCH/);assert.deepEqual(signals,[[300,'SIGTERM']]);
});
test('pending gate can be stopped before Chrome executes',async()=>{
 const {stopGroup,signals}=setup([proc(300,{command:`${gatePrefix}--user-data-dir=${path}/profile`})]);await stopGroup(path,300);assert.deepEqual(signals,[[300,'SIGTERM']]);
});
test('process listing requires complete fields and ignores only zombies',()=>{
 assert.deepEqual(parseProcesses('300 300 501 Z gone\n'),[]);
 assert.equal(parseProcesses(`300 300 501 S ${chromePath} --user-data-dir=${path}/profile\n`)[0].command,proc().command.replace(' --headless=new',''));
 assert.throws(()=>parseProcesses('truncated'),/BROWSER_PROCESS_CHECK_FAILED/);
});
