import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createBootcampHandler} from '../../src/bootcamp/http.mjs';
import {storeFixture} from './fixture.mjs';
async function httpFixture(t,allowLoopbackHttpForTests=true,operator=false){
  const f=await storeFixture(t);if(operator){f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}];f.restart();}
  const handler=createBootcampHandler(f.store,{allowLoopbackHttpForTests}),server=createServer(handler);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  function request(path,{method='GET',body,context=f.aliceContext,headers={}}={}){
    return new Promise((resolve,reject)=>{
      const req=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:'clear.example.invalid',origin:f.config.origin,
        cookie:'__Host-clear-session='+context.token,'x-wallet':context.wallet,'x-chain-id':String(context.chainId),'x-csrf-token':context.csrf,
        ...(body===undefined?{}:{'content-type':'application/json'}),...headers}},res=>{
          const parts=[];res.on('data',p=>parts.push(p));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(parts).toString())}));
        });req.on('error',reject);req.end(body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body));
    });
  }
  return {...f,request};
}
test('opt-in HTTP: authenticated commands and response-loss lookup expose exact targets and current projection',async t=>{
  const f=await httpFixture(t),created=await f.request('/bootcamp/v1/applications',{method:'POST',body:{},headers:{'idempotency-key':'create-http'}});
  assert.equal(created.status,200);assert.equal(created.headers['cache-control'],'no-store');const a=created.body.record.applicationId;
  const issued=await f.request(`/bootcamp/v1/applications/${a}/requests`,{method:'POST',body:{criterionId:'activity-complete',expectedRevision:1},headers:{'idempotency-key':'request-http'}});
  assert.equal(issued.status,200);
  const body={requestId:issued.body.record.target.requestId,expectedRevision:issued.body.record.applicationRevision};
  const accepted=await f.request(`/bootcamp/v1/applications/${a}/collect`,{method:'POST',body,headers:{'idempotency-key':'collect-http'}});assert.equal(accepted.status,200);
  const target=accepted.body.record.target;
  const operation=await f.request(`/bootcamp/v1/applications/${a}/operations/${accepted.body.record.operationId}`);assert.deepEqual(operation.body,accepted.body);
  const evidence=await f.request(`/bootcamp/v1/applications/${a}/evidence/${target.evidenceId}`);assert.equal(evidence.body.current,true);
  const decision=await f.request(`/bootcamp/v1/applications/${a}/decisions/${target.decisionId}`);assert.equal(decision.body.current,true);
  assert.equal((await f.request(`/bootcamp/v1/applications/${a}`,{context:f.bobContext})).status,403);
});
test('HTTP rejects missing session, CSRF, wallet change, origin, oversized/raw upload and forged verified flags',async t=>{
  const f=await httpFixture(t),a=f.create();
  const base=`/bootcamp/v1/applications/${a}`;
  for(const headers of [{cookie:''},{'x-wallet':f.bob.address},{origin:'https://other.invalid'},{cookie:'__Host-clear-session='+f.aliceContext.token+'; __Host-clear-session='+f.aliceContext.token}])
    assert.ok([401,403].includes((await f.request(base,{headers})).status));
  assert.equal((await f.request(base+'/requests',{method:'POST',body:{criterionId:'activity-complete',expectedRevision:1},headers:{'idempotency-key':'no-csrf','x-csrf-token':'bad'}})).status,403);
  assert.equal((await f.request(base+'/collect',{method:'POST',body:{requestId:'request-forged',expectedRevision:1,verified:true,condition:'MET'},headers:{'idempotency-key':'forged'}})).status,409);
  assert.equal((await f.request(base+'/proof',{method:'POST',body:{proof:'not-a-real-proof'}})).status,404);
  assert.equal((await f.request(base+'/collect',{method:'POST',body:JSON.stringify({raw:'x'.repeat(5000)})})).status,413);
  assert.equal((await f.request(base+'/collect',{method:'POST',body:'{bad'})).status,409);
  assert.equal((await f.request(base+'?token=anything')).status,404);
});
test('default HTTP transport rejects unencrypted connection and proxy TLS spoofing',async t=>{
  const f=await httpFixture(t,false);
  assert.equal((await f.request('/bootcamp/v1/policy',{headers:{'x-forwarded-proto':'https'}})).status,403);
});
test('separate v2 HTTP operator/student projection, role scope and blocked consent transport preserve v1',async t=>{
  const f=await httpFixture(t,true,true),a=f.create(),path=`/bootcamp/v2/applications/${a}`;
  const s=await f.request(path+'/operations'),o=await f.request(path+'/operations',{context:f.operatorContext});
  assert.equal(s.status,200);assert.equal(o.status,200);assert.equal(s.body.version,'clear-bootcamp-operations-projection.2');
  assert.equal(s.body.decisionHash,o.body.decisionHash);assert.equal(s.body.ledgerSequence,o.body.ledgerSequence);
  assert.equal((await f.request(path+'/operations',{context:f.bobContext})).status,403);
  assert.equal((await f.request(`/bootcamp/v1/applications/${a}`,{context:f.operatorContext})).status,403);
  const body={expectedRevision:1,expectedLedgerSequence:s.body.ledgerSequence,targetDecisionId:s.body.decisionId,
    targetDecisionRevision:s.body.decisionRevision,targetDecisionHash:s.body.decisionHash,reason:'AGREE_SAME_RESULT'};
  const consent=await f.request(path+'/consent-requests',{method:'POST',body,headers:{'idempotency-key':'blocked-consent'}});assert.equal(consent.status,200);
  const action=await f.request(path+'/actions/'+consent.body.record.target.actionId);assert.equal(action.body.record.processingStatus,'BLOCKED');
  assert.equal((await f.request(path+'/metric-events',{method:'POST',body:{elapsedMs:0},headers:{'idempotency-key':'forge-metric'}})).status,404);
  const page=await f.request('/bootcamp/v2/operations?limit=1',{context:f.operatorContext});assert.equal(page.status,200);assert.equal(page.body.rows.length,1);
  assert.equal((await f.request('/bootcamp/v2/operations?limit=1')).status,403);
});
test('HTTP reauthenticates after awaited acceptance before sending its private receipt',async t=>{
 const f=await httpFixture(t),a=f.create(),r=f.store.issueRequest(f.aliceContext,a,{criterionId:'activity-complete',expectedRevision:1},f.key());
 const collect=f.store.collect.bind(f.store);f.store.collect=async(...args)=>{const result=await collect(...args);f.service.logout(f.aliceContext);return result;};
 const response=await f.request(`/bootcamp/v1/applications/${a}/collect`,{method:'POST',body:{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},headers:{'idempotency-key':'await-logout'}});
 assert.equal(response.status,401);assert.deepEqual(response.body,{error:'AUTH_REQUIRED'});assert.equal(f.counts().evidence,1);
 const context=await f.login(f.alice);assert.equal(f.store.getApplication(context,a).evidence.length,1);
});
