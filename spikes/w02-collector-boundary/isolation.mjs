import { fork } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, verify } from 'node:crypto';
const requireValue=(v,code)=>{if(!v)throw new Error(code);};
// Alternative chosen for the spike: inherited IPC, no listening collector HTTP port.
export class SyntheticSupervisor {
 #root;#active=new Map();#used=new Set();#publicKey;#origin;#clock;
 constructor(root,publicKey,{origin='https://clear.example.invalid',clock=Date.now}={}){this.#root=root;this.#publicKey=publicKey;this.#origin=origin;this.#clock=clock;}
 async start(instruction,signature,requestOrigin,port,ttlMs=30000) {
   const bytes=Buffer.from(instruction);requireValue(bytes.length<=2048,'INSTRUCTION');
   requireValue(verify(null,bytes,this.#publicKey,signature),'INSTRUCTION_SIGNATURE');
   let t;try{t=JSON.parse(instruction);}catch{throw new Error('INSTRUCTION');}
   requireValue(t && JSON.stringify(t)===instruction&&Object.keys(t).sort().join(',')==='applicationId,expiresAt,mode,nonce,origin,runtime','INSTRUCTION');
   requireValue(t.mode==='SYNTHETIC' && t.origin===this.#origin && requestOrigin===this.#origin && t.runtime==='W02B_SYNTHETIC_ONLY','SCOPE');
   requireValue(/^[0-9a-f-]{36}$/.test(t.applicationId)&&/^[0-9a-f-]{36}$/.test(t.nonce)&&Number.isSafeInteger(t.expiresAt)&&this.#clock()<t.expiresAt,'EXPIRED_OR_ID');
   requireValue(!this.#used.has(t.nonce)&&!this.#active.has(t.applicationId),'SESSION_CONFLICT');
   this.#used.add(t.nonce);this.#active.set(t.applicationId,null);
   const profile=join(this.#root,randomUUID());let child;
   try {
     await fs.mkdir(profile,{mode:0o700});
     // Synthetic stand-in for browser-owned files. No Chrome is launched by this spike.
     await fs.writeFile(join(profile,'synthetic-profile'), 'SYNTHETIC_PROFILE_CANARY',{mode:0o600});
     child=fork(new URL('./collector-worker.mjs',import.meta.url),[],{cwd:profile,execArgv:[],env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe','ipc']});
     let closedResolve;const closed=new Promise(r=>{closedResolve=r;});
     const messages=[],logs=[],waiters=[];
     child.stdout.on('data',b=>logs.push(b.toString()));child.stderr.on('data',b=>logs.push(b.toString()));
     child.on('message',m=>{messages.push(m);for(const waiter of [...waiters])if(waiter.status===m.status){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(m);}});
     const cleanup=async()=>{
       let cleaned=false;
       try {await fs.rm(profile,{recursive:true,force:true});cleaned=true;}
       finally {
         // Cleanup failures are observable; they must not be counted as deletion success.
         this.#active.delete(t.applicationId);
         for(const w of waiters){clearTimeout(w.timer);w.reject(new Error('WORKER_CLOSED'));}
         if(!cleaned)messages.push({status:'CLEANUP_FAILED'});
         closedResolve({cleaned});
       }
     };
     child.once('exit',()=>{cleanup().catch(()=>{});});
     const handle={child,profile,messages,logs,closed,send:m=>child.send(m),wait:status=>{
       const old=messages.find(m=>m.status===status);if(old)return Promise.resolve(old);
       return new Promise((resolve,reject)=>{const w={status,resolve,reject,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('WORKER_TIMEOUT'));},3000)};waiters.push(w);});
     }};
     this.#active.set(t.applicationId,handle);child.send({type:'start',mode:'SYNTHETIC',port,ttlMs:Math.min(ttlMs,t.expiresAt-this.#clock())});return handle;
   } catch(e){child?.kill();await fs.rm(profile,{recursive:true,force:true});this.#active.delete(t.applicationId);throw new Error('START_FAILED');}
 }
 async shutdown(){const handles=[...this.#active.values()].filter(Boolean);for(const h of handles)h.child.kill();await Promise.all(handles.map(h=>h.closed));}
}
// Filter before touching request headers/body. Cannot be called on arbitrary login traffic.
export function selectCapture(event,loggedIn) {
 if(!loggedIn)return false;
 const allowed={'https://example.invalid/registration':'POST','https://example.invalid/score':'GET'};
 return Object.hasOwn(allowed,event.url)&&allowed[event.url]===event.method;
}
