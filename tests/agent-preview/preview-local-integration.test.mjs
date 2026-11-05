import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpsRequest } from 'node:https';
import { fixture, loadD } from './fixtures/preview-local-fixture.mjs';

test('local synthetic HTTPS verifies browser auth, D AST and review, C full DTO and D triple',async t=>{
  const x=await fixture(t);
  await assert.rejects(x.browserRequest('/auth/session',{headers:x.headers,trusted:false}));
  for(const path of ['/runtimes','/applications','/rpc'])assert.equal((await x.request(path,{})).status,404);
  assert.equal((await x.request('/preview/generate',x.generation,{origin:'https://wrong.invalid'})).status,422);
  assert.equal((await x.request('/preview/generate',{...x.generation,subjectRef:'injected'})).status,422);
  x.state.badDraft=true;
  assert.equal((await x.request('/preview/generate',x.generation)).status,422);
  x.state.badDraft=false;x.state.wrongTool=true;
  assert.equal((await x.request('/preview/generate',x.generation)).status,422);
  x.state.wrongTool=false;
  const input=await x.ready();
  x.state.badSource=true;
  assert.equal((await x.request('/preview/observe',input)).status,422);
  assert.equal(x.trace.filter(item=>item.path==='/v1/preview/observation-result').length,0);
  x.state.badSource=false;
  const response=await x.request('/preview/observe',input);
  assert.equal(response.status,200);
  assert.equal(response.body.provenance,'OFFLINE_TEST');
  assert.deepEqual(response.body.observation,{targetRef:'page-manual',status:'COMPLETE',observedAt:1000});
  const c=x.trace.find(item=>item.peer==='C');
  assert.deepEqual(Object.keys(c.payload).sort(),['bindingScopeHash','confirmationRef','issuerEpoch','requestRef','version']);
  const d=x.trace.find(item=>item.path==='/v1/preview/observation-result');
  assert.deepEqual(Object.keys(d.payload).sort(),['observedAt','status','targetRef']);
  assert.equal((await x.request('/preview/observe',input)).status,422);
  assert.equal((await x.request('/auth/logout',{})).status,200);
  assert.equal((await x.request('/preview/observe',input)).status,422);
});

test('browser disconnect cancels current C lookup and leaves no D delivery',async t=>{
  const x=await fixture(t),input=await x.ready();
  x.state.hang=true;
  const entered=new Promise(resolve=>x.state.entered=resolve);
  const req=httpsRequest(x.origin+'/preview/observe',{method:'POST',ca:x.ca,headers:{...x.headers,origin:x.origin,'content-type':'application/json'}});
  req.on('error',()=>{});req.end(JSON.stringify(input));await entered;
  req.destroy();
  for(let i=0;i<30;i++){
    if(x.f.sql('main',"SELECT state FROM requests WHERE kind='OBSERVE'")[0]?.state==='CANCELLED')break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(x.f.sql('main',"SELECT state FROM requests WHERE kind='OBSERVE'")[0].state,'CANCELLED');
  assert.equal(x.trace.filter(item=>item.path==='/v1/preview/observation-result').length,0);
});


test('fixed D candidate uses its approval store and service through B browser HTTPS',
  {skip:!process.env.CLEAR_D_PEER_WORKTREE},async t=>{
  const x=await fixture(t,await loadD());
  const input=await x.ready();
  const response=await x.request('/preview/observe',input);
  assert.equal(response.status,200);
  assert.deepEqual(response.body,{version:'clear-offline-observation-receipt.1',
    observation:{targetRef:'page-manual',status:'COMPLETE',observedAt:1000},provenance:'OFFLINE_TEST',automaticEligibility:false,paymentAllowed:false});
  assert.deepEqual(x.trace.filter(v=>v.modelMethod).map(v=>v.modelMethod),['countTokens','generateContent']);
  assert.deepEqual(x.trace.filter(v=>v.peer==='D').map(v=>v.path),['/v1/preview/generate','/v1/preview/execute','/v1/preview/observation-result']);
  assert.equal((await x.request('/preview/observe',input)).status,422);
});


test('installed isolated Moodle Page flows through authenticated B HTTP and fixed D TLS',
  {skip:!process.env.CLEAR_C_PEER_WORKTREE},async t=>{
  const {loadInstalledMoodle}=await import('./fixtures/installed-moodle-peer.mjs');
  const x=await fixture(t,await loadD(),loadInstalledMoodle());
  const input=await x.ready();
  const before=x.trace.filter(v=>v.peer==='C').length;
  for(const injected of [{subjectRef:'other-student'},{courseRef:'other-course'},{targetRef:'other-page'}])
    assert.equal((await x.request('/preview/observe',{...input,...injected})).status,422);
  assert.equal(x.trace.filter(v=>v.peer==='C').length,before);
  const response=await x.request('/preview/observe',input);
  assert.equal(response.status,200);
  assert.equal(response.body.observation.targetRef,'core-page-manual-mark');
  assert.equal(response.body.observation.status,'COMPLETE');
  assert.ok(response.body.observation.observedAt<=x.f.state.wall && response.body.observation.observedAt>x.f.state.wall-10);
  assert.equal(response.body.paymentAllowed,false);
  assert.equal(response.body.provenance,'OFFLINE_TEST'); // D's model remains a fixture.
  const c=x.trace.find(v=>v.peer==='C'),d=x.trace.find(v=>v.path==='/v1/preview/observation-result');
  assert.equal(c.payload.bindingScopeHash,x.f.sql('main','SELECT scope_hash FROM bindings')[0].scope_hash);
  assert.equal(c.meta.contextRef,x.state.issued.previewContextRef);
  assert.deepEqual(Object.keys(d.payload).sort(),['observedAt','status','targetRef']);
});
for(const [field,value] of [['subjectRef','other-synthetic-student'],['courseRef','other-synthetic-course']]) {
  test('installed Moodle receipt cannot bind a different B '+field,
    {skip:!process.env.CLEAR_C_PEER_WORKTREE},async t=>{
    const {loadInstalledMoodle}=await import('./fixtures/installed-moodle-peer.mjs');
    const c=loadInstalledMoodle();
    await assert.rejects(fixture(t,await loadD(),{...c,profile:{...c.profile,[field]:value}}),/RESPONSE_SCOPE/);
  });
}
