import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical,digest} from '../../src/agent-preview/moodle-binding/contract.mjs';
import {PEER_VERSION,ZERO_HASH,peerSigningBytes,encodePeer,decodePeer,peerRequestHash,createPeerReplayStore,
  acceptPeerRequest,encodePeerResponse,createPeerTransport} from '../../src/agent-preview/moodle-binding/peer-transport.mjs';
const key=Buffer.alloc(32,17),now=1793767516;
const pin={keyRef:'synthetic-key',sender:'B',receiver:'C',audience:'synthetic-C-observations',deploymentEpoch:'epoch-1',path:'/observations',origin:'https://c.example.invalid',maxClockSkewSeconds:0};
const body=Buffer.from(canonical({version:'clear-moodle-observations.3',requestRef:'inner-request',issuerEpoch:'issuer',bindingScopeHash:'a'.repeat(64),confirmationRef:'confirmation'}));
const metadata=()=>({version:PEER_VERSION,kind:'REQUEST',keyRef:pin.keyRef,sender:'B',receiver:'C',audience:pin.audience,
  deploymentEpoch:pin.deploymentEpoch,method:'POST',path:'/observations',requestRef:'1'.repeat(64),contextRef:'self-context',
  sourceHash:'2'.repeat(64),proposalHash:'3'.repeat(64),bodyHash:digest(body),issuedAt:now,expiresAtExclusive:now+5,requestHash:ZERO_HASH,status:0});
const correlation={contextRef:'self-context',sourceHash:'2'.repeat(64),proposalHash:'3'.repeat(64),expiresAtExclusive:now+60};
function stores(t,clock=()=>now){const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-peer-'))),all=[];
 t.after(()=>{all.forEach(s=>s.close());rmSync(root,{recursive:true,force:true});});
 return name=>{const s=createPeerReplayStore({path:join(root,name+'.sqlite'),clock});all.push(s);return s;};}

