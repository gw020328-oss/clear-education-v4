import { fork } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

export async function freePort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export function start(file,env={}){
  const child=fork(new URL(file,import.meta.url),[],{env:{...process.env,...env},stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SERVICE_TIMEOUT')),30000);child.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve(m)}else if(m.type==='failed'){clearTimeout(timer);reject(new Error(m.code))}});child.once('exit',code=>{if(code&&code!==0){clearTimeout(timer);reject(new Error(`SERVICE_EXIT_${code}:${output.slice(-500)}`))}})});
  return {child,ready,get output(){return output}};
}
export async function stop(handle){if(!handle?.child||handle.child.exitCode!==null)return;handle.child.kill('SIGTERM');await Promise.race([once(handle.child,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);if(handle.child.exitCode===null){handle.child.kill('SIGKILL');await once(handle.child,'exit');}}
export async function run(file,env={}){
  const child=fork(new URL(file,import.meta.url),[],{env:{...process.env,...env},stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const message=new Promise(resolve=>child.on('message',resolve));const [value]=await Promise.all([message,once(child,'exit')]);if(value.type!=='complete')throw new Error(`${value.code}:${output.slice(-500)}`);return value.result;
}
