import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {installBoundedSender,boundedSendFailure,boundedSendDetails,TRANSPORT_SEND_LIMIT,PROOF_SEND_LIMIT,PROOF_RETAINED_LIMIT,MAX_PENDING_SENDS} from '../../src/ybm-collector/socket.mjs';
import {withSendContext} from '../../src/ybm-collector/send-context.mjs';

const MiB=1024*1024,large=Buffer.alloc(PROOF_SEND_LIMIT+1);
class Socket extends EventTarget{
 readyState=1;bufferedAmount=0;sent=[];callbacks=[];terminated=0;automatic=false;
 send(bytes,callback){this.sent.push(bytes.length);this.callbacks.push(callback);if(this.automatic)callback();}
 terminate(){this.terminated++;this.readyState=3;this.dispatchEvent(new Event('close'));}
}
const make=(options={})=>installBoundedSender(new Socket(),{proofMode:true,...options});
const code=expected=>error=>boundedSendFailure(error)===expected;
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function timer(t){
 let now=100;t.mock.method(performance,'now',()=>now);t.mock.timers.enable({apis:['setTimeout']});
 return async ms=>{now+=ms;t.mock.timers.tick(ms);await flush();};
}

test('message limits are exact whole-payload bounds, separate from queue capacity',async()=>{
 assert.equal(PROOF_SEND_LIMIT,100*MiB);assert.equal(PROOF_RETAINED_LIMIT,132*MiB);
 for(const proofMode of [false,true])for(const delta of [-1,0,1]){
  const limit=proofMode?PROOF_SEND_LIMIT:TRANSPORT_SEND_LIMIT,s=make({proofMode});s.automatic=true;
  const p=s.sendPromise(large.subarray(0,limit+delta));
  if(delta<=0){await p;assert.deepEqual(s.sent,[limit+delta]);s.terminate();}
  else{await assert.rejects(p,code('ATTESTOR_MESSAGE_LIMIT'));assert.equal(s.sent.length,0);assert.equal(s.terminated,1);}
 }
});

test('a non-empty ws queue drains before sending without adding another frame',async t=>{
 const tick=timer(t),s=make();s.automatic=true;s.bufferedAmount=32*MiB;
 const observed=[],p=withSendContext({observe:(state,error,details)=>observed.push({state,details})},()=>s.sendPromise(large.subarray(0,40*MiB)));
 assert.equal(s.sent.length,0);await tick(100);assert.equal(s.sent.length,0);
 s.bufferedAmount=0;await tick(10);await p;
 assert.deepEqual(s.sent,[40*MiB]);assert.equal(observed[0].details.socketQueuedBytes,32*MiB);
 assert.equal(observed.find(e=>e.state==='STARTED').details.socketQueuedBytes,0);
 assert.equal(observed.at(-1).details.waitMs,110);s.terminate();
});

test('callback completion serializes FIFO and a large proof can wait behind a small send',async()=>{
 const s=make(),a=s.sendPromise(Buffer.alloc(7)),b=s.sendPromise(large.subarray(0,PROOF_SEND_LIMIT)),c=s.sendPromise(Buffer.alloc(9));
 assert.deepEqual(s.sent,[7]);s.callbacks[0]();await a;await flush();assert.deepEqual(s.sent,[7,PROOF_SEND_LIMIT]);
 s.callbacks[1]();await b;await flush();assert.deepEqual(s.sent,[7,PROOF_SEND_LIMIT,9]);s.callbacks[2]();await c;
 s.automatic=true;await s.sendPromise(large.subarray(0,PROOF_SEND_LIMIT));assert.equal(s.terminated,0);s.terminate();
});

test('callback alone does not bypass a still non-empty socket queue',async t=>{
 const tick=timer(t),s=make(),a=s.sendPromise(Buffer.alloc(1)),b=s.sendPromise(Buffer.alloc(2));
 s.bufferedAmount=8;s.callbacks[0]();await a;await flush();assert.deepEqual(s.sent,[1]);
 await tick(10);assert.deepEqual(s.sent,[1]);s.bufferedAmount=0;await tick(10);assert.deepEqual(s.sent,[1,2]);s.callbacks[1]();await b;s.terminate();
});