test('fixed byte-order fixture matches PHP reference MAC and signed-byte digest',()=>{
 const vectors=JSON.parse(readFileSync(new URL('./fixtures/preview-peer-v1.json',import.meta.url)));
 for(const v of vectors.vectors){const b=Buffer.from(v.bodyBase64,'base64'),k=Buffer.alloc(32,v.syntheticKeyByte);
  assert.equal(digest(peerSigningBytes(v.meta)),v.signedBytesSha256);
  const encoded=encodePeer(v.meta,b,k);assert.equal(encoded.toString(),v.wire);assert.deepEqual(decodePeer(encoded,k).body,b);}
});
test('canonical representation, body integrity and direction pins reject substitutions before replay claim',t=>{
 const store=stores(t)('server'),m=metadata(),wire=encodePeer(m,body,key);
 assert.throws(()=>decodePeer(Buffer.from(wire.toString().replace('"mac":','"mac":"'+ZERO_HASH+'","mac":')),key),/PEER_CANONICAL/);
 assert.throws(()=>decodePeer(Buffer.from(wire.toString().replace('1793767516','1.793767516e9')),key),/PEER_CANONICAL/);
 assert.throws(()=>decodePeer(encodePeer({...m,sourceHash:'9'.repeat(64)},body,Buffer.alloc(32,18)),key),/PEER_AUTH/);
 for(const [field,value] of [['receiver','D'],['audience','other'],['deploymentEpoch','epoch-2'],['keyRef','other'],['path','/v1/preview/execute']]){
  assert.throws(()=>acceptPeerRequest({wire:encodePeer({...m,[field]:value},body,key),key,pin,replay:store}),/PEER_PIN|PEER_DIRECTION/);
 }
 assert.equal(acceptPeerRequest({wire,key,pin,replay:store}).meta.contextRef,'self-context');
 assert.throws(()=>acceptPeerRequest({wire,key,pin,replay:store}),/PEER_REPLAY/);
});
test('durable replay survives reopen and rollback clock is rejected',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-peer-restart-'))),path=join(root,'state.sqlite');let current=now,s;
 try{s=createPeerReplayStore({path,clock:()=>current});s.claim(metadata(),0);s.close();
  s=createPeerReplayStore({path,clock:()=>current});assert.throws(()=>s.claim(metadata(),0),/PEER_REPLAY/);
  current--;assert.throws(()=>s.claim({...metadata(),requestRef:'4'.repeat(64),issuedAt:current,expiresAtExclusive:current+5},0),/PEER_CLOCK_REVERSED/);
 }finally{s?.close();rmSync(root,{recursive:true,force:true});}
});
test('expiry after committed replay claim leaves claim spent',t=>{
 let calls=0;const s=stores(t,()=>++calls===2?now+5:now)('expired');
 assert.throws(()=>s.claim(metadata(),0),/PEER_EXPIRED/);assert.throws(()=>s.claim(metadata(),0),/PEER_REPLAY/);
});
test('fixed HTTPS URL and matched authenticated response produce bounded payload',async t=>{
 const store=stores(t),server=store('server'),client=store('client'),out=Buffer.from(canonical({targetRef:'page-manual',status:'COMPLETE',observedAt:now}));
 const transport=createPeerTransport({pin,key,replay:client,clock:()=>now,activation:'OFFLINE_TEST',fetchImpl:async(url,options)=>{
  assert.equal(url,pin.origin+pin.path);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  const request=acceptPeerRequest({wire:options.body,key,pin,replay:server});
  return new Response(encodePeerResponse({request,body:out,key,pin,now,expiresAtExclusive:now+5}),{headers:{'content-type':'application/json'}});
 }});t.after(()=>transport.close());assert.deepEqual(await transport.query(body,correlation),out);
});
for(const field of ['contextRef','sourceHash','proposalHash','requestHash'])test('valid MAC with changed response '+field+' is rejected',async t=>{
 const store=stores(t),transport=createPeerTransport({pin,key,replay:store('client'),clock:()=>now,activation:'OFFLINE_TEST',fetchImpl:async(_url,options)=>{
  const request=decodePeer(options.body,key),wire=encodePeerResponse({request,body,key,pin,now,expiresAtExclusive:now+5}),decoded=decodePeer(wire,key);
  decoded.meta[field]=field==='contextRef'?'other-context':'f'.repeat(64);
  return new Response(encodePeer(decoded.meta,body,key),{headers:{'content-type':'application/json'}});
 }});t.after(()=>transport.close());await assert.rejects(transport.query(body,correlation),/PEER_CORRELATION/);
});
test('disabled default, arbitrary URL/config, oversized and redirected responses fail closed',async t=>{
 const store=stores(t),base={pin,key,replay:store('client'),clock:()=>now};
 const disabled=createPeerTransport(base);t.after(()=>disabled.close());await assert.rejects(disabled.query(body,correlation),/PEER_DISABLED/);
 assert.throws(()=>createPeerTransport({...base,pin:{...pin,origin:'http://169.254.169.254'}}),/PEER_PIN/);
 for(const response of [new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}}),new Response('',{status:302,headers:{location:'https://other.invalid'}})]){
  const p=createPeerTransport({...base,activation:'OFFLINE_TEST',fetchImpl:async()=>response});
  try{await assert.rejects(p.query(body,correlation),/PEER_SIZE|PEER_HTTP/);}finally{p.close();}
 }
});
test('timeout bounds uncooperative transport and late result cannot claim response',async t=>{
 const store=stores(t),replay=store('client');let claims=0,resolve;
 const p=createPeerTransport({pin,key,replay:{claim(){claims++;}},clock:()=>now,timeoutMs:20,activation:'OFFLINE_TEST',fetchImpl:()=>new Promise(r=>resolve=r)});
 t.after(()=>p.close());await assert.rejects(p.query(body,correlation),/PEER_ABORTED|PEER_TIMEOUT/);
 resolve(new Response('{}',{headers:{'content-type':'application/json'}}));await new Promise(r=>setImmediate(r));assert.equal(claims,0);
});

