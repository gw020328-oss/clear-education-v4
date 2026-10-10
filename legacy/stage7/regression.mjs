import { mkdtemp,cp,symlink,readdir,readFile,rm,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { jsonFile,sha,treeHashes } from './lib/process.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),out=join(project,'stage7/artifacts');
await mkdir(out,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'refund-stage7-regression-')),before={};
for(const name of ['stage2','stage3','stage4','stage5','stage6'])before[name]=await treeHashes(join(project,name));
const results=[];
try{
  for(const name of ['baseline','stage2','stage3','stage4','stage6'])await cp(join(project,name),join(dir,name),{recursive:true});
  await symlink(join(project,'node_modules'),join(dir,'node_modules'),'dir');
  for(const [stage,expected] of [['stage2',60],['stage3',3],['stage4',6],['stage6',11]]){
    const args=stage==='stage4'?[join(dir,'stage6/test/run-stage4-isolated.mjs')]:['--test','--test-reporter=tap','--test-concurrency=1',...(await readdir(join(dir,stage,'test'))).filter(n=>n.endsWith('.test.mjs')).map(n=>join(dir,stage,'test',n))];
    const start=Date.now(),child=spawn(process.execPath,args,{cwd:join(dir,stage),stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
    const exitCode=await new Promise(resolve=>child.once('exit',resolve));
    const pass=Number(output.match(/^# pass (\d+)$/m)?.[1]??0),fail=Number(output.match(/^# fail (\d+)$/m)?.[1]??-1);
    // Prior tests create their own ephemeral keys; never persist arbitrary test stdout.
    // TAP assertion labels/counts and errors without data fields are sufficient here.
    const safe=output.split('\n').filter(s=>/^(?:ok |not ok |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) |TAP version)/.test(s));
    const result={stage,expected,pass,fail,exitCode,elapsedMs:Date.now()-start,passed:exitCode===0&&pass===expected&&fail===0,tapSummary:safe};results.push(result);
    await jsonFile(join(out,'regression-'+stage+'.json'),result);console.log(stage+': '+pass+'/'+expected+' fail='+fail+' exit='+exitCode);
    if(exitCode!==0)console.log(output.replace(/0x[0-9a-fA-F]{64}/g,'[redacted hex32]').slice(-7000));
  }
}finally{await rm(dir,{recursive:true,force:true});}
const preservation={};for(const stage of Object.keys(before))preservation[stage]=JSON.stringify(before[stage])===JSON.stringify(await treeHashes(join(project,stage)));
await jsonFile(join(out,'regression-results.json'),{results,totalPassed:results.reduce((n,r)=>n+r.pass,0),expected:80,preservation,sourceModified:Object.values(preservation).some(v=>!v),method:'Isolated temporary copies; stage4 uses existing isolated configurable-port runner. Original tests and assertions unchanged.'});
if(results.some(r=>!r.passed)||Object.values(preservation).some(v=>!v))process.exitCode=1;
