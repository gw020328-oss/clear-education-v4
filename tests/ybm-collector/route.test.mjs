import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {createRoute, allowedHost} from '../../src/ybm-collector/route.mjs';
import {FakeClient} from './fake-client.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for(let i=0;i<100;i++){if(check())return;await delay(10);}throw new Error('TEST_TIMEOUT'); }
async function setup(t, options={}) {
  const client = new FakeClient();
  const route = await createRoute({client,...options});
  t.after(() => route.close());
  return {client,route};
}
function connect(route, path='exam.toeic.co.kr:443', headers={}) {
  const u = new URL(route.proxyUrl);
  return new Promise((resolve,reject)=>{
    const req=http.request({host:u.hostname,port:u.port,method:'CONNECT',path,headers});
    req.on('error',reject);req.on('connect',(res,socket,head)=>resolve({status:res.statusCode,socket,head}));req.end();
  });
}

test('same dedicated client forwards binary TLS bytes in both directions and disconnects the tunnel',async t=>{
  const {client,route}=await setup(t);const {socket,status}=await connect(route);t.after(()=>socket.destroy());
  assert.equal(status,200);assert.equal(route.client,client);
  const id=client.calls[0].value.id;assert.equal(client.calls[0].value.host,'exam.toeic.co.kr');
  const bytes=Buffer.from([22,3,3,0,4,1,2,3,4]);socket.write(bytes);await until(()=>client.sent.length);
  assert.deepEqual(Buffer.from(client.sent[0].tunnelMessage.message),bytes);
  const response=once(socket,'data');client.emit('tunnel-message',{tunnelId:id,message:bytes});assert.deepEqual((await response)[0],bytes);
  socket.destroy();await until(()=>client.calls.some(c=>c.type==='disconnectTunnel'));assert.equal(route.summary().active,0);
});
for(const target of ['evil.example:443','toeic.co.kr.evil.example:443','127.0.0.1:443','exam.toeic.co.kr:80','exam.toeic.co.kr.:443','user@exam.toeic.co.kr:443','exam.toeic.co.kr:443/path','exam.toeic.co.kr:0443']) {
  test('CONNECT refuses '+target,async t=>{const {client,route}=await setup(t);const c=await connect(route,target);c.socket.destroy();assert.equal(c.status,403);assert.equal(client.calls.length,0);});
}
test('origin-bearing CONNECT and ordinary HTTP cannot access the gateway',async t=>{
  const {client,route}=await setup(t);const c=await connect(route,undefined,{Origin:'https://evil.example'});c.socket.destroy();assert.equal(c.status,403);
  const status=await new Promise(resolve=>http.get(route.proxyUrl,res=>{res.resume();resolve(res.statusCode);}));assert.equal(status,403);assert.equal(client.calls.length,0);
});
test('allowlist is restricted to YBM domain boundaries',()=>{
  for(const host of ['exam.toeic.co.kr','member.ybmnet.co.kr','www.ybm.co.kr'])assert.ok(allowedHost(host));
  for(const host of ['evilybm.co.kr','ybm.co.kr.evil','localhost','www.cloudflare.com'])assert.equal(allowedHost(host),false);
});
test('parallel tunnel messages never cross between connections',async t=>{
  const {client,route}=await setup(t);const a=await connect(route),b=await connect(route);t.after(()=>{a.socket.destroy();b.socket.destroy();});
  const [ai,bi]=client.calls.filter(c=>c.type==='createTunnel').map(c=>c.value.id);assert.notEqual(ai,bi);
  const ar=once(a.socket,'data'),br=once(b.socket,'data');
  client.emit('tunnel-message',{tunnelId:bi,message:Buffer.from('B')});client.emit('tunnel-message',{tunnelId:ai,message:Buffer.from('A')});
  assert.equal((await ar)[0].toString(),'A');assert.equal((await br)[0].toString(),'B');
});
test('limit rejects an additional connection without making another attestor tunnel',async t=>{
  const {client,route}=await setup(t,{maxTunnels:1});const a=await connect(route);t.after(()=>a.socket.destroy());const b=await connect(route);b.socket.destroy();assert.equal(b.status,403);assert.equal(client.calls.length,1);
});
test('lost attestor closes local sockets, marks session non-reusable and never reconnects',async t=>{
  const {client,route}=await setup(t);const {socket}=await connect(route);socket.resume();const ended=once(socket,'close');client.disconnect();await ended;
  assert.ok(route.signal.aborted);assert.equal(route.summary().active,0);
  await assert.rejects(connect(route));assert.equal(client.calls.filter(c=>c.type==='createTunnel').length,1);
});
test('oversized downstream payload closes only its tunnel',async t=>{
  const {client,route}=await setup(t);const {socket}=await connect(route);socket.resume();const ended=once(socket,'close');
  client.emit('tunnel-message',{tunnelId:client.calls[0].value.id,message:Buffer.alloc(2*1024*1024+1)});await ended;assert.equal(route.summary().active,0);
});
test('cancellation during createTunnel cannot leave a late live tunnel',async t=>{
  const controller=new AbortController();const client=new FakeClient();let finish,started;
  const entered=new Promise(resolve=>{started=resolve;});
  client.rpc=async(type,value)=>{client.calls.push({type,value});if(type==='createTunnel'){started();await new Promise(resolve=>{finish=resolve;});}return {};};
  const route=await createRoute({client,signal:controller.signal});t.after(()=>route.close());
  const attempt=connect(route).catch(()=>null);await entered;controller.abort();finish();await attempt;
  await until(()=>client.calls.some(c=>c.type==='disconnectTunnel'));assert.equal(route.summary().active,0);
});
test('pipelined CONNECT head is forwarded once, without loss',async t=>{
  const {client,route}=await setup(t);const u=new URL(route.proxyUrl);const socket=net.connect(Number(u.port),'127.0.0.1');t.after(()=>socket.destroy());await once(socket,'connect');
  socket.write('CONNECT exam.toeic.co.kr:443 HTTP/1.1\r\nHost: exam.toeic.co.kr:443\r\n\r\nsynthetic-head');
  await until(()=>client.sent.length);assert.equal(Buffer.from(client.sent[0].tunnelMessage.message).toString(),'synthetic-head');assert.equal(client.sent.length,1);
});
test('abort before listen leaves no SDK listeners or server',async()=>{
  const controller=new AbortController();controller.abort();const client=new FakeClient();await assert.rejects(createRoute({client,signal:controller.signal}));assert.equal(client.events.eventNames().length,0);
});
test('closing removes listeners and is idempotent',async()=>{
  const client=new FakeClient();const route=await createRoute({client});await route.close();await route.close();assert.equal(client.events.eventNames().length,0);
});