test('peer replay lock wait uses fresh time and rejects expiry',async()=>{
 const {Worker}=await import('node:worker_threads'),{DatabaseSync}=await import('node:sqlite');
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-peer-lock-'))),path=join(root,'state.sqlite');let worker,lock;
 try {
  createPeerReplayStore({path}).close();
  worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');(async()=>{
   const {createPeerReplayStore}=await import(workerData.module);const s=createPeerReplayStore({path:workerData.path});parentPort.postMessage('ready');
   parentPort.once('message',meta=>{parentPort.postMessage('started');let code='CLAIMED';try{s.claim(meta,0);}catch(e){code=e.message;}parentPort.postMessage({code});s.close();});})();`,
   {eval:true,workerData:{module:new URL('../../src/agent-preview/moodle-binding/peer-transport.mjs',import.meta.url).href,path}});
  await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
  if(Date.now()%1000<100) await new Promise(resolve=>setTimeout(resolve,110));
  lock=new DatabaseSync(path);lock.exec('BEGIN EXCLUSIVE');
  // Expiry at next second: release only after that boundary, within SQLite's 1s busy wait.
  const wall=Math.floor(Date.now()/1000),expires=wall+1,delay=expires*1000-Date.now()+30;
  const result=new Promise((resolve,reject)=>{worker.on('message',v=>{if(v==='started')setTimeout(()=>lock.exec('COMMIT'),delay);else resolve(v);});worker.once('error',reject);});
  worker.postMessage({...metadata(),issuedAt:wall,expiresAtExclusive:expires});
  assert.equal((await result).code,'PEER_EXPIRED');assert.equal(lock.prepare('SELECT COUNT(*) AS n FROM peer_seen').get().n,0);
 }finally{await worker?.terminate();lock?.close();rmSync(root,{recursive:true,force:true});}
});

test('generate permits bounded long response but never a stale arriving request',async t=>{
 let wall=now,mono=0;const store=stores(t,()=>wall),server=store('server'),client=store('client');
 const modelPin={...pin,receiver:'D',audience:'synthetic-model',path:'/v1/preview/generate'};
 const p=createPeerTransport({pin:modelPin,key,replay:client,clock:()=>wall,monotonic:()=>mono,activation:'OFFLINE_TEST',fetchImpl:async(_url,options)=>{
  const request=acceptPeerRequest({wire:options.body,key,pin:modelPin,replay:server});
  assert.equal(request.meta.expiresAtExclusive,now+45);wall+=40;mono+=40000;
  const changed={...request.meta,requestRef:'9'.repeat(64)};
  assert.throws(()=>acceptPeerRequest({wire:encodePeer(changed,body,key),key,pin:modelPin,replay:server}),/PEER_EXPIRED/);
  return new Response(encodePeerResponse({request,body,key,pin:modelPin,now:wall,expiresAtExclusive:now+45}),{headers:{'content-type':'application/json'}});
 }});t.after(()=>p.close());assert.deepEqual(await p.query(body,correlation),body);
 assert.throws(()=>createPeerTransport({pin,key,replay:client,timeoutMs:45000}),/PEER_TIMEOUT/);
});

for (const scenario of ['close','synchronous caller abort']) {
 test('pending peer query cancels on '+scenario,{timeout:500},async t=>{
  const caller=new AbortController();
  let receivedSignal, release, claims=0;
  const transport=createPeerTransport({pin,key,replay:{claim(){claims++;}},clock:()=>now,activation:'OFFLINE_TEST',
   fetchImpl(_url,options){
    receivedSignal=options.signal;
    if(scenario==='synchronous caller abort')caller.abort();
    return new Promise(resolve=>release=resolve);
   }});
  t.after(()=>transport.close());
  const pending=transport.query(body,correlation,{signal:caller.signal});
  if(scenario==='close')transport.close();
  await assert.rejects(pending,scenario==='close'?/PEER_CLOSED/:/PEER_ABORTED/);
  assert.equal(receivedSignal.aborted,true);
  release(new Response('{}',{headers:{'content-type':'application/json'}}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(claims,0);
 });
}

test('valid MAC zero proposals are rejected on all post-draft request and response routes',async t=>{
 const {createHmac}=await import('node:crypto');
 const {PEER_FIELDS}=await import('../../src/agent-preview/moodle-binding/peer-transport.mjs');
 const store=stores(t);
 for(const path of ['/observations','/v1/preview/execute','/v1/preview/observation-result']){
  const routePin={...pin,path}, replay=store(path.replaceAll('/','-'));
  for(const kind of ['REQUEST','RESPONSE']){
   const meta={...metadata(),path,kind,proposalHash:ZERO_HASH,
    ...(kind==='RESPONSE'?{sender:'C',receiver:'B',status:200,requestHash:'a'.repeat(64)}:{})};
   // Independent wire construction proves the rejected input has a valid MAC.
   const bytes=Buffer.concat([Buffer.from('CLEAR\0PREVIEW\0PEER\0HMAC-SHA256\0V1\0'),...PEER_FIELDS.flatMap(field=>{
    const value=Buffer.from(String(meta[field]),'ascii'),length=Buffer.alloc(4);
    length.writeUInt32BE(value.length);return [length,value];
   })]);
   const mac=createHmac('sha256',key).update(bytes).digest('hex');
   const wire=Buffer.from(canonical({meta,body:body.toString('base64'),mac}));
   assert.throws(()=>decodePeer(wire,key),/PEER_PROPOSAL_REQUIRED/);
   if(kind==='REQUEST')assert.throws(()=>acceptPeerRequest({wire,key,pin:routePin,replay}),/PEER_PROPOSAL_REQUIRED/);
   assert.throws(()=>encodePeer(meta,body,key),/PEER_PROPOSAL_REQUIRED/);
  }
  assert.equal(acceptPeerRequest({wire:encodePeer({...metadata(),path},body,key),key,pin:routePin,replay}).meta.proposalHash,metadata().proposalHash);
 }
});
test('prepare and generate retain zero proposal request and correlated response semantics',t=>{
 const store=stores(t);
 for(const path of ['/v1/preview/prepare','/v1/preview/generate']){
  const routePin={...pin,path},meta={...metadata(),path,proposalHash:ZERO_HASH};
  const request=acceptPeerRequest({wire:encodePeer(meta,body,key),key,pin:routePin,replay:store(path.replaceAll('/','-'))});
  const response=decodePeer(encodePeerResponse({request,body,key,pin:routePin,now,expiresAtExclusive:now+5}),key);
  assert.equal(response.meta.proposalHash,ZERO_HASH);
  assert.equal(response.meta.requestHash,peerRequestHash(meta));
 }
});

test('fractional-second parent deadline aborts idle transport without another query',{timeout:4000},async()=>{
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 await delay((650-Date.now()%1000+1000)%1000);
 const expiry=Math.floor(Date.now()/1000)+2;
 let receivedSignal,settled=false;
 const transport=createPeerTransport({pin:{...pin,path:'/v1/preview/generate'},key,
  replay:{claim(){assert.fail('late replay claim');}},activation:'OFFLINE_TEST',
  fetchImpl(_url,options){receivedSignal=options.signal;return new Promise(()=>{});}});
 const pending=transport.query(body,{...correlation,expiresAtExclusive:expiry})
  .then(()=>assert.fail('idle transport returned'),error=>{assert.match(error.message,/PEER_TIMEOUT/);settled=true;});
 try {
  await delay(Math.max(0,expiry*1000-Date.now()+30));
  assert.equal(receivedSignal.aborted,true);
  assert.equal(settled,true);
 } finally {transport.close();await pending;}
});
