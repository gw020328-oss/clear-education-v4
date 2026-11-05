import test from 'node:test';import assert from 'node:assert/strict';
import {normalMoodleFullReadClient,normalMoodleFullReadParameters} from '../../tools/bootcamp/normal-moodle-full-reader.mjs';
import {createPinnedReadTransport} from '../../src/review-evidence/moodle/readonly-transport.mjs';
import {createNormalMoodleReaderDiagnostics} from '../../tools/bootcamp/normal-moodle-reader-diagnostics.mjs';
const selection={version:'clear-normal-reflection-selection.1',origin:'https://127.0.0.1:9477',participantWallet:'0x0ea0675b3ae1e92d21ca286e5cd050f64f0bbab1',courseId:2,cmId:5,forumId:3,authorId:3,postId:3,discussionId:3,createdAt:100,modifiedAt:100,observedAt:110,expiresAtExclusive:500};
const token='a'.repeat(32);
function make(fetchImpl){const transport=createPinnedReadTransport({baseUrl:'https://fixed.invalid',parameters:normalMoodleFullReadParameters,tokenProvider:()=>token,fetchImpl});const diagnostic=createNormalMoodleReaderDiagnostics();return{transport,diagnostic,client:diagnostic.wrap(normalMoodleFullReadClient(transport,()=>{},selection,()=>120))};}
test('real full reader plus pinned transport accept first methods and typed params without network',async()=>{
 const stop=new AbortController();let calls=0;
 const f=make(async(_url,opts)=>{calls++;assert(opts.signal instanceof AbortSignal);assert(!opts.signal.aborted);assert.equal(opts.body.get('wstoken'),token);
  const method=opts.body.get('wsfunction');assert(['core_webservice_get_site_info','core_course_get_contents','core_completion_get_activities_completion_status'].includes(method));
  if(method==='core_course_get_contents')assert.equal(opts.body.get('courseid'),'2');if(method.includes('completion_status'))assert.equal(opts.body.get('userid'),'3');
  return Response.json({synthetic:true});});
 try{for(const [m,args] of [['core_webservice_get_site_info',{}],['core_course_get_contents',{courseid:2}],['core_completion_get_activities_completion_status',{courseid:2,userid:3}]])assert.deepEqual(await f.client.call(m,args,stop.signal),{synthetic:true});
 assert.equal(calls,3);assert.deepEqual(f.diagnostic.snapshot(),[]);}finally{f.transport.close();}
});
test('fixed HTTP status and original allowed cause survive failure without private error text',async()=>{
 for(const status of [403,409,500]){const f=make(async()=>new Response('private source body',{status}));try{
 await assert.rejects(f.client.call('core_webservice_get_site_info'),e=>e.httpStatus===status&&e.cause instanceof Error);
 const [d]=f.diagnostic.snapshot();assert.equal(d.httpStatus,status);assert(!JSON.stringify(d).includes('private'));assert(!JSON.stringify(d).includes(token));
 }finally{f.transport.close();}}
 const f=make(async()=>{throw Object.assign(Error('secret URL query body'),{code:'ECONNREFUSED'});});
 try{await assert.rejects(f.client.call('core_webservice_get_site_info'),/REVIEW_UNAVAILABLE/);const [d]=f.diagnostic.snapshot();assert.equal(d.causes[0].code,'ECONNREFUSED');assert(!JSON.stringify(d).includes('secret'));}finally{f.transport.close();}
});
test('cancellation remains rejection and malformed JSON status is retained',async()=>{
 const stop=new AbortController();const f=make(async()=>{stop.abort();throw Error('private');});
 try{await assert.rejects(f.client.call('core_webservice_get_site_info',{},stop.signal),/REVIEW_CANCELLED/);}finally{f.transport.close();}
 const j=make(async()=>new Response('not json',{status:200}));try{await assert.rejects(j.client.call('core_webservice_get_site_info'),/REVIEW_UNAVAILABLE/);assert.equal(j.diagnostic.snapshot()[0].httpStatus,200);}finally{j.transport.close();}
});
test('diagnostics cannot replace original error, execute getter, or grow beyond fixed cap',async()=>{
 let getterRead=false;const error=Error('private');Object.defineProperty(error,'httpStatus',{get(){getterRead=true;return 500;}});
 const d=createNormalMoodleReaderDiagnostics(()=>{throw Error('persist failed');});const c=d.wrap({async call(){throw error;}});
 for(let n=0;n<20;n++)await assert.rejects(c.call('private method'),e=>e===error);
 assert.equal(getterRead,false);assert.equal(d.snapshot().length,16);assert(d.snapshot().every(e=>e.method==='UNSUPPORTED_METHOD'&&e.httpStatus===null));
});
