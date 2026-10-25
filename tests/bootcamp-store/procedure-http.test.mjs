import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createBootcampHandler} from '../../src/bootcamp/http.mjs';
import {procedureFixture} from './procedure-fixture.mjs';
async function fixture(t){
 const f=await procedureFixture(t),server=createServer(createBootcampHandler(f.store,{allowLoopbackHttpForTests:true}));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const request=(path,{context=f.aliceContext,body,headers={}}={})=>new Promise((resolve,reject)=>{
  const r=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method:body===undefined?'GET':'POST',headers:{
   host:'clear.example.invalid',origin:f.config.origin,cookie:'__Host-clear-session='+context.token,'x-wallet':context.wallet,'x-chain-id':String(context.chainId),'x-csrf-token':context.csrf,
   'content-type':'application/json','idempotency-key':f.key(),...headers}},res=>{const chunks=[];res.on('data',p=>chunks.push(p));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks))}));});
  r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));
 });return {...f,get store(){return f.store;},request};
}
test('v3 two roles share procedure pins; authenticated commands recover by operation GET and expose no raw/unsigned input endpoint',async t=>{
 const f=await fixture(t),a=f.create();await f.complete(a);const base=`/bootcamp/v3/applications/${a}`;
 const publication=await f.request(base+'/review-publications',{body:f.body(a)});assert.equal(publication.status,200);
 const s=await f.request(base+'/procedure'),o=await f.request(base+'/procedure',{context:f.operatorContext});
 assert.equal(s.headers['cache-control'],'no-store');assert.equal(s.body.version,'clear-bootcamp-review-procedure.1');assert.equal(o.body.role,'COURSE_OPERATOR');
 for(const k of ['decisionId','decisionHash','ledgerSequence'])assert.equal(s.body[k],o.body[k]);assert.equal(s.body.procedure.id,o.body.procedure.id);
 assert.equal((await f.request(base+'/procedure',{context:f.bobContext})).status,403);
 const consent=await f.request(base+'/review-consents',{body:f.body(a,{value:'AGREE'})});assert.equal(consent.status,200);
 const lookup=await f.request(base+'/procedure-operations/'+consent.body.record.operationId);assert.deepEqual(lookup.body,consent.body);
 const opConsent=await f.request(base+'/review-consents',{context:f.operatorContext,body:f.body(a,{value:'AGREE'},f.operatorContext)});assert.equal(opConsent.status,200);
 const prepared=await f.request(base+'/unsigned-preparations',{body:f.body(a)});assert.equal(prepared.status,200);assert.ok(prepared.body.record.target.preparationId);
 const text=JSON.stringify((await f.request(base+'/procedure',{context:f.operatorContext})).body);
 for(const value of [f.alice.address.toLowerCase(),f.aliceContext.token,'sourceUsernameHash','originalEvidenceLocator','originalBody'])assert.equal(text.includes(value),false);
 assert.equal((await f.request(base+'/unsigned-preparations/'+prepared.body.record.target.preparationId)).status,404);
 assert.equal((await f.request(base+'/server-snapshot',{body:{verified:true}})).status,404);
});
test('v3 rejects forged role/time/snapshot and final logout without returning private DTO',async t=>{
 const f=await fixture(t),a=f.create();await f.complete(a);f.publish(a);const base=`/bootcamp/v3/applications/${a}`;
 for(const extra of [{actorRole:'COURSE_OPERATOR'},{timestamp:1},{verified:true},{serverSnapshot:{fullAllocation:true}}])
  assert.equal((await f.request(base+'/review-consents',{body:{...f.body(a,{value:'AGREE'}),...extra}})).status,409);
 assert.equal((await f.request(base+'/review-consents',{body:f.body(a,{value:'AGREE'}),headers:{'x-csrf-token':'bad'}})).status,403);
 let count=0;f.setHook(name=>{if(name==='funding'&&++count===2)f.service.logout(f.aliceContext);});
 const denied=await f.request(base+'/procedure');assert.equal(denied.status,401);assert.deepEqual(denied.body,{error:'AUTH_REQUIRED'});
});
