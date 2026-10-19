// Deterministic legacy orphan fixture: owns only a fresh synthetic Chrome's CDP pipes.
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {check,registerSelf,registerChild,record,bounded} from './hardkill-supervisor.mjs';
const root=process.argv[2];check(root===process.env.CLEAR_TEST_ROOT,'TEST_ROOT_REQUIRED');
registerSelf(root,'HOLDER');
const {command,args,profile}=JSON.parse(readFileSync(join(root,'holder-config.json'),'utf8'));
const bornAt=Date.now(),child=spawn(command,args,{detached:true,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,TMPDIR:join(profile,'tmp')},stdio:['ignore','ignore','ignore','pipe','pipe']});
child.once('exit',()=>{child.stdio[3].destroy();child.stdio[4].destroy();process.exitCode=0;});
child.once('error',()=>{process.exitCode=1;});
try{
 await bounded(new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);}),2000,'CHROME_SPAWN_FAILED');
 registerChild(root,child,'CHROME',profile,{commands:[[command,...args].join(' ')],bornAt});
 let buffer=Buffer.alloc(0);
 const ready=new Promise((resolve,reject)=>{
  child.once('exit',()=>reject(new Error('CHROME_EXITED')));
  child.stdio[3].on('error',()=>reject(new Error('PIPE_FAILED')));child.stdio[4].on('error',()=>reject(new Error('PIPE_FAILED')));
  child.stdio[4].on('data',chunk=>{
   buffer=Buffer.concat([buffer,chunk]);if(buffer.length>65536){reject(new Error('CDP_LIMIT'));return;}
   for(let end;(end=buffer.indexOf(0))!==-1;){
    let value;try{value=JSON.parse(buffer.subarray(0,end));}catch{reject(new Error('CDP_INVALID'));return;}
    buffer=buffer.subarray(end+1);if(value.id===1){if(value.result)resolve();else reject(new Error('CDP_FAILED'));}
   }
  });
 });
 child.stdio[3].write(JSON.stringify({id:1,method:'Browser.getVersion'})+'\0');
 await bounded(ready,8000,'CHROME_NOT_READY');record(root,{type:'ORPHAN_READY'});
}catch{record(root,{type:'HOLDER_FAILED'});process.exitCode=1;child.stdio[3].destroy();child.stdio[4].destroy();}
