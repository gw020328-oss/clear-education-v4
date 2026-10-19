import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBridgeExample} from '../../specs/m3/review-bridge-example.mjs';
import {bridgeHash,reviewQueryHash,validateReviewAcquisition,reviewAcquisitionHash,moodleSourceRevision} from '../../src/review-evidence/common/contract.mjs';
import {createRunContext} from '../../src/product-workflow/contract.mjs';
import {readReviewFacts} from '../../src/review-evidence/moodle/facts.mjs';
import {readReviewAcquisition} from '../../src/review-evidence/moodle/acquisition.mjs';
function fixture(){
 const f=reviewBridgeExample(),query=structuredClone(f.query),pin=structuredClone(query.pin),s=f.facts.source;
 let currentQuery=query,currentContext=f.context,currentPin=pin,calls=0,posts=0,hook=()=>{},identity={userid:query.pin.readerId};
 const client={async call(method){
  calls++;await hook(method,calls);
  if(method==='core_webservice_get_site_info')return identity;
  if(method==='mod_forum_get_forums_by_courses')return [{id:s.forumId,course:s.courseId}];
  if(method==='mod_forum_get_forum_discussions')return {discussions:[{id:s.id,discussion:s.discussionId,userid:s.authorId}],warnings:[]};
  posts++;return {post:{id:s.id,discussionid:s.discussionId,author:{id:s.authorId},subject:s.subject,message:s.body,messageformat:s.messageFormat,
   timecreated:s.createdAt,timemodified:s.modifiedAt,capabilities:{view:true},isdeleted:false,isprivatereply:false},warnings:[]};
 }};
 const options={client,query,context:f.context,getCurrentQuery:()=>currentQuery,getCurrentContext:()=>currentContext,getCurrentPin:()=>currentPin,now:()=>f.nowMs};
 return {f,options,read:extra=>readReviewAcquisition({...options,...extra}),get calls(){return calls;},get posts(){return posts;},
  setQuery:v=>currentQuery=v,setContext:v=>currentContext=v,setPin:v=>currentPin=v,setIdentity:v=>identity=v,setHook:v=>hook=v};
}
test('same execution issues shared acquisition with observed reader and verbatim HTML; v1 facts unchanged',async()=>{
 const f=fixture(),r=await f.read();
 validateReviewAcquisition(r.acquisition,{facts:r.facts,query:f.options.query});
 const legacy=await readReviewFacts({...f.options,pin:f.options.query.pin});assert.deepEqual(r.facts,legacy);
 assert.equal(r.acquisition.observedReaderId,6);assert.equal(r.acquisition.expectedReaderId,6);
 assert.equal(r.sourceReceiptHash,reviewAcquisitionHash(r.acquisition));assert.equal(r.acquisition.queryHash,reviewQueryHash(f.options.query));
 assert.equal(r.facts.source.body,f.f.facts.source.body);assert.match(r.facts.source.body,/<p>.*<br>/);
 assert.equal(r.acquisition.factsHash,bridgeHash('FACTS',r.facts));assert.equal(r.acquisition.sourceRevision,r.facts.sourceRevision);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.acquisition));assert.equal(r.acquisition.paymentAllowed,false);assert.equal(r.acquisition.usableForAcceptance,false);
 assert.ok(!JSON.stringify(r.acquisition).includes(r.facts.source.body));
});
test('actual wrong site_info reader is rejected rather than copied from expected pin',async()=>{
 const f=fixture();f.setIdentity({userid:999});await assert.rejects(f.read(),/REVIEW_READER_MISMATCH/);assert.equal(f.calls,1);
});
test('missing observed reader fails before source lookup',async()=>{const f=fixture();f.setIdentity({});await assert.rejects(f.read(),/REVIEW_READER_MISMATCH/);assert.equal(f.calls,1);});
for(const field of ['sourceGeneration','attempt','sourceRunId','registryHash'])test('changed query '+field+' at start rejects without API calls',async()=>{
 const f=fixture(),q=structuredClone(f.options.query);q[field]=typeof q[field]==='number'?q[field]+1:field==='registryHash'?bridgeHash('REGISTRY','new'):'new-run';f.setQuery(q);
 await assert.rejects(f.read(),/RB_STALE_QUERY/);assert.equal(f.calls,0);
});
for(const field of ['sourceGeneration','attempt','sourceRunId','registryHash'])test('late query '+field+' rejects successful source read',async()=>{
 const f=fixture(),q=structuredClone(f.options.query);q[field]=typeof q[field]==='number'?q[field]+1:field==='registryHash'?bridgeHash('REGISTRY','new'):'new-run';
 f.setHook((m,n)=>{if(n===5)f.setQuery(q);});await assert.rejects(f.read(),/RB_STALE_QUERY/);assert.equal(f.posts,2);
});
test('wrong current reader pin at start prevents read',async()=>{const f=fixture(),p=structuredClone(f.options.query.pin);p.readerId++;f.setPin(p);await assert.rejects(f.read(),/REVIEW_STALE_MAPPING/);assert.equal(f.calls,0);});
test('query reader pin changes during read invalidate query even with original reader',async()=>{const f=fixture(),q=structuredClone(f.options.query);q.pin.readerId++;f.setHook((m,n)=>{if(n===5)f.setQuery(q);});await assert.rejects(f.read(),/RB_STALE_QUERY/);});
test('query pin bound to another run is rejected',async()=>{const f=fixture();f.options.query.pin.contextHash=bridgeHash('RUN','other');await assert.rejects(f.read(),/RB_RUN/);assert.equal(f.calls,0);});
test('query expiry exact boundary at start prevents API calls',async()=>{const f=fixture();await assert.rejects(f.read({now:()=>f.options.query.expiresAtMs}),/RB_QUERY_EXPIRED/);assert.equal(f.calls,0);});
test('query not yet issued is rejected',async()=>{const f=fixture();await assert.rejects(f.read({now:()=>f.options.query.issuedAtMs-1}),/RB_QUERY_EXPIRED/);assert.equal(f.calls,0);});
test('expiry after facts completion during current resolver prevents issuance',async()=>{
 const f=fixture();let expired=false,queries=0;await assert.rejects(f.read({getCurrentQuery:()=>{if(++queries===3)expired=true;return f.options.query;},now:()=>expired?f.options.query.expiresAtMs:f.f.nowMs}),/RB_QUERY_EXPIRED/);assert.equal(f.posts,2);
});
for(const field of ['submissionRevision','routeRevision','workflowRevision'])test('late context '+field+' discards acquisition',async()=>{
 const f=fixture(),s=structuredClone(f.options.context.snapshot);s[field]++;f.setHook((m,n)=>{if(n===5)f.setContext(createRunContext(s,'new-run',2));});await assert.rejects(f.read(),/REVIEW_STALE_RUN/);
});
test('context mismatch already present blocks API calls',async()=>{const f=fixture();f.setContext(createRunContext(f.options.context.snapshot,'other-run',2));await assert.rejects(f.read(),/REVIEW_STALE_RUN/);assert.equal(f.calls,0);});
test('late current account mapping change discards acquisition',async()=>{const f=fixture(),p=structuredClone(f.options.query.pin);p.sourceBinding.accountBindingVersion='mapping.2';f.setHook((m,n)=>{if(n===5)f.setPin(p);});await assert.rejects(f.read(),/REVIEW_STALE_MAPPING/);});
test('caller mutation cannot replace captured query pin',async()=>{const f=fixture();f.setHook((m,n)=>{if(n===1)f.options.query.pin.authorId++;});await assert.rejects(f.read(),/RB_STALE_QUERY/);});
test('already cancelled read makes no API calls',async()=>{const f=fixture(),c=new AbortController();c.abort();await assert.rejects(f.read({signal:c.signal}),/REVIEW_CANCELLED/);assert.equal(f.calls,0);});
test('cancel after site_info response prevents further lookup',async()=>{const f=fixture(),c=new AbortController();f.setHook(()=>c.abort());await assert.rejects(f.read({signal:c.signal}),/REVIEW_CANCELLED/);assert.equal(f.calls,1);});
test('cancel during final query resolver prevents successful acquisition',async()=>{const f=fixture(),c=new AbortController();let queries=0;await assert.rejects(f.read({signal:c.signal,getCurrentQuery:()=>{if(++queries===3)c.abort();return f.options.query;}}),/REVIEW_CANCELLED/);assert.equal(f.posts,2);});
for(const code of ['REVIEW_AUTH','REVIEW_ACCESS','REVIEW_TIMEOUT','REVIEW_UNAVAILABLE','REVIEW_NOT_FOUND_OR_UNAVAILABLE'])test(code+' never falls back to prior success',async()=>{
 const f=fixture();await f.read();f.setHook(()=>{throw Error(code);});await assert.rejects(f.read(),{message:code});
});
test('missing visible target has no acquisition',async()=>{const f=fixture(),call=f.options.client.call;f.options.client.call=(m,...args)=>m==='mod_forum_get_forum_discussions'?{discussions:[],warnings:[]}:call(m,...args);await assert.rejects(f.read(),/REVIEW_TARGET_NOT_IN_VISIBLE_PAGES/);});
test('page warning has no acquisition',async()=>{const f=fixture(),call=f.options.client.call;f.options.client.call=(m,...args)=>m==='mod_forum_get_forum_discussions'?{discussions:[],warnings:[{}]}:call(m,...args);await assert.rejects(f.read(),/REVIEW_PAGE_UNAVAILABLE/);});
test('malformed source facts reject shared acquisition issuance',async()=>{const f=fixture(),call=f.options.client.call;f.options.client.call=async(...args)=>{const v=await call(...args);if(v.post)v.post.subject='x'.repeat(241);return v;};await assert.rejects(f.read(),/RB_SOURCE_TEXT/);});
test('body or hash tampering after issuance fails shared validation',async()=>{const f=fixture(),r=await f.read();for(const rehash of [false,true]){const facts=structuredClone(r.facts);facts.source.body+=' changed';if(rehash)facts.sourceRevision=moodleSourceRevision(facts.source);assert.throws(()=>validateReviewAcquisition(r.acquisition,{facts,query:f.options.query}),rehash?/RB_ACQUISITION/:/RB_SOURCE_HASH/);}});
test('reader receipt tampering is rejected',async()=>{const f=fixture(),r=await f.read();assert.throws(()=>validateReviewAcquisition({...r.acquisition,observedReaderId:999},{facts:r.facts,query:f.options.query}),/RB_READER/);});
test('clock moving backwards after source completion fails',async()=>{const f=fixture();let reads=0;await assert.rejects(f.read({now:()=>++reads===5?f.f.nowMs-1:f.f.nowMs}),/REVIEW_CLOCK/);});
for(const field of ['courseId','forumId','authorId'])test('wrong captured target pin '+field+' cannot issue',async()=>{
 const f=fixture();f.options.query.pin[field]++;f.setPin(f.options.query.pin);await assert.rejects(f.read(),/REVIEW_(COURSE_FORUM_MISMATCH|AUTHOR_MISMATCH)/);
});
test('deleted placeholder has no acquisition',async()=>{const f=fixture(),call=f.options.client.call;f.options.client.call=async(...args)=>{const v=await call(...args);if(v.post)v.post.isdeleted=true;return v;};await assert.rejects(f.read(),/REVIEW_NOT_VISIBLE/);});
test('same-second changed body discards acquisition',async()=>{const f=fixture(),call=f.options.client.call;let n=0;f.options.client.call=async(...args)=>{const v=await call(...args);if(v.post&&++n===2)v.post.message+=' changed';return v;};await assert.rejects(f.read(),/REVIEW_SOURCE_CHANGED/);});
test('resolver and transport diagnostics do not escape as raw errors',async()=>{for(const resolver of ['getCurrentQuery','getCurrentContext','getCurrentPin']){const f=fixture();await assert.rejects(f.read({[resolver]:()=>{throw Error('private diagnostics');}}),{message:'REVIEW_UNAVAILABLE'});}const f=fixture();f.setHook(()=>{throw Error('private provider details');});await assert.rejects(f.read(),{message:'REVIEW_UNAVAILABLE'});});
test('lease expiry at final issuance boundary discards computed envelope',async()=>{const f=fixture();let reads=0;await assert.rejects(f.read({now:()=>++reads===7?f.options.query.expiresAtMs:f.f.nowMs}),/RB_QUERY_EXPIRED/);assert.equal(f.posts,2);});
