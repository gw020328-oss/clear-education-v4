import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm,mkdir,readdir,unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { withEvaluationLease,atomicEvaluationCheckpoint } from '../../src/ai-policy/evaluation-ledger.mjs';
const moduleUrl=new URL('../../src/ai-policy/evaluation-ledger.mjs',import.meta.url).href;
const childCode=`import {withEvaluationLease,atomicEvaluationCheckpoint} from ${JSON.stringify(moduleUrl)};
import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL(process.argv[1]);
try{await withEvaluationLease(dir,async()=>{process.stdout.write('LOCKED\\n');
const ledger=JSON.parse(await readFile(new URL('ledger.json',dir),'utf8'));if(ledger.calls>=1)throw new Error('CALL_LIMIT');
while(true){try{await readFile(new URL('release',dir));break;}catch{await new Promise(r=>setTimeout(r,10));}}
ledger.calls++;await atomicEvaluationCheckpoint(new URL('ledger.json',dir),ledger);await writeFile(new URL('fake-dispatch',dir),'1');});process.stdout.write('DONE\\n');}
catch(error){process.stdout.write(error.message+'\\n');process.exitCode=2;}`;
function start(dir){const child=spawn(process.execPath,['--input-type=module','--eval',childCode,dir.href],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',bytes=>{output+=bytes;});const done=once(child,'exit').then(([code])=>({code,output}));return {child,done,get output(){return output;}};}
async function locked(run){for(let i=0;i<100;i++){if(run.output.includes('LOCKED'))return;await new Promise(r=>setTimeout(r,10));}throw new Error('CHILD_DID_NOT_LOCK');}
test('two concurrent resume processes cannot read/spend the same remaining call',async()=>{
 const path=await mkdtemp(tmpdir()+'/clear-eval-'),dir=pathToFileURL(path+'/');
 try{await writeFile(new URL('ledger.json',dir),JSON.stringify({calls:0}));const first=start(dir);await locked(first);const second=start(dir),blocked=await second.done;
 assert.equal(blocked.code,2);assert.match(blocked.output,/EVALUATION_BUSY_OR_RECOVERY_REQUIRED/);await writeFile(new URL('release',dir),'go');assert.equal((await first.done).code,0);
 assert.deepEqual(JSON.parse(await readFile(new URL('ledger.json',dir),'utf8')),{calls:1});assert.equal(await readFile(new URL('fake-dispatch',dir),'utf8'),'1');assert.ok(!(await readdir(dir)).includes('execution.lock'));
 }finally{await rm(path,{recursive:true,force:true});}
});
test('hard-killed runner cannot trigger automatic recovery or a new dispatch',async()=>{
 const path=await mkdtemp(tmpdir()+'/clear-eval-'),dir=pathToFileURL(path+'/');
 try{await writeFile(new URL('ledger.json',dir),JSON.stringify({calls:0}));const first=start(dir);await locked(first);first.child.kill('SIGKILL');await first.done;
 const blocked=await start(dir).done;assert.equal(blocked.code,2);assert.match(blocked.output,/RECOVERY_REQUIRED/);assert.ok(!(await readdir(dir)).includes('fake-dispatch'));
 // Explicit offline test recovery only, after child exit and ledger inspection.
 await unlink(new URL('execution.lock',dir));await writeFile(new URL('release',dir),'go');assert.equal((await start(dir).done).code,0);
 }finally{await rm(path,{recursive:true,force:true});}
});
test('failed atomic checkpoint prevents dispatch and leaves prior ledger complete',async()=>{
 const path=await mkdtemp(tmpdir()+'/clear-eval-'),dir=pathToFileURL(path+'/');let dispatched=false;
 try{await mkdir(new URL('blocked.json',dir));await assert.rejects(withEvaluationLease(dir,async()=>{await atomicEvaluationCheckpoint(new URL('blocked.json',dir),{calls:1});dispatched=true;}),/CHECKPOINT_FAILED/);
 assert.equal(dispatched,false);assert.ok(!(await readdir(dir)).some(name=>name==='execution.lock'||name.endsWith('.tmp')));
 await atomicEvaluationCheckpoint(new URL('ledger.json',dir),{calls:1});assert.deepEqual(JSON.parse(await readFile(new URL('ledger.json',dir),'utf8')),{calls:1});
 }finally{await rm(path,{recursive:true,force:true});}
});
