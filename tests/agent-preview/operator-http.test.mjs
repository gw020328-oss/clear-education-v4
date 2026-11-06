import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createOperatorPreviewHandler} from '../../src/agent-preview/operator-http.mjs';
import {fixture,deferred,version,sourceText} from './operator-fixture.mjs';

function http(t,overrides={}){
  const f=fixture(t),commands=[];
  const runCommand=async({context,command,signal},work)=>{
    assert.deepEqual(context,f.context);assert.equal(signal.aborted,false);commands.push(command);
    return work({assertCurrent:f.native.assertCurrent});
  };
  const handler=createOperatorPreviewHandler({enabled:true,origin:'https://clear.test:3443',authentication:f.authentication,relay:f.relay,runCommand,...overrides});
  function request(options={}){
    const body=options.raw??JSON.stringify(options.body??{version,sourceText});let reads=0;
    const req=Readable.from((async function*(){reads++;yield Buffer.from(body);})());
    Object.assign(req,{method:'POST',url:'/bootcamp/preview/prepare',socket:{encrypted:true,remoteAddress:'127.0.0.1'},headers:{
      host:'clear.test:3443',origin:'https://clear.test:3443','sec-fetch-site':'same-origin','content-type':'application/json',
      cookie:`__Host-clear-session=${f.context.token}`,'x-wallet':f.context.wallet,'x-chain-id':String(f.context.chainId),'x-csrf-token':f.context.csrf},...options.req});
    Object.assign(req.headers,options.headers);
    const res=new EventEmitter();Object.assign(res,{headers:{},headersSent:false,writableEnded:false,destroyed:false,
      setHeader(k,v){this.headers[k]=v;},writeHead(status){this.status=status;this.headersSent=true;},
      end(value){this.body=JSON.parse(value);this.writableEnded=true;},destroy(){this.destroyed=true;}});
    const done=handler(req,res);return {req,res,done,reads:()=>reads};
  }
  return {...f,commands,request};
}
test('handler is opt-in, uses existing session, and executes exact command under A fence',async t=>{
  const f=http(t),r=f.request();await r.done;assert.equal(r.res.status,200);assert.equal(r.res.body.stage,'PREPARED');
  assert.equal(r.res.headers['Cache-Control'],'no-store');assert.equal(r.res.headers['Set-Cookie'],undefined);
  assert.deepEqual(f.commands,[{method:'POST',path:'/bootcamp/preview/prepare',body:{version,sourceText}}]);
  for(const overrides of [{enabled:false},{runCommand:undefined},{origin:'http://clear.test:3443'}]){
    const g=http(t,overrides),q=g.request();await q.done;assert.equal(q.res.status,503);assert.equal(q.reads(),0);assert.equal(g.state.calls.length,0);}
});
test('session cookie, current CSRF and role checked before upload',async t=>{
  for(const mode of ['previewCookie','duplicateCookie','csrf','expired','participant','chain','wallet']){
    const f=http(t);let headers={};if(mode==='previewCookie')headers.cookie=`__Host-clear-preview=${f.context.token}`;
    if(mode==='duplicateCookie')headers.cookie=`__Host-clear-session=${f.context.token}; __Host-clear-session=${f.context.token}`;
    if(mode==='csrf')headers['x-csrf-token']='c'.repeat(64);if(mode==='expired')f.state.valid=false;
    if(mode==='participant')f.state.role='participant';if(mode==='chain')headers['x-chain-id']='1';if(mode==='wallet')headers['x-wallet']='0x'+'2'.repeat(40);
    const r=f.request({headers});await r.done;assert.ok([401,403].includes(r.res.status),mode);assert.equal(r.reads(),0);assert.equal(f.state.calls.length,0);
    assert.equal(JSON.stringify(r.res.body).includes('private'),false);
  }
});
test('TLS loopback, exact origin/path/method and body bounds fail closed',async t=>{
  const cases=[{req:{socket:{encrypted:false,remoteAddress:'127.0.0.1'}}},{req:{socket:{encrypted:true,remoteAddress:'192.0.2.1'}}},
    {headers:{origin:'https://other.test'}},{headers:{host:'other.test'}},{headers:{'sec-fetch-site':'cross-site'}},
    {req:{method:'GET'}},{req:{url:'/bootcamp/preview/prepare?x=1'}},{req:{url:'/bootcamp/preview/bindApproval'}},
    {headers:{'content-type':'text/plain'}},{headers:{'content-encoding':'gzip'}},{raw:'x'.repeat(16385)},
    {raw:'{"version":"old","version":"clear-operator-preview.1","sourceText":"x"}'},{raw:'{"__proto__":{}}'},
    {body:{version,sourceText,operatorId:'7'}}];
  for(const input of cases){const f=http(t),r=f.request(input);await r.done;assert.ok(r.res.status>=400);assert.equal(f.state.calls.length,0);}
});
test('generate without owner bound approval returns APPROVAL_REQUIRED, never registers approval',async t=>{
  const f=http(t),p=await f.prepare(),r=f.request({req:{url:'/bootcamp/preview/generate'},body:{version,contextRef:p.contextRef,revision:p.revision,bodyHash:p.bodyHash}});
  await r.done;assert.equal(r.res.status,409);assert.equal(r.res.body.failure.code,'APPROVAL_REQUIRED');assert.equal(f.state.calls.length,1);
});
test('native grant expiry while D awaits rejects late success without leaking its error',async t=>{
  const f=http(t),entered=deferred(),late=deferred();f.state.hook=(op,body)=>{entered.resolve();return late.promise.then(()=>f.reply(op,body));};
  const r=f.request();await entered.promise;f.state.native=false;late.resolve();await r.done;
  assert.equal(r.res.body.stage,'FAILED');assert.equal(r.res.body.failure.code,'PREVIEW_REJECTED');assert.equal(JSON.stringify(r.res.body).includes('private'),false);
});
test('current auth rechecked after A command completion and session revocation hides result',async t=>{
  const f=fixture(t);
  const g=http(t,{authentication:f.authentication,relay:f.relay,runCommand:async(_,work)=>{const out=await work(f.native);f.state.valid=false;return out;}});
  const r=g.request();await r.done;assert.equal(r.res.status,403);assert.equal(r.res.body.failure.code,'PREVIEW_AUTH_REQUIRED');
});
test('disconnect aborts pending relay work; D may finish but success is never returned',async t=>{
  const f=http(t),entered=deferred(),late=deferred();f.state.hook=(op,body)=>{entered.resolve();return late.promise.then(()=>f.reply(op,body));};
  const r=f.request();await entered.promise;r.req.emit('aborted');await r.done;assert.equal(r.res.body.stage,'FAILED');late.resolve();
});
test('A command callback must run and provide a synchronous current fence',async t=>{
  for(const runCommand of [async()=>{},async(_,work)=>work({}),async(_,work)=>work({assertCurrent:async()=>{}})]){
    const f=http(t,{runCommand}),r=f.request();await r.done;assert.equal(r.res.status,503);assert.equal(f.state.calls.length,0);}
});
test('D HTTP error remains .1 with unknown call state, including after possible dispatch',async t=>{
  const f=http(t),p=await f.prepare();await f.bind(p);f.state.hook=()=>({status:502,body:{version:'clear-external-preview-error.1',code:'GEMINI_NETWORK_FAILURE',paymentAllowed:false}});
  const r=f.request({req:{url:'/bootcamp/preview/generate'},body:{version,contextRef:p.contextRef,revision:p.revision,bodyHash:p.bodyHash}});await r.done;
  assert.equal(r.res.status,502);assert.equal(r.res.body.failure.kind,'D_HTTP');assert.equal(r.res.body.failure.error.version,'clear-external-preview-error.1');
  assert.equal(JSON.stringify(r.res.body).includes('actualModelCall'),false);
});
