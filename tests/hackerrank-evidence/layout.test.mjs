import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {setImmediate as tick} from 'node:timers/promises';
import {inspectSourceLayout} from '../../src/hackerrank-evidence/layout-review.mjs';
import {createLayoutCapture} from '../../src/hackerrank-evidence/layout-capture.mjs';
import {runHackerRankLayout} from '../../src/hackerrank-evidence/layout-run.mjs';
import {ACCOUNT_URL,CERTIFICATE_URL} from '../../src/hackerrank-evidence/recipes.mjs';
const account='<script type="application/json">{"props":{"pageProps":{"current_hacker":{"username":"SYNTHETIC_SECRET_USER"}}},"SYNTHETIC_SECRET_KEY":{"username":"SYNTHETIC_SECRET_USER"}}</script>';
const certificate=JSON.stringify({data:[{username:'SYNTHETIC_SECRET_USER',certificate_id:'SYNTHETIC_SECRET_ID',certificate_name:'SYNTHETIC_SECRET_NAME',status:'SYNTHETIC_SECRET_STATUS',other:'SYNTHETIC_SECRET_EXTRA'}]});
const certUrl=CERTIFICATE_URL+'?username=SYNTHETIC_SECRET_USER';
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
   openClient:async()=>({client:{},close:async()=>closed.push('client')}),openRoute:async()=>({signal:new AbortController().signal,proxyUrl:'http://127.0.0.1:1',close:async()=>closed.push('route')}),
   launchBrowser:async(_session,{signal})=>{const send=browser.send.bind(browser);browser.send=async(name,...args)=>{signal.throwIfAborted();const r=await send(name,...args);if(name==='Network.setBypassServiceWorker')setImmediate(()=>input.write('close\n'));return r;};return browser;}});
  assert.equal(result.apiAcceptance,'HOLD');assert.deepEqual(closed,['route','client']);assert.equal(browser.calls.filter(c=>c[0]==='close').length,1);assert.equal(browser.handlerCount(),0);
  assert.doesNotMatch(messages.join('\n'),/SYNTHETIC_SECRET/);
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
