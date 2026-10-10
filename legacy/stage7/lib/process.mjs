import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
export const sha = data => createHash('sha256').update(data).digest('hex');
export async function jsonFile(path, value) { await writeFile(path, JSON.stringify(value,null,2)+'\n',{mode:0o600}); }
export async function start(file, env={}) {
  const child=fork(file,[],{env:{...process.env,...env},stdio:['ignore','pipe','pipe','ipc']});
  const h={child,logs:'',messages:[],port:null};
  child.stdout.on('data',b=>h.logs+=b); child.stderr.on('data',b=>h.logs+=b);
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('START_TIMEOUT'));},30000);
    child.on('message',m=>{h.messages.push(m);if(m.type==='ready'){clearTimeout(timer);resolve(m)}if(m.type==='failed'){clearTimeout(timer);reject(new Error(m.code))}});
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('START_EXIT'));});
  });
  h.port=ready.port;h.ready=ready;return h;
}
export async function stop(h) {
  if(!h || h.child.exitCode!==null || h.child.signalCode!==null)return null;
  const exited=once(h.child,'exit'); h.child.kill('SIGTERM');
  const [code,signal]=await exited;
  return {pid:h.child.pid,exitCode:code,signal,port:h.port,reachableAfterExit:h.port?await reachable('http://127.0.0.1:'+h.port):null};
}
export async function reachable(url){try{await fetch(url,{signal:AbortSignal.timeout(1500)});return true}catch{return false}}
export async function treeHashes(root) {
  const result={};async function walk(dir,rel=''){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name),r=join(rel,e.name);if(e.isDirectory())await walk(p,r);else if(e.isFile())result[r]=sha(await readFile(p));}}await walk(root);return result;
}
export async function scanSecrets(dir,secrets,logs) {
  let files=0,matches=0;const needles=secrets.map(k=>k.toLowerCase().replace(/^0x/,''));
  function check(bytes){const s=bytes.toString().toLowerCase();for(const n of needles)if(s.includes(n))matches++;}
  async function walk(p){for(const e of await readdir(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())await walk(f);else if(e.isFile()){files++;check(await readFile(f));}}}
  await walk(dir);for(const log of logs)check(log);return {filesScanned:files,logStreamsScanned:logs.length,exactGeneratedSecretMatches:matches};
}
