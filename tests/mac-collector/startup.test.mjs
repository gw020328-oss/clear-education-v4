import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn,execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRoot } from '../../src/mac-collector/storage.mjs';
const worker=fileURLToPath(new URL('../../src/mac-collector/worker.mjs',import.meta.url));
const fixture=fileURLToPath(new URL('./fixtures/startup-fault.mjs',import.meta.url));
for(const mode of ['init-signal','init-error','browser-signal','browser-error'])test(`${mode}: cleanup waits for startup; no recreated profile or live browser group`,{skip:mode.startsWith('browser')&&process.platform!=='darwin',timeout:30000},async t=>{
  const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-startup-'));await fs.chmod(root,0o700);await prepareRoot(root,{synthetic:true});
  const child=spawn(process.execPath,['--import',fixture,worker,'--test-browser-hold'],{env:{...process.env,CLEAR_TEST_ROOT:root,CLEAR_LOCKED:'1',CLEAR_FAULT:mode},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  t.after(async()=>{child.kill('SIGKILL');await fs.rm(root,{recursive:true,force:true});});
  const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
  assert.equal(code,mode.endsWith('signal')?0:1,output);
  // Allow delayed browser startup to expose a profile recreated after deletion.
  await new Promise(r=>setTimeout(r,750));
  assert.deepEqual((await fs.readdir(root)).filter(n=>n.startsWith('session-')),[]);
  if(mode.startsWith('browser')){
    const pid=(await fs.readFile(join(root,'browser-pid'),'utf8')).trim();
    let states='';try{states=execFileSync('/bin/ps',['-g',pid,'-o','stat='],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(e){assert.equal(e.status,1);}
    assert.ok(states.trim().split('\n').filter(Boolean).every(s=>s.trim().startsWith('Z')),'browser group still live');
  }
});