test('active plus waiting bytes enforce exact aggregate bounds and settle every affected call',async()=>{
 for(const delta of [-1,0,1]){
  const s=make(),a=s.sendPromise(large.subarray(0,PROOF_SEND_LIMIT)),aResult=a.catch(e=>e);
  const b=s.sendPromise(large.subarray(0,32*MiB+delta));
  if(delta<=0){s.callbacks[0]();await a;await flush();s.callbacks[1]();await b;assert.equal(s.terminated,0);s.terminate();}
  else{
   const error=await b.catch(e=>e);assert.equal(boundedSendFailure(error),'ATTESTOR_QUEUE_LIMIT');
   assert.equal(boundedSendDetails(error).frameBytes,32*MiB+1);assert.equal(boundedSendDetails(error).retainedBytes,PROOF_SEND_LIMIT);
   assert.equal(boundedSendFailure(await aResult),'ATTESTOR_SEND_CLOSED');assert.deepEqual(s.sent,[PROOF_SEND_LIMIT]);assert.equal(s.terminated,1);
   const closed=await s.sendPromise(Buffer.alloc(1)).catch(e=>e);assert.equal(boundedSendDetails(closed).retainedBytes,0);assert.equal(boundedSendDetails(closed).pendingCount,0);
  }
 }
 const s=make(),first=s.sendPromise(large.subarray(0,70*MiB)).catch(e=>e);
 await assert.rejects(s.sendPromise(large.subarray(0,70*MiB)),code('ATTESTOR_QUEUE_LIMIT'));await first;
});

test('zero-byte pending messages cannot evade the finite count cap',async()=>{
 const s=make(),pending=[];
 for(let i=0;i<MAX_PENDING_SENDS;i++)pending.push(s.sendPromise(Buffer.alloc(0)).catch(e=>e));
 assert.equal(s.sent.length,1);await assert.rejects(s.sendPromise(Buffer.alloc(0)),code('ATTESTOR_QUEUE_LIMIT'));
 assert.equal((await Promise.all(pending)).every(e=>boundedSendFailure(e)==='ATTESTOR_SEND_CLOSED'),true);assert.equal(s.terminated,1);
});

test('general transport retains its 2MiB aggregate budget',async()=>{
 const s=make({proofMode:false}),pending=s.sendPromise(large.subarray(0,TRANSPORT_SEND_LIMIT)).catch(e=>e);
 await assert.rejects(s.sendPromise(Buffer.alloc(1)),code('ATTESTOR_QUEUE_LIMIT'));await pending;
});

test('queue wait and actual write share the original finite send deadline',async t=>{
 const tick=timer(t),s=make();s.bufferedAmount=1;
 const p=s.sendPromise(Buffer.alloc(1)),failure=assert.rejects(p,code('ATTESTOR_SEND_TIMEOUT'));
 await tick(50000);assert.equal(s.sent.length,0);s.bufferedAmount=0;await tick(10);assert.equal(s.sent.length,1);
 await tick(9990);await failure;assert.equal(s.terminated,1);s.callbacks[0]();await tick(90000);assert.equal(s.terminated,1);
});

test('queue timeout is distinct and never sends after the deadline',async t=>{
 const tick=timer(t),s=make();s.bufferedAmount=1;
 const p=assert.rejects(s.sendPromise(Buffer.alloc(1)),code('ATTESTOR_QUEUE_TIMEOUT'));
 await tick(60000);await p;s.bufferedAmount=0;await tick(10);assert.equal(s.sent.length,0);assert.equal(s.terminated,0);s.terminate();
});

test('RPC deadline is captured per entry, including a short control RPC behind a proof',async t=>{
 const tick=timer(t),s=make(),observations=[];
 const a=withSendContext({deadline:90100,observe:(state)=>observations.push('claim:'+state)},()=>s.sendPromise(Buffer.alloc(1))).catch(e=>e);
 const b=withSendContext({deadline:5100,observe:(state)=>observations.push('control:'+state)},()=>s.sendPromise(Buffer.alloc(2))).catch(e=>e);
 await tick(5000);assert.equal(boundedSendFailure(await b),'ATTESTOR_QUEUE_TIMEOUT');assert.equal(s.terminated,0);s.callbacks[0]();await a;
 assert.deepEqual(s.sent,[1]);assert.equal(observations.includes('control:STARTED'),false);assert.equal(observations.includes('claim:STARTED'),true);s.terminate();
});

