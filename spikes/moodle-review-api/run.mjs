import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createReviewClient} from '../../src/review-evidence/moodle/client.mjs';
import {readReviewFacts} from '../../src/review-evidence/moodle/facts.mjs';
import {fixture} from '../../tests/product-workflow/fixture.mjs';
import {exampleSourceBinding,exampleBinding,compileExample} from '../../specs/m1/examples.mjs';
import {createRunContext,runContextHash} from '../../src/product-workflow/contract.mjs';
const f=JSON.parse(await readFile(new URL('../../var/moodle-review-api/fixture.json',import.meta.url)));
const rows=[];let stage='START';
async function test(name,fn){stage=name;await fn();rows.push({name,result:'PASS'});console.log('PASS '+name);}
// Write-capable harness only. Consumer client remains read-only and uses a different token.
async function api(who,method,params={}){
 const r=await fetch('http://127.0.0.1:18766/webservice/rest/server.php',{method:'POST',body:new URLSearchParams({wstoken:f.tokens[who],wsfunction:method,moodlewsrestformat:'json',...params}),redirect:'error',signal:AbortSignal.timeout(10000)});
 const v=await r.json();if(v?.exception)throw Error('LAB_API_'+v.errorcode);return v;
}
const client=createReviewClient({tokenProvider:()=>f.tokens.reader});
const carrier=fixture().snapshot;carrier.binding=exampleBinding(compileExample('ybm'));carrier.ruleId='review-accepted';carrier.method='CODE';carrier.fieldIds=[];
const context=createRunContext(carrier,'review-local-source-run',1);
let pin,initial,changed,postId,discussionId;
try{
 await test('synthetic_writer_authenticated',async()=>assert.equal((await api('writer','core_webservice_get_site_info')).userid,f.users.writer));
 await test('create_general_review_by_rest',async()=>{
  const v=await api('writer','mod_forum_add_discussion',{forumid:f.forumId,subject:'Synthetic general course review',message:'<p>Synthetic review: course practice was helpful.</p>'});discussionId=v.discussionid;assert.ok(discussionId);
  const posts=await api('reader','mod_forum_get_discussion_posts',{discussionid:discussionId});postId=posts.posts.find(p=>!p.hasparent).id;
  pin={instanceRef:'isolated-review-api-20261016',courseId:f.courseId,forumId:f.forumId,postId,authorId:f.users.writer,readerId:f.users.reader,
   sourceBinding:exampleSourceBinding(),contextHash:runContextHash(context)};
 });
 const read=(extra={})=>readReviewFacts({client,context,pin,getCurrentContext:()=>context,getCurrentPin:()=>pin,...extra});
 await test('read_actual_post_and_bound_source_facts',async()=>{initial=await read();assert.equal(initial.source.authorId,f.users.writer);assert.match(initial.source.body,/practice was helpful/);assert.equal(initial.paymentAllowed,false);assert.equal(initial.identityVerified,false);});
 await test('reader_token_write_denied',async()=>assert.rejects(api('reader','mod_forum_add_discussion',{forumid:f.forumId,subject:'denied',message:'denied'}),/LAB_API_/));
 await test('other_author_rejected',async()=>{const bad={...pin,authorId:f.users.reader};await assert.rejects(read({pin:bad,getCurrentPin:()=>bad}),/REVIEW_AUTHOR_MISMATCH/);});
 await test('other_course_rejected',async()=>{const bad={...pin,courseId:f.otherCourseId};await assert.rejects(read({pin:bad,getCurrentPin:()=>bad}),/REVIEW_COURSE_FORUM_MISMATCH/);});
 await test('missing_account_mapping_rejected',async()=>{const bad={...pin,sourceBinding:null};await assert.rejects(read({pin:bad}),/MVP_SCHEMA/);});
 await test('unenrolled_reader_access_denied',async()=>{const outside=createReviewClient({tokenProvider:()=>f.tokens.outsider});await assert.rejects(outside.call('mod_forum_get_discussion_post',{postid:postId}),/REVIEW_ACCESS/);outside.close();});
 await test('edit_own_review_by_rest',async()=>{await api('writer','mod_forum_update_discussion_post',{postid:postId,subject:'Synthetic review updated',message:'<p>Synthetic corrected review: more practice needed.</p>'});changed=await read();assert.notEqual(changed.sourceRevision,initial.sourceRevision);assert.match(changed.source.body,/more practice needed/);assert.ok(changed.source.modifiedAt>=initial.source.modifiedAt);});
 await test('hidden_forum_is_unavailable_not_unposted',async()=>{
  const mutate=mode=>execFileSync('docker',['compose','-f',fileURLToPath(new URL('./compose.yml',import.meta.url)),'exec','-T','web','php','/lab-scripts/visibility.php',mode],{stdio:['ignore','pipe','pipe']});
  try{mutate('hide');await assert.rejects(read(),/REVIEW_(ACCESS|COURSE_FORUM_MISMATCH)/);}finally{mutate('show');}
  assert.equal((await read()).sourceRevision,changed.sourceRevision);
 });
 await test('delete_own_review_by_rest',async()=>{const v=await api('writer','mod_forum_delete_post',{postid:postId});assert.equal(v.status,true);});
 await test('deleted_post_not_found_is_not_absence_claim',async()=>{await assert.rejects(client.call('mod_forum_get_discussion_post',{postid:postId}),/REVIEW_NOT_FOUND_OR_UNAVAILABLE/);await assert.rejects(read(),/REVIEW_TARGET_NOT_IN_VISIBLE_PAGES/);});
 await test('invalid_token_separate_from_missing',async()=>{const invalid=createReviewClient({tokenProvider:()=>'0'.repeat(32)});await assert.rejects(invalid.call('core_webservice_get_site_info'),/REVIEW_AUTH/);invalid.close();});
}catch(e){console.log('FAILED '+stage+' '+(String(e.message).match(/^(LAB_API_|REVIEW_|MVP_)[A-Z_a-z0-9]+/)?.[0]??'ASSERTION'));process.exitCode=1;}
finally{client.close();await writeFile(new URL('./report.json',import.meta.url),JSON.stringify({date:'2026-10-16',kind:'ACTUAL_LOCAL_MOODLE_SYNTHETIC_ACCOUNTS',moodleCommit:'215f44380bdc3ccf852a3a22e34f8423ff64033a',cases:rows,complete:!process.exitCode,sourceFieldsObserved:initial?Object.keys(initial.source):[],bodyOrCredentialIncluded:false,productAcceptance:false,paymentAllowed:false},null,2)+'\n');}
