import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn,execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareRoot,createSession } from '../../src/mac-collector/storage.mjs';
import { recoveryStep,recoveryDiagnostic } from '../../src/mac-collector/recovery-diagnostics.mjs';
const worker=fileURLToPath(new URL('../../src/mac-collector/worker.mjs',import.meta.url));
const fixture=fileURLToPath(new URL('./fixtures/startup-fault.mjs',import.meta.url));
for(const code of ['ENOTEMPTY','EACCES','EPERM','SYNTHETIC_PRIVATE_CODE'])test(`recovery diagnostic ${code}: fixed stage/code only, no exception detail`,async t=>{
  const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-diagnostic-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.chmod(root,0o700);await prepareRoot(root,{synthetic:true});
  const child=spawn(process.execPath,['--import',fixture,worker],{env:{...process.env,CLEAR_TEST_ROOT:root,CLEAR_LOCKED:'1',CLEAR_FAULT:'recovery-'+code},stdio:['ignore','pipe','pipe']});
  let output='';for(const pipe of [child.stdout,child.stderr])pipe.on('data',b=>output+=b);
  const exit=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
  assert.equal(exit,1);
  assert.ok(output.includes('STALE_RECOVERY:'+(code==='SYNTHETIC_PRIVATE_CODE'?'UNEXPECTED_ERROR':code)),output);
  assert.doesNotMatch(output,/SYNTHETIC_PRIVATE|Error:|at file:/);
  assert.ok(!output.includes(root));
  assert.match(output,/"stage":"ROOT_LIST","resource":"ROOT_DIRECTORY_CHAIN","syscall":"scandir"/);
});
for(const [mode,stage,resource,syscall]of [
 ['stale-delete-EPERM','SESSION_DELETE','SESSION_TREE','rmdir'],
 ['stale-browser-metadata-EPERM','BROWSER_METADATA_READ','BROWSER_METADATA','open'],
 ['stale-owner-EPERM','OWNER_EXISTENCE_PROBE','OWNER_PROCESS','kill'],
])test(`${mode}: specific redacted provenance and failed recovery preserves session`,async t=>{
 const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-eperm-'));await fs.chmod(root,0o700);await prepareRoot(root,{synthetic:true});
 t.after(()=>fs.rm(root,{recursive:true,force:true}));const session=await createSession(root);
 if(mode==='stale-owner-EPERM')await fs.writeFile(join(session.path,'session.json'),JSON.stringify({ownerPid:2147483647}));
 const child=spawn(process.execPath,['--import',fixture,worker],{env:{...process.env,CLEAR_TEST_ROOT:root,CLEAR_LOCKED:'1',CLEAR_FAULT:mode},stdio:['ignore','pipe','pipe']});
 let output='';for(const pipe of [child.stdout,child.stderr])pipe.on('data',b=>output+=b);
 const code=await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
 assert.equal(code,1);assert.match(output,/STALE_RECOVERY:EPERM/);
 const diagnostic=output.split('\n').find(line=>line.startsWith('복구 진단: '));
 assert.deepEqual(JSON.parse(diagnostic.slice('복구 진단: '.length)),{stage,resource,syscall});
 assert.doesNotMatch(output,/SYNTHETIC_PRIVATE|Error:|at file:|2147483647/);assert.ok(!output.includes(root));
 assert.ok((await fs.stat(session.path)).isDirectory());
 assert.deepEqual((await fs.readdir(root)).filter(n=>n.startsWith('session-')),[session.path.split('/').at(-1)]);
});
test('diagnostics preserve first boundary and original error without trusting exception fields',async()=>{
 const error=Object.assign(new Error('SYNTHETIC_PRIVATE_MESSAGE'),{code:'EPERM',syscall:'unlink /SYNTHETIC_PRIVATE_PATH',stage:'PRIVATE_STAGE',resource:'PRIVATE_RESOURCE'});
 await assert.rejects(recoveryStep('BROWSER_RECOVER','BROWSER_GROUP',()=>recoveryStep('BROWSER_METADATA_READ','BROWSER_METADATA',()=>{throw error;})),e=>e===error);
 assert.deepEqual(recoveryDiagnostic(error),{stage:'BROWSER_METADATA_READ',resource:'BROWSER_METADATA',syscall:'UNREPORTED'});
 assert.equal(recoveryDiagnostic(new Error('OTHER')),null);
 assert.doesNotMatch(JSON.stringify(recoveryDiagnostic(error)),/PRIVATE/);
 const spawnError={syscall:'spawn /SYNTHETIC_PRIVATE_PATH'};
 await assert.rejects(recoveryStep('BROWSER_PROCESS_QUERY','PROCESS_TABLE',()=>{throw spawnError;}),e=>e===spawnError);
 assert.equal(recoveryDiagnostic(spawnError).syscall,'spawn');
 await assert.rejects(recoveryStep('PRIVATE_STAGE','PROCESS_TABLE',()=>assert.fail()),/INVALID_RECOVERY_DIAGNOSTIC/);
});
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
