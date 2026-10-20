import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {setImmediate as tick} from 'node:timers/promises';
import http from 'node:http';
import {inspectSourceLayout} from '../../src/hackerrank-evidence/layout-review.mjs';
import {createLayoutCapture} from '../../src/hackerrank-evidence/layout-capture.mjs';
import {runHackerRankLayout,layoutTransportHost,createLayoutTransportDiagnostics} from '../../src/hackerrank-evidence/layout-run.mjs';
import {createRoute,allowedHost} from '../../src/ybm-collector/route.mjs';
import {FakeClient} from '../ybm-collector/fake-client.mjs';
import {ACCOUNT_URL,CERTIFICATE_URL} from '../../src/hackerrank-evidence/recipes.mjs';
const account='<script type="application/json">{"props":{"pageProps":{"current_hacker":{"username":"SYNTHETIC_SECRET_USER"}}},"SYNTHETIC_SECRET_KEY":{"username":"SYNTHETIC_SECRET_USER"}}</script>';
const certificate=JSON.stringify({data:[{username:'SYNTHETIC_SECRET_USER',certificate_id:'SYNTHETIC_SECRET_ID',certificate_name:'SYNTHETIC_SECRET_NAME',status:'SYNTHETIC_SECRET_STATUS',other:'SYNTHETIC_SECRET_EXTRA'}]});
const certUrl=CERTIFICATE_URL+'?username=SYNTHETIC_SECRET_USER';
test('login diagnostics retain only fixed denied Google resource host categories and bounded counts',()=>{
 const diagnostics=createLayoutTransportDiagnostics();
 for(let i=0;i<1002;i++)assert.equal(diagnostics.allowHost('ssl.gstatic.com'),false);
 for(const host of ['fonts.gstatic.com','www.gstatic.com','www.google.com'])assert.equal(diagnostics.allowHost(host),true);
 for(const host of ['SYNTHETIC_SECRET_HOST.example','SYNTHETIC_SECRET_HOST.gstatic.com','www.gstatic.com.evil.example','www.googleapis.com'])assert.equal(diagnostics.allowHost(host),false);
 assert.equal(diagnostics.allowHost('accounts.google.com'),true);assert.equal(diagnostics.allowHost('www.hackerrank.com'),true);
 assert.deepEqual(diagnostics.summary(),[
  {host:'ssl.gstatic.com',category:'GOOGLE_STATIC_CANDIDATE',count:1000},
 ]);
 assert.doesNotMatch(JSON.stringify(diagnostics.summary()),/SYNTHETIC_SECRET/);
 assert.deepEqual(createLayoutTransportDiagnostics().summary(),[]);
});
test('HR login CONNECT allows exact Google account host and rejects unapproved targets before attestor RPC',async t=>{
 const client=new FakeClient(),route=await createRoute({client,allowHost:layoutTransportHost});t.after(()=>route.close());
 const proxy=new URL(route.proxyUrl);
 const connect=target=>new Promise((resolve,reject)=>{
  const request=http.request({host:proxy.hostname,port:proxy.port,method:'CONNECT',path:target});
  request.on('error',reject);request.on('connect',(response,socket)=>{socket.destroy();resolve(response.statusCode);});request.end();
 });
 const permitted=['accounts.google.com','fonts.gstatic.com','www.gstatic.com','www.google.com'];
 for(const host of permitted)assert.equal(await connect(host+':443'),200);
 assert.deepEqual(client.calls.filter(c=>c.type==='createTunnel').map(c=>c.value.host),permitted);
 for(const target of ['google.com:443','sub.accounts.google.com:443','accounts.google.com.evil.example:443','evilaccounts.google.com:443','www.googleapis.com:443','ssl.gstatic.com:443','localhost:443','accounts.google.com.:443','accounts.google.com:80','user@accounts.google.com:443','sub.www.gstatic.com:443','www.gstatic.com.evil.example:443','www.google.com.evil.example:443',...permitted.map(host=>host+':80')])assert.equal(await connect(target),403,target);
 assert.equal(client.calls.filter(c=>c.type==='createTunnel').length,permitted.length);
 for(const host of permitted)assert.equal(allowedHost(host),false);
});
function fakeBrowser(){
 const handlers=new Map(),calls=[],bodies=new Map();
 return {calls,bodies,closed:new Promise(()=>{}),on(name,fn){handlers.set(name,fn);return()=>handlers.delete(name);},emit(name,e,sid='page'){handlers.get(name)?.(e,sid);},
  async send(name,args,sid){calls.push([name,args,sid]);if(name==='Network.getResponseBody')return {body:bodies.get(args.requestId),base64Encoded:false};if(name==='Target.getTargets')return {targetInfos:[{type:'page',targetId:'target'}]};if(name==='Target.attachToTarget')return {sessionId:'page'};return {};},async close(){calls.push(['close']);},handlerCount:()=>handlers.size};
}
function events(browser,id,url,body,{sid='page',method='GET',status=200,mimeType=url===ACCOUNT_URL?'text/html':'application/json',redirectResponse,fromServiceWorker=false,fromDiskCache=false}={}){
 browser.bodies.set(id,body);browser.emit('Network.requestWillBeSent',{requestId:id,request:{url,method},redirectResponse},sid);
 browser.emit('Network.responseReceived',{requestId:id,response:{url,status,mimeType,fromServiceWorker,fromDiskCache}},sid);
 browser.emit('Network.loadingFinished',{requestId:id},sid);
}
test('Google login responses are never observed before or after ready, including popup sessions',async()=>{
 const browser=fakeBrowser(),capture=createLayoutCapture({browser,sessionId:'page'});
 events(browser,'before-google','https://accounts.google.com/','SYNTHETIC_SECRET_BODY');await capture.arm();
 for(const host of ['accounts.google.com','fonts.gstatic.com','www.gstatic.com','www.google.com']){
  events(browser,'page-'+host,'https://'+host+'/','SYNTHETIC_SECRET_BODY');
  events(browser,'popup-'+host,'https://'+host+'/','SYNTHETIC_SECRET_BODY',{sid:'popup'});
 }
 await tick();assert.deepEqual(capture.summary().layouts,{});
 assert.ok(!browser.calls.some(c=>/getResponseBody|cookie|claim|sign/i.test(c[0])));
 await capture.close();assert.doesNotMatch(JSON.stringify(await capture.done),/SYNTHETIC_SECRET/);
});
test('layout summary emits only static schema labels; source values and unknown keys stay private',()=>{
 const a=inspectSourceLayout('account',Buffer.from(account)),c=inspectSourceLayout('certificate',Buffer.from(certificate));
 assert.deepEqual(a.candidateJsonPaths,['props.pageProps.current_hacker.username']);
 assert.deepEqual(c.recordShapes,[{path:'data',bounded:true,fields:['username','certificate_id','certificate_name','status'],hasExtraFields:true}]);
 assert.doesNotMatch(JSON.stringify([a,c]),/SYNTHETIC_SECRET/);
 assert.equal(a.authenticatedAccountControlProven,false);assert.equal(c.accountJoinProven,false);
 assert.equal(inspectSourceLayout('certificate',Buffer.from('{"data":[],"data":[]}')).jsonParsed,false);
 assert.throws(()=>inspectSourceLayout('account',Buffer.from([0xff])),/LAYOUT_ENCODING/);
 assert.throws(()=>inspectSourceLayout('certificate',Buffer.alloc(65537)),/LAYOUT_SIZE/);
 assert.throws(()=>inspectSourceLayout('unknown',Buffer.from('{}')),/LAYOUT_ROLE/);
});
test('diagnostic separates strict numeric policy from schema-only inspection and keeps ambiguous structures rejected',()=>{
 const cases=[
  ['{"data":[],"score":1.5}','STRICT_VALUE_OR_GRAMMAR_POLICY'],
  ['{"data":[],"score":1e2}','STRICT_VALUE_OR_GRAMMAR_POLICY'],
  ['{"data":[],"score":9007199254740992}','STRICT_VALUE_OR_GRAMMAR_POLICY'],
  ['{"data":[],"data":[]}','STRICT_DUPLICATE_OR_UNSAFE_KEY'],
  ['{"data":[],"__proto__":{"SYNTHETIC_SECRET":"value"}}','STRICT_DUPLICATE_OR_UNSAFE_KEY'],
  [JSON.stringify({data:[],unknown:Array.from({length:4100},()=>0)}),'STRICT_DEPTH_OR_NODE_LIMIT'],
  ['{"SYNTHETIC_SECRET":','JSON_SYNTAX_INVALID'],
  ['{"score":0.5,"data":[],"data":[]}','STRICT_VALUE_OR_GRAMMAR_POLICY'],
 ];
 for(const [body,status]of cases){
  const result=inspectSourceLayout('certificate',Buffer.from(body));
  assert.equal(result.jsonStatus,status);assert.equal(result.jsonParsed,false);
  const safeNumeric=status==='STRICT_VALUE_OR_GRAMMAR_POLICY'&&!body.includes('"data":[],"data":[]');
  assert.equal(result.structureParsed,safeNumeric);
  assert.deepEqual(result.recordShapes,safeNumeric?[{path:'data',bounded:true,fields:[],hasExtraFields:false}]:[]);
  assert.equal(result.accountJoinProven,false);
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_SECRET|score|9007199254740992/);
 }
 const accepted=inspectSourceLayout('certificate',Buffer.from(certificate));
 assert.equal(accepted.jsonStatus,'STRICT_ACCEPTED');assert.equal(accepted.jsonParsed,true);
});
test('account diagnostic reports fixed parser statuses and only allowlisted string paths from schema inspection',()=>{
 const accepted=account,decimal='<script type="application/json">{"user":{"username":"SYNTHETIC_SECRET"},"score":0.5}</script>';
 const oversized='<script type="application/json">'+JSON.stringify({unknown:'x'.repeat(65536),user:{username:'SYNTHETIC_SECRET'}})+'</script>';
 const broken='<script type="application/json">{"SYNTHETIC_SECRET":</script>';
 const result=inspectSourceLayout('account',Buffer.from(accepted+decimal+oversized+broken+decimal));
 assert.deepEqual(result.jsonScriptStatuses,['JSON_SYNTAX_INVALID','STRICT_ACCEPTED','STRICT_SIZE_LIMIT','STRICT_VALUE_OR_GRAMMAR_POLICY']);
 assert.deepEqual(result.candidateJsonPaths,['props.pageProps.current_hacker.username','user.username']);
 assert.equal(result.structureParsed,true);
 assert.equal(result.authenticatedAccountControlProven,false);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_SECRET|unknown|score/);
});
test('numeric normalization preserves escaped string content and never converts numeric source fields to strings',()=>{
 const rows={data:[{username:'SYNTHETIC_SECRET_1e3_"\\',certificate_id:'SYNTHETIC_SECRET_ID_0.5',certificate_name:'Python (Basic)',status:1.5}],score:0.5};
 const result=inspectSourceLayout('certificate',Buffer.from(JSON.stringify(rows)));
 assert.equal(result.jsonParsed,false);assert.equal(result.structureParsed,true);
 assert.deepEqual(result.recordShapes,[{path:'data',bounded:true,fields:['username','certificate_id','certificate_name'],hasExtraFields:false}]);
 assert.equal(result.accountJoinProven,false);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_SECRET|1e3|0.5|1.5/);
 const unsafe='{"score":0.5,"user":{"username":"SYNTHETIC_SECRET","__proto__":{}}}';
 const a=inspectSourceLayout('account',Buffer.from('<script type="application/json">'+unsafe+'</script>'));
 assert.equal(a.structureParsed,false);assert.deepEqual(a.candidateJsonPaths,[]);
});
test('runner announces automatic close after both responses even when certificate JSON is rejected',async()=>{
 const previous=process.env.CLEAR_LOCKED;process.env.CLEAR_LOCKED='1';
 try{
  const input=new PassThrough(),browser=fakeBrowser(),messages=[];
  const send=browser.send.bind(browser);
  browser.send=async(name,...args)=>{
   const result=await send(name,...args);
   if(name==='Network.setBypassServiceWorker')setImmediate(()=>{
    events(browser,'account',ACCOUNT_URL,account);
    events(browser,'certificate',certUrl,'{"data":[],"score":0.5}');
   });
   return result;
  };
  const result=await runHackerRankLayout({path:'/synthetic/owned-session'},{input,
   output:message=>{messages.push(message);if(message.includes('ready'))setImmediate(()=>input.write('ready\n'));},
   openClient:async()=>({client:{},close:async()=>{}}),
   openRoute:async()=>({signal:new AbortController().signal,proxyUrl:'http://127.0.0.1:1',close:async()=>{}}),
   launchBrowser:async()=>browser});
  assert.equal(result.layouts.certificate.jsonParsed,false);assert.equal(result.proofVerified,false);
  const notice=messages.findIndex(message=>message.includes('자동으로 닫습니다'));
  assert(notice>messages.findIndex(message=>message.startsWith('인증서 응답 관찰 완료')));
  assert.equal(messages.filter(message=>message.includes('자동으로 닫습니다')).length,1);
  assert.equal(browser.calls.filter(call=>call[0]==='close').length,1);
  assert.doesNotMatch(messages.join('\n'),/SYNTHETIC_SECRET/);
 }finally{if(previous===undefined)delete process.env.CLEAR_LOCKED;else process.env.CLEAR_LOCKED=previous;}
});
test('capture reads no body before ready or for off-route/session traffic and never reads cookies',async()=>{
 const browser=fakeBrowser(),capture=createLayoutCapture({browser,sessionId:'page'});
 events(browser,'before',ACCOUNT_URL,account);assert.equal(browser.calls.length,0);await capture.arm();
 events(browser,'foreign','https://example.org/',account);events(browser,'other',ACCOUNT_URL,account,{sid:'other'});
 events(browser,'query',certUrl+'&extra=1',certificate);await tick();assert.equal(browser.calls.filter(c=>c[0]==='Network.getResponseBody').length,0);
 events(browser,'account',ACCOUNT_URL,account);await tick();events(browser,'certificate',certUrl,certificate);
 const result=await capture.done;await capture.close();
 assert.equal(result.apiAcceptance,'HOLD');assert.equal(result.proofVerified,false);assert.equal(result.requestBound,false);assert.equal(result.paymentAllowed,false);
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_SECRET/);
 assert.deepEqual(browser.calls.filter(c=>c[0]==='Network.getResponseBody').map(c=>c[1].requestId),['account','certificate']);
 assert.ok(!browser.calls.some(c=>/cookie|claim|sign/i.test(c[0])));assert.equal(browser.handlerCount(),0);
});
for(const [label,options]of Object.entries({post:{method:'POST'},redirect:{redirectResponse:{}},status:{status:302},mime:{mimeType:'text/plain'},serviceWorker:{fromServiceWorker:true},diskCache:{fromDiskCache:true}}))test(`capture rejects ${label} before body access`,async()=>{
 const browser=fakeBrowser(),capture=createLayoutCapture({browser,sessionId:'page'});await capture.arm();events(browser,'account',ACCOUNT_URL,account,options);
 await assert.rejects(capture.done,/LAYOUT_CAPTURE_FAILED/);await capture.close();assert.ok(!browser.calls.some(c=>c[0]==='Network.getResponseBody'));
});
test('missing response validation and oversized body fail without raw error output',async()=>{
 for(const oversized of [false,true]){
  const browser=fakeBrowser(),capture=createLayoutCapture({browser,sessionId:'page'});await capture.arm();
  if(oversized)events(browser,'account',ACCOUNT_URL,'x'.repeat(1024*1024+1));
  else{browser.emit('Network.requestWillBeSent',{requestId:'account',request:{url:ACCOUNT_URL,method:'GET'}});browser.emit('Network.loadingFinished',{requestId:'account'});}
  await assert.rejects(capture.done,e=>e.message==='LAYOUT_CAPTURE_FAILED');await capture.close();
 }
});
test('close waits for pending body read, drops its result, and detaches observers',async()=>{
 const browser=fakeBrowser(),original=browser.send.bind(browser);let release,started=false;
 browser.send=async(name,...args)=>{if(name==='Network.getResponseBody'){started=true;return await new Promise(resolve=>{release=()=>resolve({body:account,base64Encoded:false});});}return original(name,...args);};
 const capture=createLayoutCapture({browser,sessionId:'page'});await capture.arm();events(browser,'account',ACCOUNT_URL,account);assert.equal(started,true);
 let settled=false;const closing=capture.close().then(()=>{settled=true;});await tick();assert.equal(settled,false);release();await closing;
 assert.deepEqual(capture.summary().layouts,{});assert.equal(browser.handlerCount(),0);await assert.rejects(capture.done,/LAYOUT_CAPTURE_FAILED/);
});
test('runner cleanup closes every owned transport after ready and terminal close',async()=>{
 const previous=process.env.CLEAR_LOCKED;process.env.CLEAR_LOCKED='1';
 try{
  const input=new PassThrough(),browser=fakeBrowser(),closed=[],messages=[];
  const result=await runHackerRankLayout({path:'/synthetic/owned-session'},{input,output:m=>{messages.push(m);if(m.includes('ready'))setImmediate(()=>input.write('ready\n'));},
   openClient:async()=>({client:{},close:async()=>closed.push('client')}),openRoute:async({allowHost})=>{assert.equal(allowHost('ssl.gstatic.com'),false);return {signal:new AbortController().signal,proxyUrl:'http://127.0.0.1:1',close:async()=>closed.push('route')};},
   launchBrowser:async(_session,{signal})=>{const send=browser.send.bind(browser);browser.send=async(name,...args)=>{signal.throwIfAborted();const r=await send(name,...args);if(name==='Network.setBypassServiceWorker')setImmediate(()=>input.write('close\n'));return r;};return browser;}});
  assert.equal(result.apiAcceptance,'HOLD');assert.deepEqual(closed,['route','client']);assert.equal(browser.calls.filter(c=>c[0]==='close').length,1);assert.equal(browser.handlerCount(),0);
  assert.doesNotMatch(messages.join('\n'),/SYNTHETIC_SECRET/);
  assert.deepEqual(messages.filter(m=>m.startsWith('{')).map(m=>JSON.parse(m)),[{scope:'HACKERRANK_LAYOUT_LOGIN_TRANSPORT',deniedGoogleResources:[{host:'ssl.gstatic.com',category:'GOOGLE_STATIC_CANDIDATE',count:1}]}]);
 }finally{if(previous===undefined)delete process.env.CLEAR_LOCKED;else process.env.CLEAR_LOCKED=previous;}
});
test('runner rejects outside managed worker before transport and redacts connection failures',async()=>{
 const previous=process.env.CLEAR_LOCKED;delete process.env.CLEAR_LOCKED;let called=false;
 try{
  await assert.rejects(runHackerRankLayout({path:'/synthetic'},{openClient:async()=>{called=true;}}),e=>e.message==='LAYOUT_DIAGNOSTIC_FAILED'&&e.phase==='MANAGED_WORKER');assert.equal(called,false);
  process.env.CLEAR_LOCKED='1';await assert.rejects(runHackerRankLayout({path:'/synthetic'},{openClient:async()=>{throw Error('SYNTHETIC_SECRET_TOKEN');}}),e=>e.message==='LAYOUT_DIAGNOSTIC_FAILED'&&e.phase==='ATTESTOR_CONNECT'&&!JSON.stringify(e).includes('SYNTHETIC_SECRET'));
 }finally{if(previous===undefined)delete process.env.CLEAR_LOCKED;else process.env.CLEAR_LOCKED=previous;}
});
test('aborted transport detaches observers without issuing CDP on a closed channel',async()=>{
 const browser=fakeBrowser(),controller=new AbortController(),capture=createLayoutCapture({browser,sessionId:'page',signal:controller.signal});
 await capture.arm();controller.abort();await assert.rejects(capture.done,/LAYOUT_CAPTURE_FAILED/);await capture.close();
 assert.equal(browser.handlerCount(),0);assert.ok(!browser.calls.some(c=>c[0]==='Network.disable'));
});
test('runner attempts remaining cleanup after an owned browser close failure',async()=>{
 const previous=process.env.CLEAR_LOCKED;process.env.CLEAR_LOCKED='1';const closed=[];
 try{
  const input=new PassThrough(),browser=fakeBrowser();browser.close=async()=>{closed.push('browser');throw Error('SYNTHETIC_SECRET_PATH');};
  await assert.rejects(runHackerRankLayout({path:'/synthetic'},{input,output:m=>{if(m.includes('ready'))setImmediate(()=>input.write('close\n'));},
   openClient:async()=>({client:{},close:async()=>closed.push('client')}),openRoute:async()=>({signal:new AbortController().signal,proxyUrl:'http://127.0.0.1:1',close:async()=>closed.push('route')}),launchBrowser:async()=>browser}),e=>e.message==='LAYOUT_CLEANUP_FAILED'&&e.phase==='TRANSPORT_CLEANUP');
  assert.deepEqual(closed,['browser','route','client']);
 }finally{if(previous===undefined)delete process.env.CLEAR_LOCKED;else process.env.CLEAR_LOCKED=previous;}
});