test('next FIFO callback keeps the queued entry observer and deadline',async t=>{
 const tick=timer(t),s=make(),observations=[];
 const a=withSendContext({deadline:5100,observe:state=>observations.push('A:'+state)},()=>s.sendPromise(Buffer.alloc(1)));
 const b=withSendContext({deadline:25100,observe:state=>observations.push('B:'+state)},()=>s.sendPromise(Buffer.alloc(2)));
 s.callbacks[0]();await a;await flush();await tick(6000);assert.equal(s.terminated,0);
 s.callbacks[1]();await b;assert.equal(observations.filter(x=>x==='B:STARTED').length,1);s.terminate();
});

for(const during of ['write','drain'])for(const event of ['close','error','abort'])test(`${event} during ${during} settles all sends and cleans listeners/timers`,async t=>{
 const tick=timer(t),controller=new AbortController(),s=make({signal:controller.signal});
 if(during==='drain')s.bufferedAmount=1;
 const a=s.sendPromise(Buffer.alloc(1)).catch(e=>e),b=s.sendPromise(Buffer.alloc(2)).catch(e=>e);
 if(event==='abort')controller.abort('SYNTHETIC_PRIVATE');else {if(event==='close')s.readyState=3;s.dispatchEvent(new Event(event));}
 const expected=event==='abort'?'ATTESTOR_SEND_ABORTED':event==='error'?'ATTESTOR_SEND_FAILED':'ATTESTOR_SEND_CLOSED';
 assert.equal(boundedSendFailure(await a),expected);assert.equal(boundedSendFailure(await b),event==='abort'?expected:'ATTESTOR_SEND_CLOSED');
 assert.equal(getEventListeners(controller.signal,'abort').length,0);assert.equal(getEventListeners(s,'close').length,0);assert.equal(getEventListeners(s,'error').length,0);
 const n=s.sent.length,stops=s.terminated;for(const cb of s.callbacks){cb();cb(Error('PRIVATE'));}await tick(90000);assert.equal(s.sent.length,n);assert.equal(s.terminated,stops);
 const e=await s.sendPromise(Buffer.alloc(1)).catch(e=>e);assert.equal(boundedSendDetails(e).retainedBytes,0);assert.equal(boundedSendDetails(e).pendingCount,0);
});

test('pre-aborted signals never send, and send/termination throws preserve owned failures',async t=>{
 const tick=timer(t),controller=new AbortController();controller.abort('PRIVATE');const aborted=make({signal:controller.signal});
 await assert.rejects(aborted.sendPromise(Buffer.alloc(1)),code('ATTESTOR_SEND_ABORTED'));assert.equal(aborted.sent.length,0);
 for(const kind of ['throw','callback']){
  const s=make();s.send=(_b,cb)=>{if(kind==='throw')throw Error('PRIVATE');cb(Error('PRIVATE'));};s.terminate=()=>{s.terminated++;throw Error('PRIVATE_TERMINATION');};
  const error=await s.sendPromise(Buffer.alloc(1)).catch(e=>e);assert.equal(boundedSendFailure(error),'ATTESTOR_SEND_FAILED');assert.equal(error.message,'ATTESTOR_SEND_FAILED');
  assert.equal(Object.hasOwn(error,'cause'),false);await tick(90000);assert.equal(s.terminated,1);
 }
});

test('observer failure cannot change outcome or postpone a send beyond its RPC deadline',async t=>{
 const tick=timer(t),s=make();s.automatic=true;
 await withSendContext({observe(){throw Error('PRIVATE');}},()=>s.sendPromise(Buffer.alloc(1)));assert.equal(s.sent.length,1);s.terminate();
 const other=make(),pending=withSendContext({deadline:performance.now()+5,observe(state){if(state==='STARTED')t.mock.timers.tick(5);}},()=>other.sendPromise(Buffer.alloc(1))).catch(e=>e);
 assert.equal(boundedSendFailure(await pending),'ATTESTOR_QUEUE_TIMEOUT');assert.equal(other.sent.length,0);await tick(10000);assert.equal(other.terminated,0);other.terminate();
});

test('only exact owned errors expose safe fixed transport details, never getters or payloads',async()=>{
 const s=make();s.send=()=>{throw Error('PRIVATE');};const error=await s.sendPromise(Buffer.alloc(1)).catch(e=>e);
 let reads=0;for(const forged of [Error('ATTESTOR_SEND_FAILED'),Object.create(error),new Proxy(error,{}),{get code(){reads++;throw Error('PRIVATE');}},null,undefined,7]){
  assert.equal(boundedSendFailure(forged),null);assert.equal(boundedSendDetails(forged),null);
 }
 Object.defineProperty(error,'message',{get(){reads++;throw Error('PRIVATE');}});assert.equal(boundedSendFailure(error),'ATTESTOR_SEND_FAILED');assert.equal(reads,0);
 const d=boundedSendDetails(error);assert.equal(Object.isFrozen(d),true);assert.equal(JSON.stringify(d).includes('PRIVATE'),false);assert.equal(d.frameBytes,1);
});

