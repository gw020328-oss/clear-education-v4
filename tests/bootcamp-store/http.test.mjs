import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createBootcampHandler} from '../../src/bootcamp/http.mjs';
import {storeFixture} from './fixture.mjs';
async function httpFixture(t,allowLoopbackHttpForTests=true){
  const f=await storeFixture(t),handler=createBootcampHandler(f.store,{allowLoopbackHttpForTests}),server=createServer(handler);
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
