import {spawn} from 'node:child_process';
import {childDiagnostic} from './child-diagnostics.mjs';
// Consume output to avoid deadlock, but retain counts only. Never print child stderr.
export function raceChild(t,environmentId,slot,mode){
 const start=Date.now(),events=[],waiters=new Set();let closed=false,exitCode=null,signal=null,stdoutBytes=0,stderrBytes=0,timedOut=false;
 const p=spawn(process.execPath,['tests/hackathon-test-vault/e5/crash-child.mjs',environmentId,'seal','none',slot,mode],{stdio:['ignore','pipe','pipe','ipc']});
 const summary=()=>({slot,exitCode,signal:signal==='SIGKILL'?'SIGKILL':signal===null?null:'OTHER',timedOut,elapsedMs:Date.now()-start,stdoutBytes,stderrBytes,events});
 p.stdout.on('data',x=>{stdoutBytes+=x.length;});p.stderr.on('data',x=>{stderrBytes+=x.length;});
 p.on('message',m=>{if(['READY','NONCE_READY','CHECKPOINT_READY','RESULT'].includes(m?.event)){events.push({event:m.event,diagnostic:childDiagnostic(m.diagnostic)});for(const wake of [...waiters])wake();}});
 const finished=new Promise(resolve=>{p.on('error',()=>{});p.on('close',(code,sig)=>{closed=true;exitCode=code;signal=sig;for(const wake of [...waiters])wake();resolve(summary());});});
 const timer=setTimeout(()=>{timedOut=true;p.kill('SIGKILL');},60000);
 finished.then(()=>clearTimeout(timer));
 t.after(async()=>{if(!closed)p.kill('SIGKILL');await finished;});
 return {release:event=>p.send({release:event}),finished,summary,
  wait(event){return new Promise((resolve,reject)=>{const wake=()=>{const found=events.find(x=>x.event===event);if(found||closed){waiters.delete(wake);if(found)resolve(found);else reject(Error('E5_TEST_CHILD_EARLY_EXIT '+JSON.stringify(summary())));}};waiters.add(wake);wake();});}
 };
}
