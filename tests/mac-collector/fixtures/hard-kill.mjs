// Synthetic child process only. Not shipped in the package.
import {promises as fs,writeFileSync} from 'node:fs';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
const mode=process.env.CLEAR_KILL_PHASE,spawn=cp.spawn,open=fs.open.bind(fs);
cp.spawn=function(command,args,options){
 const isGate=command==='/bin/sh' && args[2]==='clear-chrome-gate';
 // Reproduce the old release's spawn-before-record behavior to verify recovery
 // for already orphaned browsers, rather than only preventing new orphans.
 if(isGate && mode==='legacy-missing') {command=args[3];args=args.slice(4);}
 const child=spawn(command,args,options);
 if(isGate){
  writeFileSync(join(process.env.CLEAR_TEST_ROOT,'test-browser-pid'),String(child.pid));
  if(mode==='after-release'){
   const end=child.stdin.end.bind(child.stdin);
   child.stdin.end=(...values)=>{const result=end(...values);setTimeout(()=>process.kill(process.pid,'SIGKILL'),25);return result;};
  }
 }
 return child;
};
syncBuiltinESMExports();
fs.open=async function(path,...args){
 if(String(path).endsWith('/browser.json') && mode!=='after-release'){
  if(mode==='empty-record')await open(path,...args);
  if(mode==='partial-record'){const file=await open(path,...args);await file.writeFile('{');}
  await new Promise(r=>setTimeout(r,25));process.kill(process.pid,'SIGKILL');await new Promise(()=>{});
 }
 return open(path,...args);
};
