import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { SyntheticSupervisor,selectCapture } from '../isolation.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const origin='https://clear.example.invalid';
function ticket(overrides={}){const text=JSON.stringify({mode:'SYNTHETIC',applicationId:randomUUID(),nonce:randomUUID(),origin,runtime:'W02B_SYNTHETIC_ONLY',expiresAt:Date.now()+30000,...overrides});return {text,sig:sign(null,Buffer.from(text),privateKey)};}
async function fixture(t) {
 const root=await fs.mkdtemp(join(process.cwd(),'.fixture-w02b-'));await fs.chmod(root,0o700);
 let connections=0;const sockets=new Set(),requests=[];
 const server=net.createServer(s=>{const connectionId=++connections;sockets.add(s);s.on('close',()=>sockets.delete(s));let b='';s.on('data',chunk=>{b+=chunk;let i;while((i=b.indexOf('\n'))>=0){const data=JSON.parse(b.slice(0,i));b=b.slice(i+1);requests.push({connectionId,...data});s.write(JSON.stringify({connectionId})+'\n');}});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const sup=new SyntheticSupervisor(root,publicKey);
 t.after(async()=>{await sup.shutdown();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 return {root,sup,requests,sockets,port:server.address().port,connections:()=>connections};
}
async function start(f,tk=ticket(),options={}){const h=await f.sup.start(tk.text,tk.sig,origin,f.port,options.ttlMs);await h.wait('READY');return h;}
async function login(h){h.send({type:'login'});return h.wait('LOGGED_IN');}
test('two actual worker processes keep distinct owners cookies profiles and TCP clients',async t=>{
 const f=await fixture(t);const [a,b]=await Promise.all([start(f),start(f)]);
 assert.notEqual(a.child.pid,b.child.pid);assert.notEqual(a.messages[0].ownerPublicKey,b.messages[0].ownerPublicKey);assert.notEqual(a.profile,b.profile);
 const [al,bl]=await Promise.all([login(a),login(b)]);assert.notEqual(al.connectionId,bl.connectionId);
 a.send({type:'proof'});const ap=await a.wait('PARTIAL');a.send({type:'proof'});const ac=await a.wait('PAIR_READY_SYNTHETIC');
 assert.equal(al.connectionId,ap.connectionId);assert.equal(al.connectionId,ac.connectionId);assert.equal(ac.paymentAllowed,false);
 assert.equal(f.connections(),2);assert.equal(new Set(f.requests.filter(r=>r.connectionId===al.connectionId).map(r=>r.syntheticCookie)).size,1);
 assert.notEqual(f.requests.find(r=>r.connectionId===al.connectionId).syntheticCookie,f.requests.find(r=>r.connectionId===bl.connectionId).syntheticCookie);
 assert.equal((await fs.stat(a.profile)).mode&0o777,0o700);
 assert.deepEqual(a.logs,[]);assert.deepEqual(b.logs,[]);assert.ok(!JSON.stringify(a.messages).includes('syntheticCookie'));
});
test('disconnect after one proof invalidates session and never reconnects with old cookie',async t=>{
 const f=await fixture(t),tk=ticket(),h=await start(f,tk);await login(h);h.send({type:'proof'});await h.wait('PARTIAL');
 for(const s of f.sockets)s.destroy();await h.closed;
 assert.ok(h.messages.some(m=>m.status==='RETRY_REQUIRED'));assert.ok(!h.messages.some(m=>m.status==='PAIR_READY_SYNTHETIC'));
 assert.equal(f.connections(),1);assert.deepEqual(await fs.readdir(f.root),[]);
 await assert.rejects(()=>f.sup.start(tk.text,tk.sig,origin,f.port),/SESSION_CONFLICT/);
 const next=await start(f);assert.notEqual(next.messages[0].ownerPublicKey,h.messages[0].ownerPublicKey);await login(next);
 assert.notEqual(f.requests[0].syntheticCookie,f.requests.at(-1).syntheticCookie);
});
for(const [name,action,status] of [['cancel',h=>h.send({type:'cancel'}),'CANCELLED'],['finish',h=>h.send({type:'complete'}),'CLOSED'],['crash',h=>h.child.kill('SIGKILL'),null]])test(`profile cleanup on worker ${name}`,async t=>{
 const f=await fixture(t),h=await start(f);action(h);await h.closed;assert.deepEqual(await fs.readdir(f.root),[]);if(status)assert.ok(h.messages.some(m=>m.status===status));assert.deepEqual(h.logs,[]);
});
test('expiry ends the worker and deletes synthetic profile',async t=>{
 const f=await fixture(t),h=await start(f,ticket(),{ttlMs:150});await h.closed;assert.ok(h.messages.some(m=>m.status==='EXPIRED'));assert.deepEqual(await fs.readdir(f.root),[]);
});
for(const [name,change] of [['real mode',{mode:'REAL_YBM'}],['expired',{expiresAt:Date.now()-1}],['wrong runtime',{runtime:'PRODUCT'}],['wrong origin',{origin:'https://evil.invalid'}],['injected URL',{url:'https://exam.toeic.co.kr'}]])test(`signed instruction rejects ${name}`,async t=>{
 const f=await fixture(t),tk=ticket(change);await assert.rejects(()=>f.sup.start(tk.text,tk.sig,origin,f.port));assert.equal(f.connections(),0);assert.deepEqual(await fs.readdir(f.root),[]);
});
test('instruction signature and caller origin checked before starting a process',async t=>{
 const f=await fixture(t),tk=ticket();await assert.rejects(()=>f.sup.start(tk.text,Buffer.alloc(64),origin,f.port),/SIGNATURE/);
 await assert.rejects(()=>f.sup.start(tk.text,tk.sig,'https://evil.invalid',f.port),/SCOPE/);assert.equal(f.connections(),0);
});
test('parallel starts for one application reserve only one process',async t=>{
 const f=await fixture(t),id=randomUUID(),a=ticket({applicationId:id}),b=ticket({applicationId:id});
 const r=await Promise.allSettled([f.sup.start(a.text,a.sig,origin,f.port),f.sup.start(b.text,b.sig,origin,f.port)]);
 assert.equal(r.filter(v=>v.status==='fulfilled').length,1);await r.find(v=>v.status==='fulfilled').value.wait('READY');assert.equal(f.connections(),1);
});
test('proof command before login fails closed',async t=>{const f=await fixture(t),h=await start(f);h.send({type:'proof'});await h.closed;assert.ok(h.messages.some(m=>m.status==='REJECTED'));assert.equal(f.requests.length,0);});
test('early capture filter never touches login headers or body',()=>{
 const event={url:'https://example.invalid/login',method:'POST',get headers(){throw new Error('SECRET_READ');},get body(){throw new Error('SECRET_READ');}};
 assert.equal(selectCapture(event,false),false);assert.equal(selectCapture(event,true),false);
 for(const url of ['https://example.invalid/score?token=x','https://example.invalid.evil/score','http://example.invalid/score'])assert.equal(selectCapture({url,method:'GET'},true),false);
 assert.equal(selectCapture({url:'https://example.invalid/score',method:'GET'},true),true);
 assert.equal(selectCapture({url:'https://example.invalid/registration',method:'POST'},false),false);
});
test('loss of parent IPC ends child and supervisor observes cleanup',async t=>{
 const f=await fixture(t),h=await start(f);await login(h);h.child.disconnect();const result=await h.closed;assert.equal(result.cleaned,true);assert.deepEqual(await fs.readdir(f.root),[]);
});
