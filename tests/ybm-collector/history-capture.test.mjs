import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapture} from '../../src/ybm-collector/history-capture.mjs';
import {endpoints} from '../../src/ybm-collector/source-policy.mjs';
import {scoreHtml} from './source-fixture.mjs';
test('history opt-in captures only exact score GET and never registration or unrelated bodies',async()=>{
 const events=new Map(),calls=[];let active=false;
 const browser={on:(m,f)=>{events.set(m,f);return()=>events.delete(m);},send:async(m,p)=>{calls.push({m,p});if(m==='Target.getTargets')return {targetInfos:[{targetId:'page',type:'page'}]};if(m==='Target.attachToTarget')return {sessionId:'page'};if(m==='Fetch.getResponseBody')return {body:scoreHtml(),base64Encoded:false};return {};}};
 const collection={start(){active=true;},assertActive(){assert.ok(active);}};
 const cap=createCapture({browser,collection,extractionFactory:()=>({accept:()=>({complete:true}),close(){}})});
 try{assert.equal(calls.length,0);await cap.arm();assert.deepEqual(calls.find(c=>c.m==='Fetch.enable').p.patterns,[{urlPattern:endpoints.score,requestStage:'Response'}]);
 const emit=(url,method)=>events.get('Fetch.requestPaused')({requestId:'synthetic',request:{url,method},responseStatusCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}]},'page');
 for(const [u,m] of [[endpoints.registration,'POST'],[endpoints.score+'?page=1','GET'],[endpoints.score,'POST']]){emit(u,m);await new Promise(r=>setImmediate(r));assert.equal(cap.summary().bodyReads,0);}
 emit(endpoints.score,'GET');assert.equal((await cap.done).complete,true);assert.equal(cap.summary().bodyReads,1);
 }finally{await cap.close();}assert.equal(events.size,0);
});
