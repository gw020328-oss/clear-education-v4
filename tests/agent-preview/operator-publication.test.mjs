import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createOperatorPreviewHandler} from '../../src/agent-preview/operator-http.mjs';
import {fixture,deferred,version} from './operator-fixture.mjs';

async function generateHttp(f,p,afterWork){
  let completed,nativeFinished=false,nativeChecks=0;
  const runCommand=async({command,signal},work)=>{
    assert.equal(command.path,'/bootcamp/preview/generate');assert.equal(signal.aborted,false);
    const assertCurrent=()=>{assert.equal(nativeFinished,false,'native grant must not be reused after finish');nativeChecks++;f.native.assertCurrent();};
    assertCurrent();completed=await work({assertCurrent});
    await Promise.resolve();await afterWork(completed);assertCurrent();nativeFinished=true;return completed;
  };
  const handler=createOperatorPreviewHandler({enabled:true,origin:'https://clear.test:3443',authentication:f.authentication,relay:f.relay,runCommand});
  const req=Readable.from([Buffer.from(JSON.stringify({version,contextRef:p.contextRef,revision:p.revision,bodyHash:p.bodyHash}))]);
  Object.assign(req,{method:'POST',url:'/bootcamp/preview/generate',socket:{encrypted:true,remoteAddress:'127.0.0.1'},headers:{
    host:'clear.test:3443',origin:'https://clear.test:3443','sec-fetch-site':'same-origin','content-type':'application/json',
    cookie:`__Host-clear-session=${f.context.token}`,'x-wallet':f.context.wallet,'x-chain-id':String(f.context.chainId),'x-csrf-token':f.context.csrf}});
  const res=new EventEmitter();Object.assign(res,{headersSent:false,writableEnded:false,destroyed:false,
    setHeader(){},writeHead(status){this.status=status;this.headersSent=true;},end(body){this.text=body;this.body=JSON.parse(body);this.writableEnded=true;},destroy(){this.destroyed=true;}});
  await handler(req,res);return {res,completed,nativeFinished,nativeChecks};
}
for(const mode of ['scope-revoked','context-invalidated','original-ttl-expired'])test(`F1: no publication after ${mode} during native finish`,async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p,'approval_1',f.state.now+1000);
  const {res,completed,nativeFinished}=await generateHttp(f,p,async value=>{
    assert.equal(value.stage,'PROPOSED');
    if(mode==='scope-revoked')f.state.scopeValid=false;
    if(mode==='context-invalidated')f.relay.invalidate(value.contextRef);
    if(mode==='original-ttl-expired')f.advance(1000);
  });
  assert.equal(nativeFinished,true);assert.notEqual(res.status,200);assert.equal(res.body.stage,'FAILED');
  assert.equal(res.text.includes('sourceText'),false);assert.equal(res.text.includes('modelRows'),false);
  assert.equal(f.state.calls.filter(c=>c.path.endsWith('/generate')).length,1);
  await assert.rejects(f.relay.publish(f.context,completed,{signal:f.native.signal},()=>assert.fail('must not publish')));
  if(mode!=='original-ttl-expired'){
    f.state.scopeValid=true;const next=await f.prepare();await f.bind(next);
    await assert.rejects(f.generate(next),/PREVIEW_ALREADY_USED/); // Paid-use state never restored.
  }
});
test('successful final publication does not renew or reassert the consumed native grant',async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);
  const {res,completed,nativeFinished,nativeChecks}=await generateHttp(f,p,async()=>{});
  assert.equal(nativeFinished,true);assert.ok(nativeChecks>0);assert.equal(res.status,200);assert.deepEqual(res.body,completed);
  await assert.rejects(f.relay.publish(f.context,completed,{signal:f.native.signal},()=>assert.fail('duplicate publication')),/PREVIEW_ALREADY_USED/);
});
for(const mode of ['authority-revision','deployment','session'])test(`publication re-resolves ${mode} after command finish`,async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);
  const {res}=await generateHttp(f,p,async()=>{
    if(mode==='authority-revision')f.state.revision++;
    if(mode==='deployment')f.deployment.bindingHash='f'.repeat(64);
    if(mode==='session')f.state.valid=false;
  });
  assert.notEqual(res.status,200);assert.equal(res.body.stage,'FAILED');assert.equal(res.text.includes('sourceText'),false);
});
test('publication only accepts the exact issued result and its original session, and consumes it once',async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);const g=await f.generate(p);let writes=0;
  await assert.rejects(f.relay.publish(f.context,structuredClone(g),{signal:f.native.signal},()=>writes++),/PREVIEW_ALREADY_USED/);
  await assert.rejects(f.relay.publish({...f.context,token:'e'.repeat(64)},g,{signal:f.native.signal},()=>writes++),/PREVIEW_FORBIDDEN/);
  await f.relay.publish(f.context,g,{signal:f.native.signal},body=>{assert.deepEqual(JSON.parse(body),g);writes++;});
  await assert.rejects(f.relay.publish(f.context,g,{signal:f.native.signal},()=>writes++),/PREVIEW_ALREADY_USED/);assert.equal(writes,1);
});
test('publication resolver wait keeps the original request deadline, even with a longer context TTL',async t=>{
  let original,hold=false;const entered=deferred(),late=deferred();
  const f=fixture(t,{ttlMs:120000,resolveOperatorPreviewScope:()=>{if(hold){entered.resolve();return late.promise;}return original();}});
  original=f.resolveOperatorPreviewScope;const p=await f.prepare();await f.bind(p);const g=await f.generate(p);f.advance(44000);hold=true;
  const work=f.relay.publish(f.context,g,{signal:f.native.signal},()=>assert.fail('expired publication'));await entered.promise;
  assert.ok([...f.state.timers.values()].some(timer=>timer.ms===1000));f.advance(1000);late.resolve(original());await assert.rejects(work,/PREVIEW_EXPIRED/);
});
test('publication cannot revive an older result after the context advances',async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);await f.generate(p);
  await assert.rejects(f.relay.publish(f.context,p,{signal:f.native.signal},()=>assert.fail('old result')),/PREVIEW_STALE/);
});
for(const mode of ['scope','invalidate','expiry'])test(`final synchronous publication check catches ${mode} after the last scope await`,async t=>{
  let original,publishing=false,checks=0,generated;
  const f=fixture(t,{resolveOperatorPreviewScope:()=>{const scope=original();return {...scope,assertCurrent(){
    scope.assertCurrent();
    if(publishing&&++checks===2)queueMicrotask(()=>{
      if(mode==='scope')f.state.scopeValid=false;
      if(mode==='invalidate')f.relay.invalidate(generated.contextRef);
      if(mode==='expiry')f.advance(1000);
    });
  }};}});original=f.resolveOperatorPreviewScope;
  const p=await f.prepare();await f.bind(p,'approval_1',f.state.now+1000);generated=await f.generate(p);publishing=true;
  let writes=0;await assert.rejects(f.relay.publish(f.context,generated,{signal:f.native.signal},()=>writes++));
  assert.equal(writes,0);assert.equal(f.state.calls.length,2);
});
test('time spent in the final authority callback cannot cross the original TTL and publish',async t=>{
  let original,publishing=false,checks=0;
  const f=fixture(t,{resolveOperatorPreviewScope:()=>{const scope=original();return {...scope,assertCurrent(){
    scope.assertCurrent();if(publishing&&++checks===3)f.advance(1000);
  }};}});original=f.resolveOperatorPreviewScope;
  const p=await f.prepare();await f.bind(p,'approval_1',f.state.now+1000);const g=await f.generate(p);publishing=true;
  let writes=0;await assert.rejects(f.relay.publish(f.context,g,{signal:f.native.signal},()=>writes++));assert.equal(writes,0);
});