test('drain observation cancellation leaves no newly armed poll timer',async t=>{
 timer(t);const original=setTimeout;let created=0;t.mock.method(globalThis,'setTimeout',(...args)=>{created++;return original(...args);});
 const controller=new AbortController(),s=make({signal:controller.signal});s.bufferedAmount=1;
 const p=withSendContext({observe(_state,_error,d){if(d.phase==='DRAIN_WAIT')controller.abort();}},()=>s.sendPromise(Buffer.alloc(1)));
 await assert.rejects(p,code('ATTESTOR_SEND_ABORTED'));assert.equal(created,1);assert.equal(s.sent.length,0);
});

test('claim observation preserves a different RPC send that terminated the shared socket',async()=>{
 const s=make(),events=[],pending=[];
 pending.push(withSendContext({observe:(state,error,d)=>events.push({state,code:boundedSendFailure(error),d})},()=>s.sendPromise(Buffer.alloc(1))).catch(e=>e));
 for(let i=1;i<MAX_PENDING_SENDS;i++)pending.push(s.sendPromise(Buffer.alloc(1)).catch(e=>e));
 await assert.rejects(s.sendPromise(Buffer.alloc(1)),code('ATTESTOR_QUEUE_LIMIT'));await Promise.all(pending);
 const failed=events.find(e=>e.state==='FAILED');assert.equal(failed.code,'ATTESTOR_SEND_CLOSED');assert.equal(failed.d.terminalReason,'ATTESTOR_QUEUE_LIMIT');
 assert.equal(failed.d.terminalFrameBytes,1);assert.equal(failed.d.terminalPendingCount,64);assert.equal(failed.d.terminalRetainedBytes,64);
});

test('an already expired RPC cannot turn a full queue into a fatal overflow',async t=>{
 timer(t);const s=make(),pending=[];
 for(let i=0;i<MAX_PENDING_SENDS;i++)pending.push(s.sendPromise(Buffer.alloc(1)).catch(e=>e));
 const expired=withSendContext({deadline:performance.now()-1},()=>s.sendPromise(large));
 await assert.rejects(expired,code('ATTESTOR_QUEUE_TIMEOUT'));assert.equal(s.terminated,0);assert.deepEqual(s.sent,[1]);
 s.terminate();await Promise.all(pending);
});

test('delayed timeout callbacks cannot leave expired reservations blocking a valid send',async t=>{
 let now=100;t.mock.method(performance,'now',()=>now);t.mock.timers.enable({apis:['setTimeout']});
 const s=make(),first=s.sendPromise(Buffer.alloc(1)),stale=[];
 for(let i=1;i<MAX_PENDING_SENDS;i++)stale.push(withSendContext({deadline:105},()=>s.sendPromise(Buffer.alloc(1))).catch(e=>e));
 now=110; // Simulate synchronous work delaying the timers phase.
 const next=s.sendPromise(Buffer.alloc(2));assert.equal(s.terminated,0);
 assert.equal((await Promise.all(stale)).every(e=>boundedSendFailure(e)==='ATTESTOR_QUEUE_TIMEOUT'),true);
 s.callbacks[0]();await first;await flush();assert.deepEqual(s.sent,[1,2]);s.callbacks[1]();await next;s.terminate();
});

test('an overdue active write remains fatal when admission notices the delayed timeout',async t=>{
 let now=100;t.mock.method(performance,'now',()=>now);t.mock.timers.enable({apis:['setTimeout']});
 const s=make(),first=withSendContext({deadline:105},()=>s.sendPromise(Buffer.alloc(1))).catch(e=>e);
 now=110;const next=await s.sendPromise(Buffer.alloc(2)).catch(e=>e);
 assert.equal(boundedSendFailure(await first),'ATTESTOR_SEND_TIMEOUT');assert.equal(boundedSendFailure(next),'ATTESTOR_SEND_CLOSED');
 assert.equal(boundedSendDetails(next).terminalReason,'ATTESTOR_SEND_TIMEOUT');assert.deepEqual(s.sent,[1]);assert.equal(s.terminated,1);
});
