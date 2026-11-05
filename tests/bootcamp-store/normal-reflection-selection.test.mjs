import {readForumTarget} from '../../src/review-evidence/moodle/forum-target.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {reflectionSelection,readReflectionSelection,selectedReflectionTarget,withSelectedReflectionReader} from '../../tools/bootcamp/normal-reflection-selection.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
const time=1800000000,origin='https://127.0.0.1:9477',participantWallet='0x'+'12'.repeat(20);
const selection=()=>({version:'clear-normal-reflection-selection.1',origin,participantWallet,courseId:2,cmId:5,forumId:3,authorId:3,postId:7,discussionId:4,createdAt:time-10,modifiedAt:time-5,observedAt:time,expiresAtExclusive:time+600});
const post=()=>({id:7,discussionid:4,author:{id:3},timecreated:time-10,timemodified:time-5,capabilities:{view:true},isdeleted:false,isprivatereply:false,message:'invented synthetic reflection'});
test('owner selection exact schema, actor, horizon; old report preserved and runtime hash binds new selection',()=>{
 const p=selection(),context={origin,participantWallet,time};assert.deepEqual(reflectionSelection(p,context),p);
 const report={cmId:5,forumId:3,selectedPostId:1},target=selectedReflectionTarget(report,p);
 assert.equal(target.selectedPostId,7);assert.equal(report.selectedPostId,1);assert.deepEqual(selectedReflectionTarget(report,null),report);
 assert.notEqual(p0Hash('RUNTIME-MAPPING',{target,reflectionSelection:p}),p0Hash('RUNTIME-MAPPING',{target,reflectionSelection:{...p,modifiedAt:time-4}}));
 for(const patch of [{authorId:9},{forumId:4},{courseId:4},{cmId:9},{postId:1},{postId:0},{origin:'https://evil.invalid'},{participantWallet:'0x'+'34'.repeat(20)},{modifiedAt:time+1},{expiresAtExclusive:time+3601},{body:'not-accepted'}])assert.throws(()=>reflectionSelection({...p,...patch},context));
 assert.throws(()=>reflectionSelection(p,{...context,time:time-1}));assert.throws(()=>reflectionSelection(p,{...context,time:p.expiresAtExclusive}));
});
test('fixed private file hash is checked before owner preparation; no implicit selection',t=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-reflection-pin-')));t.after(()=>rmSync(directory,{recursive:true,force:true}));const value=JSON.stringify(selection());
 writeFileSync(join(directory,'reflection-selection.json'),value,{mode:0o600});const config={origin,participantWallet,reflectionSelectionSha256:createHash('sha256').update(value).digest('hex')};
 assert.deepEqual(readReflectionSelection(directory,config,time),selection());assert.equal(readReflectionSelection(directory,{origin,participantWallet},time),null);
 writeFileSync(join(directory,'reflection-selection.json'),value+' ');assert.throws(()=>readReflectionSelection(directory,config,time),/SELECTION_CHANGED/);
});
for(const mutation of ['none','post','discussion','author','created','modified','hidden','deleted','private','expired-during-read'])test('formal read enforces selected metadata after await: '+mutation,async()=>{
 let clock=time,calls=0;const pin=selection(),value=post();
 const change={post:()=>value.id++,discussion:()=>value.discussionid++,author:()=>value.author.id++,created:()=>value.timecreated++,modified:()=>value.timemodified++,hidden:()=>value.capabilities.view=false,deleted:()=>value.isdeleted=true,private:()=>value.isprivatereply=true,'expired-during-read':()=>clock=pin.expiresAtExclusive};
 const reader=withSelectedReflectionReader(async use=>use({async call(){calls++;change[mutation]?.();return{post:value,warnings:[]};}}),pin,()=>clock);
 const read=()=>reader(c=>c.call('mod_forum_get_discussion_post',{postid:'7'}));
 if(mutation==='none'){assert.equal((await read()).post,value);await assert.rejects(reader(c=>c.call('mod_forum_get_discussion_post',{postid:'1'})),/SELECTION_CHANGED/);assert.equal(calls,1);}
 else await assert.rejects(read(),/SELECTION_CHANGED|SELECTION_EXPIRED/);
});
test('selection is cloned before publication and body is not inspected or copied by metadata fence',async()=>{
 const p=selection(),response={post:post()};Object.defineProperty(response.post,'message',{get(){throw Error('must not read body in fence');}});
 const reader=withSelectedReflectionReader(async use=>use({call:async()=>response}),p,()=>time);p.postId=99;
 assert.equal(await reader(c=>c.call('mod_forum_get_discussion_post',{postid:7})),response);
});
for(const change of [false,true])test('existing formal forum reader retains course/listing/author and stable second observation: change='+change,async()=>{
 let reads=0;const value={...post(),subject:'Synthetic exercise review',messageformat:1};
 const reader=withSelectedReflectionReader(async use=>use({async call(method){
  if(method==='mod_forum_get_forums_by_courses')return[{id:3,course:2}];
  if(method==='mod_forum_get_forum_discussions')return{discussions:[{id:7,discussion:4,userid:3}],warnings:[]};
  if(method==='mod_forum_get_discussion_post'){reads++;return{post:{...value,timemodified:change&&reads===2?time-4:time-5},warnings:[]};}
  assert.fail('unexpected API');
 }}),selection(),()=>time);
 const read=()=>reader(c=>readForumTarget(c.call,{instanceRef:'synthetic-only',courseId:2,forumId:3,postId:7,authorId:3}));
 if(change)await assert.rejects(read(),/SELECTION_CHANGED/);else{const result=await read();assert.equal(result.id,7);assert.equal(result.forumId,3);assert.equal(reads,2);}
});
