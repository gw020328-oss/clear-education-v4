import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLocalDiagnostic} from '../../src/ybm-collector/binding.mjs';
import {createCapture} from '../../src/ybm-collector/capture.mjs';
import {endpoints,methods,MAX_HTML_BYTES} from '../../src/ybm-collector/source-policy.mjs';
import {registrationHtml,scoreHtml} from './source-fixture.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
async function until(f){for(let i=0;i<100;i++){if(f())return;await tick();}throw new Error('TEST_TIMEOUT');}
async function setup(t){
 const diagnostic=await prepareLocalDiagnostic(),events=new Map(),calls=[],bodies=new Map();let next=0;
 const browser={on:(method,fn)=>{events.set(method,fn);return()=>events.delete(method);},send:async(method,params={},sessionId)=>{
  calls.push({method,params,sessionId});
  if(method==='Target.getTargets')return {targetInfos:[{targetId:'main',type:'page'}]};
  if(method==='Target.attachToTarget')return {sessionId:params.targetId};
  if(method==='Fetch.getResponseBody')return {body:bodies.get(params.requestId),base64Encoded:false};return {};
 }};
 const controller=new AbortController(),capture=createCapture({browser,collection:diagnostic.collection,signal:controller.signal});
 t.after(async()=>{await capture.close();diagnostic.close();});
 function emit(role,changes={},session='main'){
  const requestId=String(++next);bodies.set(requestId,role==='registration'?registrationHtml():scoreHtml());
  events.get('Fetch.requestPaused')?.({requestId,request:{url:endpoints[role],method:methods[role]},responseStatusCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],...changes},session);return requestId;
 }
 return {diagnostic,events,calls,bodies,browser,capture,controller,emit};
}
test('capture is opt-in, exact response sources only, finishes with both and releases paused requests',async t=>{
 const h=await setup(t);assert.equal(h.events.size,0);assert.equal(h.calls.length,0);await h.capture.arm();
 const enable=h.calls.find(c=>c.method==='Fetch.enable');assert.equal(enable.params.handleAuthRequests,false);assert.deepEqual(enable.params.patterns.map(p=>p.requestStage),['Response','Response']);
 h.emit('score');await until(()=>h.calls.some(c=>c.method==='Fetch.continueRequest'));h.emit('registration');
 const result=await h.capture.done;assert.equal(result.complete,true);assert.equal(result.proofVerified,false);assert.equal(h.capture.summary().bodyReads,2);
 assert.equal(h.calls.filter(c=>c.method==='Fetch.continueRequest').length,2);await h.capture.close();assert.equal(h.events.size,0);
 assert.ok(!h.calls.some(c=>/Network\.|Cookie|Storage/.test(c.method)));
});
for(const request of [{url:endpoints.score+'?extra=1',method:'GET'},{url:'https://evil.example/result/scoreList.php',method:'GET'},{url:endpoints.score,method:'POST'},{url:'https://exam.toeic.co.kr/login.php',method:'POST'}])test('no body read for unmatched URL/method '+request.url+' '+request.method,async t=>{
 const h=await setup(t);await h.capture.arm();h.emit('score',{request});await until(()=>h.calls.some(c=>c.method==='Fetch.continueRequest'));assert.equal(h.capture.summary().bodyReads,0);
});
test('unrelated CDP session cannot inject a source; duplicate requests do not re-read bodies',async t=>{
 const h=await setup(t);await h.capture.arm();h.emit('score',{},'other');await tick();assert.equal(h.capture.summary().bodyReads,0);
 h.emit('score');await until(()=>h.calls.some(c=>c.method==='Fetch.continueRequest'));h.emit('score');await until(()=>h.calls.filter(c=>c.method==='Fetch.continueRequest').length===2);assert.equal(h.capture.summary().bodyReads,1);
});
for(const changes of [{responseStatusCode:302},{responseHeaders:[{name:'Content-Type',value:'application/json'}]},{responseHeaders:[{name:'Content-Type',value:'text/html; charset=euc-kr'}]},{responseHeaders:[{name:'Content-Type',value:'text/html'},{name:'Content-Length',value:String(MAX_HTML_BYTES+1)}]}])test('invalid response metadata aborts before body access '+JSON.stringify(changes),async t=>{
 const h=await setup(t);await h.capture.arm();h.emit('score',changes);await assert.rejects(h.capture.done,/COLLECTION_CHECK_FAILED/);assert.equal(h.capture.summary().bodyReads,0);assert.throws(()=>h.diagnostic.collection.assertActive());
});
test('body size is checked even without content-length and failures never echo raw body',async t=>{
 const h=await setup(t);await h.capture.arm();const original=h.browser.send;h.browser.send=async(m,p,s)=>m==='Fetch.getResponseBody'?{body:'SYNTHETIC_PRIVATE'.repeat(MAX_HTML_BYTES),base64Encoded:false}:original(m,p,s);
 h.emit('score');await assert.rejects(h.capture.done,e=>e.message==='COLLECTION_CHECK_FAILED');
});
test('disconnect while a body read is pending cancels rather than accepting late content',async t=>{
 const h=await setup(t);await h.capture.arm();let release;const original=h.browser.send;
 h.browser.send=async(m,p,s)=>m==='Fetch.getResponseBody'?new Promise(r=>release=r):original(m,p,s);
 h.emit('score');await until(()=>release);h.controller.abort();await assert.rejects(h.capture.done,/COLLECTION_CHECK_FAILED/);release({body:scoreHtml(),base64Encoded:false});await h.capture.close();assert.throws(()=>h.diagnostic.collection.assertActive());
});
test('new popup target uses the same bound collection and only fixed response patterns',async t=>{
 const h=await setup(t);await h.capture.arm();h.events.get('Target.targetCreated')({targetInfo:{targetId:'popup',type:'page'}});await until(()=>h.calls.some(c=>c.method==='Fetch.enable'&&c.sessionId==='popup'));
 h.emit('score');await until(()=>h.capture.summary().bodyReads===1);h.emit('registration',{},'popup');assert.equal((await h.capture.done).complete,true);
});
test('failed request continuation cannot be reported as successful completion',async t=>{
 const h=await setup(t);await h.capture.arm();h.emit('score');await until(()=>h.calls.some(c=>c.method==='Fetch.continueRequest'));
 const original=h.browser.send;h.browser.send=async(m,p,s)=>{if(m==='Fetch.continueRequest')throw new Error('SYNTHETIC_PRIVATE');return original(m,p,s);};h.emit('registration');await assert.rejects(h.capture.done,e=>e.message==='COLLECTION_CHECK_FAILED');
});
