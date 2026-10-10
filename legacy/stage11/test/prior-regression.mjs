// Original runners are executed in a new copy; their fixed artifact destinations cannot touch history.
import {mkdtemp,cp,symlink,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const project=fileURLToPath(new URL('../../',import.meta.url)),out=await mkdtemp(join(project,'stage11/artifacts/prior-regression-')),dir=await mkdtemp(join(tmpdir(),'refund-stage11-prior-'));
const commands=['stage7/regression.mjs','stage7/compare.mjs','stage7/run-tests.mjs'],results=[];
try{
 for(const name of ['baseline','stage2','stage3','stage4','stage5','stage6','stage7'])await cp(join(project,name),join(dir,name),{recursive:true});
 await symlink(join(project,'node_modules'),join(dir,'node_modules'),'dir');
 for(const command of commands){
  const start=performance.now(),child=spawn(process.execPath,[command],{cwd:dir,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const exitCode=await new Promise(resolve=>child.once('exit',resolve));
  const safe=output.split('\n').filter(l=>/^(?:stage\d+:|[a-z-]+: central=|ok |not ok |# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) |TAP version)/.test(l));
  const row={command,exitCode,elapsedMs:performance.now()-start,summary:safe};results.push(row);console.log(JSON.stringify(row));
 }
 await cp(join(dir,'stage7/artifacts'),join(out,'stage7-artifacts'),{recursive:true});
 const prior=JSON.parse(await readFile(join(dir,'stage7/artifacts/regression-results.json'),'utf8')),comparison=JSON.parse(await readFile(join(dir,'stage7/artifacts/comparison-results.json'),'utf8'));
 await writeFile(join(out,'summary.json'),JSON.stringify({at:new Date().toISOString(),results,prior,comparisonSummary:comparison.summary,method:'Unmodified original stage7 runners in isolated temporary tree; dynamic ports; only owned children stopped.'},null,2)+'\n');
 console.log(JSON.stringify({out,priorPassed:prior.totalPassed,comparison:comparison.summary}));
 if(results.some(r=>r.exitCode!==0))process.exitCode=1;
}finally{await rm(dir,{recursive:true,force:true});}
