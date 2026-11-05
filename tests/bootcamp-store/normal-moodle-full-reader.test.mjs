import test from 'node:test';
import assert from 'node:assert/strict';
import {normalMoodleFullReadClient,selectNormalMoodleReader} from '../../tools/bootcamp/normal-moodle-full-reader.mjs';
import {readForumTarget} from '../../src/review-evidence/moodle/forum-target.mjs';
const selection={version:'clear-normal-reflection-selection.1',origin:'https://127.0.0.1:9477',participantWallet:'0x0ea0675b3ae1e92d21ca286e5cd050f64f0bbab1',courseId:2,cmId:5,forumId:3,authorId:3,postId:3,discussionId:3,createdAt:100,modifiedAt:100,observedAt:110,expiresAtExclusive:500};
const post={id:3,discussionid:3,author:{id:3},timecreated:100,timemodified:100,capabilities:{view:true},isdeleted:false,isprivatereply:false,subject:'synthetic test',message:'synthetic test',messageformat:1};
test('native full mode cannot silently select legacy environment',()=>{
 const native=()=>{},legacy=()=>{};
 assert.equal(selectNormalMoodleReader({moodleFirst:true,nativeReader:native,legacyReader:legacy}),native);
 assert.throws(()=>selectNormalMoodleReader({moodleFirst:true,legacyReader:legacy}),/NATIVE_READER_REQUIRED/);
 assert.equal(selectNormalMoodleReader({moodleFirst:false,legacyReader:legacy}),legacy);
});
test('real forum adapter works through exact native policy, preserving original signal and response',async()=>{
 const signal=new AbortController().signal;let calls=0;
 const client=normalMoodleFullReadClient({async call(m,_a,s){assert.equal(s,signal);calls++;
  return m==='mod_forum_get_forums_by_courses'?[{id:3,course:2}]:m==='mod_forum_get_forum_discussions'?{discussions:[{id:3,discussion:3,userid:3}],warnings:[]}:{post,warnings:[]};}},()=>{},selection,()=>120);
 const value=await readForumTarget((m,a)=>client.call(m,a,signal),{instanceRef:'test',courseId:2,forumId:3,postId:3,authorId:3});
 assert.equal(value.id,3);assert.equal(calls,4);
});
test('forum policy blocks other course/forum/post, extra fields, paging or coercion before transport',async()=>{
 let calls=0;const c=normalMoodleFullReadClient({call(){calls++;}},()=>{},selection,()=>120);
 for(const [m,a] of [['mod_forum_get_forums_by_courses',{'courseids[0]':'9'}],['mod_forum_get_forum_discussions',{forumid:'9',page:'0',perpage:'20'}],['mod_forum_get_forum_discussions',{forumid:'3',page:'10',perpage:'20'}],['mod_forum_get_forum_discussions',{forumid:'3',page:0,perpage:'20'}],['mod_forum_get_discussion_post',{postid:'1'}],['mod_forum_get_discussion_post',{postid:'3',userid:9}]])await assert.rejects(c.call(m,a),/ACTIVITY_READER_TARGET/);
 assert.equal(calls,0);
});
test('expired selection, changed author/metadata/visibility and revoked owner cannot publish a body',async()=>{
 for(const changed of [{author:{id:9}},{timemodified:101},{capabilities:{view:false}},{isdeleted:true},{isprivatereply:true}]){
  const c=normalMoodleFullReadClient({async call(){return {post:{...post,...changed}};}},()=>{},selection,()=>120);
  await assert.rejects(c.call('mod_forum_get_discussion_post',{postid:'3'}),/SELECTION_CHANGED/);
 }
 let time=120,current=true;
 const c=normalMoodleFullReadClient({async call(){time=500;return {post};}},()=>{if(!current)throw Error('REVOKED');},selection,()=>time);
 await assert.rejects(c.call('mod_forum_get_discussion_post',{postid:'3'}),/SELECTION_EXPIRED/);
 time=120;current=false;await assert.rejects(c.call('mod_forum_get_discussion_post',{postid:'3'}),/REVOKED/);
});
test('forum preserves cancellation identity and rejects cancellation during read',async()=>{
 const stop=new AbortController();const c=normalMoodleFullReadClient({async call(_m,_a,s){assert.equal(s,stop.signal);stop.abort();return{post};}},()=>{},selection,()=>120);
 await assert.rejects(c.call('mod_forum_get_discussion_post',{postid:'3'},stop.signal),/REVIEW_CANCELLED/);
});
