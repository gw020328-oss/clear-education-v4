// Run only in an isolated checkout containing the pinned PR71 + PR72 + PR74 commits.
// All source responses and AI observations are public synthetic in-process doubles.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {fixture,mock} from '../../tests/ai-review-precheck/fixture.mjs';
import {readReviewAcquisition} from '../../src/review-evidence/moodle/acquisition.mjs';
import {createLocalReviewProjectionSession} from '../../src/document-precheck/review/local-projection.mjs';
import {createReviewBridgeSession} from '../../src/review-evidence/common/bridge.mjs';
import {HTML_NORMALIZER,PLAIN_NORMALIZER,reviewQueryHash,reviewProjectionHash} from '../../src/review-evidence/common/contract.mjs';
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function scenario(mode){
 const input=fixture({method:'TEXT_AI'}),post=input.submission.posts[0],at=1792195200000,clock={value:at};
 const policy=input.policy.compiled.policy,registry={registryId:'synthetic-composition-map',revision:1,status:'REVIEWED_SYNTHETIC_MAPPING',
  binding:input.context.snapshot.binding,requirementId:input.context.snapshot.requirementId,
  sourceBinding:{institutionId:policy.institutionId,providerInstanceId:'synthetic-moodle',courseId:policy.productId,
   sourceAccountRef:'synthetic-author',accountBindingId:'synthetic-account-map',accountBindingVersion:'mapping.1'},
  locator:{instanceRef:'synthetic-moodle',courseId:2,forumId:3,id:4,authorId:5},readerId:6,postId:post.postId,
  normalizer:mode==='plain'?PLAIN_NORMALIZER:HTML_NORMALIZER,freshness:{basis:'CONTRACT_FIXTURE_ONLY',maxAgeMs:60000},
  audit:{actorRef:'synthetic-host',reason:'offline-composition',recordedAtMs:at-1000}};
 const state={context:input.context,registry,rawAvailable:true,authorizationValid:true,rawExpiresAtMs:at+1800000,
  authorizationExpiresAtMs:at+300000,currentQueryHash:null};
 const host=createReviewBridgeSession({...input,compiled:input.policy.compiled,registry,sourceRunId:'composition-source',sourceGeneration:1,attempt:1,
  rawExpiresAtMs:state.rawExpiresAtMs,authorizationExpiresAtMs:state.authorizationExpiresAtMs,resolveCurrent:()=>state,now:()=>clock.value});
 state.currentQueryHash=reviewQueryHash(host.query);let latest,sourceCalls=0;const observer=mock(input);
 const message=mode==='plain'?post.text:'<p'+(mode==='unsupported'?' hidden':'')+'>'+escape(mode==='changed'?'changed source body':post.text).replaceAll('\n','<br>')+'</p>';
 const apiPost={id:4,discussionid:7,author:{id:5},subject:post.title,message,messageformat:mode==='plain'?2:1,
  timecreated:at/1000-30,timemodified:at/1000-10,capabilities:{view:true},isdeleted:false,isprivatereply:false};
 const client={async call(method){sourceCalls++;
  if(method==='core_webservice_get_site_info')return {userid:6};
  if(mode==='access')throw Error('REVIEW_ACCESS');
  if(method==='mod_forum_get_forums_by_courses')return [{id:3,course:2}];
  if(method==='mod_forum_get_forum_discussions')return {discussions:[{id:4,discussion:7,userid:5}],warnings:[]};
  if(method==='mod_forum_get_discussion_post')return {post:structuredClone(apiPost),warnings:[]};
  throw Error('UNEXPECTED_SYNTHETIC_METHOD');
 }};
 try{
  let acquired;
  try{acquired=await readReviewAcquisition({client,context:input.context,query:host.query,getCurrentQuery:()=>host.query,
    getCurrentContext:()=>state.context,getCurrentPin:()=>host.query.pin,signal:host.signal,now:()=>clock.value});}
  catch(error){assert.equal(mode,'access');assert.equal(error.message,'REVIEW_ACCESS');}
  if(mode==='changed'||mode==='unsupported'||mode==='late-query'){
   if(mode==='late-query')state.currentQueryHash='0x'+'1'.repeat(64);
   assert.throws(()=>host.correlate(acquired),new RegExp(mode==='changed'?'RB_CONTENT_MISMATCH':mode==='unsupported'?'RB_HTML_UNSUPPORTED':'RB_STALE_QUERY'));
   assert.equal(observer.calls,0);assert.equal(host.signal.aborted,true);return {mode,sourceCalls,mockObservations:0,status:'REJECTED_BEFORE_AI'};
  }
  const bound=mode==='access'?host.unavailable():host.correlate(acquired);latest={context:input.context,projection:bound.projection};
  const ai=createLocalReviewProjectionSession(()=>latest,{nowMs:()=>clock.value});
  const result=await ai.review({...input,...bound},observer,{signal:host.signal});
  assert.equal(result.current,true);assert.equal(result.contentStatus,'CHECKED');assert.equal(result.paymentAllowed,false);
  assert.equal(result.sourceProjectionHash,reviewProjectionHash(bound.projection));
  assert.equal(result.sourceReceiptHash,mode==='access'?null:acquired.sourceReceiptHash);
  assert.equal(result.sourceStatus,mode==='access'?'UNAVAILABLE':'OBSERVED_TARGET');
  if(mode==='access')assert.ok(result.reasons.some(r=>r.code==='SOURCE_UNVERIFIED'));
  if(mode==='late-result'){
   latest={context:input.context,projection:host.unavailable().projection};const stale=ai.consume(result);
   assert.equal(stale.current,false);assert.equal(stale.contentStatus,'STALE');
   latest={context:input.context,projection:bound.projection};assert.equal(ai.isCurrent(result),false);
  }else assert.deepEqual(ai.consume(result),result);
  assert.ok(!JSON.stringify(result).includes(post.text));return {mode,sourceCalls,mockObservations:observer.calls,status:mode==='late-result'?'LATE_RECEIPT_STAYS_STALE':'BOUND_WITHOUT_AUTHORITY'};
 }finally{host.close();}
}
export async function runReviewBridgeIntegration(){
 const cases=[];for(const mode of ['html','plain','access','changed','unsupported','late-query','late-result'])cases.push(await scenario(mode));
 return {version:'clear-review-bridge-offline-composition.1',kind:'OFFLINE_SYNTHETIC_MODULE_COMPOSITION',cases,
  actualHttpRequests:0,actualMoodleRetests:0,actualModelCalls:0,paidCalls:0,productAcceptance:false,paymentAllowed:false};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await runReviewBridgeIntegration(),null,2));
