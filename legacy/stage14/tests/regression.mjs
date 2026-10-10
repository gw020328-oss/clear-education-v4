import fs from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {root,project,save} from '../lib/io.mjs';
const dir=fs.mkdtempSync(resolve(root,'.runtime/regression-')),out='artifacts/regression-'+Date.now(),results=[];
for(const name of ['stage6','stage10','stage11'])fs.cpSync(resolve(project,name),resolve(dir,name),{recursive:true,filter:p=>!p.split('/').includes('artifacts')});
for(const name of ['stage6','stage11'])fs.mkdirSync(resolve(dir,name,'artifacts'),{recursive:true});fs.symlinkSync(resolve(project,'node_modules'),resolve(dir,'node_modules'),'dir');
for(const [name,args] of [['stage6',['--test','--test-reporter=tap','stage6/test/security-regression.test.mjs','stage6/test/recovery-and-server.test.mjs']],['stage11-binding',['stage11/test/binding.mjs']]]){
 const child=spawn(process.execPath,args,{cwd:dir,env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);const exitCode=await new Promise(r=>child.once('exit',r));save(out+'/'+name+'.stdout.txt',stdout);save(out+'/'+name+'.stderr.txt',stderr);results.push({suite:name,exitCode,isolated:true});console.log(JSON.stringify(results.at(-1)));
}
const binding=fs.readdirSync(resolve(dir,'stage11/artifacts')).find(f=>f.startsWith('binding-'));if(binding)save(out+'/binding-results.json',JSON.parse(fs.readFileSync(resolve(dir,'stage11/artifacts',binding,'results.json'))));save(out+'/result.json',{at:new Date().toISOString(),results,method:'Unmodified stage6 and stage11 source in stage14/.runtime isolated copy. No AI calls. Suites reported separately.'});console.log(JSON.stringify({out,results}));process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
