// Real read transport, invented token/fetch only. No network or learner data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {withSelectedReflectionReader} from '../../tools/bootcamp/normal-reflection-selection.mjs';
import {createPinnedReadTransport} from '../../src/review-evidence/moodle/readonly-transport.mjs';
const deferred=()=>Promise.withResolvers();
const time=1800000000,pin={version:'clear-normal-reflection-selection.1',origin:'https://127.0.0.1:9477',participantWallet:'0x'+'12'.repeat(20),courseId:2,cmId:5,forumId:3,authorId:3,postId:7,discussionId:4,createdAt:time-10,modifiedAt:time-5,observedAt:time,expiresAtExclusive:time+600};
const response={post:{id:7,discussionid:4,author:{id:3},timecreated:time-10,timemodified:time-5,capabilities:{view:true},isdeleted:false,isprivatereply:false},warnings:[]};
for(const selected of [false,true])for(const phase of ['normal','pre-abort','token-await','fetch-await'])test((selected?'selected':'control')+' preserves cancellation: '+phase,async t=>{
 const entered=deferred(),token=deferred(),fetched=deferred(),releaseFetch=deferred(),controller=new AbortController();let fetches=0;
 const client=createPinnedReadTransport({baseUrl:'https://synthetic.invalid',parameters:{mod_forum_get_discussion_post:['postid']},tokenProvider:()=>{entered.resolve();return phase==='token-await'?token.promise:'a'.repeat(32);},fetchImpl:async(_url,options)=>{
  fetches++;fetched.resolve();if(phase==='fetch-await')await releaseFetch.promise;
  if(phase==='fetch-await')assert.equal(options.signal.aborted,true);
  return new Response(JSON.stringify(response),{status:200});
 }});t.after(()=>client.close());
 const reader=withSelectedReflectionReader(use=>use(client),selected?pin:null,()=>time);
 if(phase==='pre-abort')controller.abort();
 const pending=reader(c=>c.call('mod_forum_get_discussion_post',{postid:7},controller.signal));
 const checked=phase==='normal'?pending:assert.rejects(pending,/REVIEW_CANCELLED/);
 if(phase==='token-await'){await entered.promise;controller.abort();token.resolve('a'.repeat(32));}
 if(phase==='fetch-await'){await fetched.promise;controller.abort();releaseFetch.resolve();}
 const result=await checked;
 if(phase==='normal')assert.deepEqual(result,response);
 assert.equal(fetches,['normal','fetch-await'].includes(phase)?1:0);
});
test('selected fence forwards exact caller signal and rejects abort during metadata await even if client ignores it',async()=>{
 const controller=new AbortController();let captured;
 const reader=withSelectedReflectionReader(use=>use({async call(_method,_args,signal){captured=signal;controller.abort();return response;}}),pin,()=>time);
 await assert.rejects(reader(c=>c.call('mod_forum_get_discussion_post',{postid:7},controller.signal)),/REVIEW_CANCELLED/);
 assert.equal(captured,controller.signal);
});
