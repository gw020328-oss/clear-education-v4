import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createBootcampHandler} from '../../src/bootcamp/http.mjs';
import {storeFixture} from './fixture.mjs';
import {commandFixture,createCommand,hex} from './moodle-command-fixture.mjs';
test('native HTTP uses the original session and exact command once, while GET receipt needs no write grant',async t=>{
 const f=await storeFixture(t),x=await commandFixture({authentication:f.service,contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
 t.after(()=>x.owner.close());f.configuration.commandScope=x.scope;f.restart();
 const server=createServer(createBootcampHandler(f.store,{allowLoopbackHttpForTests:true,normalUi:{commandScope:x.scope}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const call=(path,{body,grant,binding=grant?.commandBinding,key='native-http',context=f.aliceContext}={})=>new Promise((resolve,reject)=>{
  const req=httpRequest({host:'127.0.0.1',port:server.address().port,path,method:body===undefined?'GET':'POST',headers:{
   host:new URL(f.config.origin).host,origin:f.config.origin,cookie:'__Host-clear-session='+context.token,
   'x-wallet':context.wallet,'x-chain-id':String(context.chainId),'x-csrf-token':context.csrf,
   ...(body===undefined?{}:{'content-type':'application/json','idempotency-key':key}),
   ...(grant?{'x-clear-command-ref':grant.requestRef,'x-clear-command-binding':binding}:{})}},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));
   });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 const command=createCommand('native-http'),grant=await x.grant(command);
 assert.equal((await call(command.path,{body:{}})).status,409);
 assert.equal((await call(command.path,{body:{},grant,binding:hex(99)})).status,409);
 assert.equal((await call(command.path,{body:{},grant,context:f.bobContext})).status,409);
 const result=await call(command.path,{body:{},grant});assert.equal(result.status,200);
 assert.equal((await call(command.path,{body:{},grant})).status,409);
 const {applicationId,operationId}=result.body.record;
 assert.equal((await call('/bootcamp/v1/applications/'+applicationId+'/operations/'+operationId)).status,200);
 assert.equal((await call('/bootcamp/v4/applications/'+applicationId+'/resume',{body:{},grant})).status,409);
});
