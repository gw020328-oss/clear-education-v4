import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../product-workflow/fixture.mjs';
import {exampleSourceBinding} from '../../specs/m1/examples.mjs';
import {createRunContext,runContextHash} from '../../src/product-workflow/contract.mjs';
import {readReviewFacts} from '../../src/review-evidence/moodle/facts.mjs';
function setup(){
 const context=createRunContext(fixture().snapshot,'review-run',1);
 const pin={instanceRef:'isolated',courseId:2,forumId:3,postId:4,authorId:5,readerId:6,sourceBinding:exampleSourceBinding(),contextHash:runContextHash(context)};
 const post={id:4,discussionid:7,author:{id:5},subject:'Synthetic',message:'Synthetic text',messageformat:1,timecreated:100,timemodified:101,
  capabilities:{view:true},isdeleted:false,isprivatereply:false};
 let count=0;
 const client={async call(m){
  if(m==='core_webservice_get_site_info')return {userid:6};
  if(m==='mod_forum_get_forums_by_courses')return [{id:3,course:2}];
  if(m==='mod_forum_get_forum_discussions')return {discussions:[{id:4,discussion:7,userid:5}],warnings:[]};
  return {post:structuredClone(post),warnings:[],count:++count};
 }};
 const opts={client,context,pin,getCurrentContext:()=>context,getCurrentPin:()=>pin,now:()=>200000};
 return {opts,post,read:extra=>readReviewFacts({...opts,...extra})};
}
test('source DTO retains existing run/binding revisions with no authority',async()=>{const f=setup(),r=await f.read();assert.equal(r.runContextHash,runContextHash(f.opts.context));assert.equal(r.sourceBinding.accountBindingId,f.opts.pin.sourceBinding.accountBindingId);assert.equal(r.paymentAllowed,false);assert.equal(r.completeness,'TARGET_ONLY_NON_ATOMIC');assert.ok(Object.isFrozen(r.source));});
for(const [name,mutate,error] of [
 ['other author',p=>p.author.id=8,'REVIEW_AUTHOR_MISMATCH'],['hidden',p=>p.capabilities.view=false,'REVIEW_NOT_VISIBLE'],
 ['deleted placeholder',p=>p.isdeleted=true,'REVIEW_NOT_VISIBLE'],['private reply',p=>p.isprivatereply=true,'REVIEW_NOT_VISIBLE'],
 ['wrong discussion',p=>p.discussionid=9,'REVIEW_RESPONSE_SHAPE'],['missing creation',p=>p.timecreated=null,'REVIEW_RESPONSE_SHAPE'],
 ['reverse times',p=>p.timemodified=99,'REVIEW_RESPONSE_SHAPE']])test(name,async()=>{const f=setup();mutate(f.post);await assert.rejects(f.read(),new RegExp(error));});
test('same-second body edit between reads discards all facts',async()=>{const f=setup(),call=f.opts.client.call;let n=0;f.opts.client.call=async(...a)=>{const r=await call(...a);if(r.post&&++n===2)r.post.message='changed';return r;};await assert.rejects(f.read(),/REVIEW_SOURCE_CHANGED/);});
for(const key of ['submissionRevision','routeRevision','workflowRevision'])test('late '+key,async()=>{const f=setup(),next=structuredClone(f.opts.context.snapshot);next[key]++;await assert.rejects(f.read({getCurrentContext:()=>createRunContext(next,'review-run',1)}),/REVIEW_STALE_RUN/);});
test('late policy/run change',async()=>{const f=setup();await assert.rejects(f.read({getCurrentContext:()=>createRunContext(f.opts.context.snapshot,'new-run',2)}),/REVIEW_STALE_RUN/);});
test('mapping change after source calls',async()=>{const f=setup(),p=structuredClone(f.opts.pin);p.sourceBinding.accountBindingVersion='binding.2';await assert.rejects(f.read({getCurrentPin:()=>p}),/REVIEW_STALE_MAPPING/);});
test('mapping must explicitly bind this run',async()=>{const f=setup();f.opts.pin.contextHash='0x'+'1'.repeat(64);await assert.rejects(f.read(),/REVIEW_ACCOUNT_MAPPING/);});
test('missing page/warnings never mean missing review',async()=>{for(const value of [{warnings:[]},{warnings:[{}],discussions:[]}]){const f=setup(),call=f.opts.client.call;f.opts.client.call=(m,...a)=>m==='mod_forum_get_forum_discussions'?value:call(m,...a);await assert.rejects(f.read(),/REVIEW_PAGE_UNAVAILABLE/);}});
test('no visible target is inconclusive',async()=>{const f=setup(),call=f.opts.client.call;f.opts.client.call=(m,...a)=>m==='mod_forum_get_forum_discussions'?{discussions:[],warnings:[]}:call(m,...a);await assert.rejects(f.read(),/REVIEW_TARGET_NOT_IN_VISIBLE_PAGES/);});
test('repeated pages fail and do not loop',async()=>{const f=setup(),call=f.opts.client.call;f.opts.client.call=(m,...a)=>m==='mod_forum_get_forum_discussions'?{discussions:Array.from({length:20},(_,i)=>({id:20+i})),warnings:[]}:call(m,...a);await assert.rejects(f.read(),/REVIEW_PAGE_CHANGED/);});
test('network/access failure propagates without facts',async()=>{for(const code of ['REVIEW_ACCESS','REVIEW_UNAVAILABLE']){const f=setup();f.opts.client.call=()=>{throw Error(code);};await assert.rejects(f.read(),new RegExp(code));}});
test('caller cannot mutate pending pin into new accepted mapping',async()=>{const f=setup(),call=f.opts.client.call;f.opts.client.call=(...a)=>{f.opts.pin.authorId=10;return call(...a);};await assert.rejects(f.read(),/REVIEW_STALE_MAPPING/);});
test('cancel during final current check discards result',async()=>{const f=setup(),c=new AbortController();await assert.rejects(f.read({signal:c.signal,getCurrentPin:()=>{c.abort();return f.opts.pin;}}),/REVIEW_CANCELLED/);});
test('clock bounds fail',async()=>{const f=setup();let n=0;await assert.rejects(f.read({now:()=>++n===1?40000:0}),/REVIEW_CLOCK/);});
