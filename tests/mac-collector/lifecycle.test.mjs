import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRoot,createSession } from '../../src/mac-collector/storage.mjs';
import { stopRecordedBrowser } from '../../src/mac-collector/chrome.mjs';
const launcher=fileURLToPath(new URL('../../src/mac-collector/launch.mjs',import.meta.url));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(t){const parent=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-lifecycle-'));await fs.chmod(parent,0o700);t.after(()=>fs.rm(parent,{recursive:true,force:true}));const root=join(parent,'app');await prepareRoot(root,{synthetic:true});return root;}
function run(root,args=[]){const child=spawn(process.execPath,[launcher,...args],{env:{...process.env,CLEAR_TEST_ROOT:root},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const exited=new Promise((resolve,reject)=>{child.once('close',(code,signal)=>resolve({code,signal,output}));child.once('error',reject);});return {child,exited};}
async function ready(root){for(let i=0;i<200;i++){try{return Number(await fs.readFile(join(root,'test-ready'),'utf8'));}catch{}await delay(25);}throw new Error('WORKER_TIMEOUT');}
async function sessions(root){return (await fs.readdir(root)).filter(n=>n.startsWith('session-'));}
test('real Chrome cookie round trip; profile deleted; output is summary only',async t=>{
 const root=await setup(t);const {exited}=run(root);const result=await exited;assert.equal(result.code,0,result.output);assert.match(result.output,/"httpOnlyCookieRoundTrip":true/);assert.deepEqual(await sessions(root),[]);assert.doesNotMatch(result.output,/clear_synthetic=/);
});
test('concurrent launcher cannot delete active session; SIGTERM removes it',async t=>{
 const root=await setup(t);const first=run(root,['--test-hold']);const pid=await ready(root);t.after(()=>{try{process.kill(pid,'SIGKILL');}catch{}});
 const second=await run(root).exited;assert.equal(second.code,75,second.output);assert.equal((await sessions(root)).length,1);
 first.child.kill('SIGTERM');await first.exited;
 for(let i=0;i<100&&(await sessions(root)).length;i++)await delay(25);
 assert.deepEqual(await sessions(root),[]);
});
// Exercise independent launches repeatedly; a single pass hid CI-only recovery races.
for(let trial=1;trial<=5;trial++)test(`SIGKILL leaves profile; next launcher stops owned Chrome and deletes old session first (${trial}/5)`,async t=>{
 const root=await setup(t);const first=run(root,['--test-browser-hold']);const pid=await ready(root);t.after(()=>{try{process.kill(pid,'SIGKILL');}catch{}});
 const [old]=await sessions(root);assert.ok(old);process.kill(pid,'SIGKILL');await first.exited;assert.ok(await fs.stat(join(root,old)));
 const second=await run(root).exited;assert.equal(second.code,0,second.output);assert.match(second.output,/"staleSessionsRemoved":1/);assert.deepEqual(await sessions(root),[]);
});
test('stale browser metadata cannot kill an unrelated live process',async t=>{
 const root=await setup(t);const s=await createSession(root);await fs.writeFile(join(s.path,'browser.json'),JSON.stringify({pid:Number((await import('node:child_process')).execFileSync('/bin/ps',['-p',String(process.pid),'-o','pgid='],{encoding:'utf8'}).trim())}));
 await assert.rejects(stopRecordedBrowser(s.path),/BROWSER_(EXECUTABLE|OWNER|PROFILE)_MISMATCH/);process.kill(process.pid,0);
});
