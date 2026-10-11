import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {prepareRoot} from '../../src/mac-collector/storage.mjs';
import {stopRecordedBrowser} from '../../src/mac-collector/chrome.mjs';
import {parseProcesses,usesProfile,chromePath} from '../../src/mac-collector/browser-recovery.mjs';
const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
const worker=fileURLToPath(new URL('../../src/mac-collector/worker.mjs',import.meta.url));
const launcher=fileURLToPath(new URL('../../src/mac-collector/launch.mjs',import.meta.url));
const fixture=fileURLToPath(new URL('./fixtures/hard-kill.mjs',import.meta.url));
for(const phase of ['before-record','empty-record','partial-record','after-release','legacy-missing'])test(`SIGKILL ${phase}: next launch closes browser before deleting old session`,{skip:process.platform!=='darwin',timeout:60000},async t=>{
 // Repeat the legacy race five times: ordinary single-run tests hid this bug.
 for(let trial=0;trial<(phase==='legacy-missing'?5:1);trial++){
  const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-hard-kill-'));await fs.chmod(root,0o700);await prepareRoot(root,{synthetic:true});
  const c=spawn(process.execPath,['--import',fixture,worker,'--test-browser-hold'],{env:{...process.env,CLEAR_LOCKED:'1',CLEAR_TEST_ROOT:root,CLEAR_KILL_PHASE:phase},stdio:'ignore'});
  const cleanup=async()=>{
   c.kill('SIGKILL');
   for(const name of await fs.readdir(root))if(name.startsWith('session-'))await stopRecordedBrowser(join(root,name));
   await fs.rm(root,{recursive:true,force:true});
  };
  t.after(async()=>{try{await fs.stat(root);await cleanup();}catch(e){if(e.code!=='ENOENT')throw e;}});
  const first=await new Promise(r=>c.once('exit',(code,signal)=>r({code,signal})));assert.equal(first.signal,'SIGKILL');
  const names=(await fs.readdir(root)).filter(n=>n.startsWith('session-'));assert.equal(names.length,1);
  const oldPath=join(root,names[0]);const record=await fs.readFile(join(oldPath,'browser.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(['before-record','legacy-missing'].includes(phase))assert.equal(record,null);
  if(phase==='empty-record')assert.equal(record,'');
  if(phase==='partial-record')assert.equal(record,'{');
  if(phase==='after-release')assert.ok(JSON.parse(record).pid>1);
  if(['before-record','empty-record','partial-record'].includes(phase)){
   const pending=parseProcesses((await exec('/bin/ps',['-axww','-o','pid=,pgid=,uid=,stat=,command='])).stdout);
   assert.deepEqual(pending.filter(p=>usesProfile(p.command,oldPath)&&p.command.startsWith(chromePath+' ')),[],'Chrome executed before the record was complete');
  }
  const result=await exec(process.execPath,[launcher],{env:{...process.env,CLEAR_TEST_ROOT:root},timeout:20000});
  assert.match(result.stdout,/"staleSessionsRemoved":1/);assert.match(result.stdout,/"profilesDeleted":true/);
  await delay(1000);assert.deepEqual((await fs.readdir(root)).filter(n=>n.startsWith('session-')),[]);
  const all=parseProcesses((await exec('/bin/ps',['-axww','-o','pid=,pgid=,uid=,stat=,command='])).stdout);
  assert.deepEqual(all.filter(p=>usesProfile(p.command,oldPath)),[]);
  await cleanup();
 }
});
