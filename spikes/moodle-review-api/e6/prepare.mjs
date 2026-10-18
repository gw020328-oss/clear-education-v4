import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {randomBytes} from 'node:crypto';
import {fixture,runtime,withReader,writeSource} from './runtime.mjs';import {p0Hash} from '../../../specs/bootcamp/p0-contract.mjs';
const f=await fixture();if(f.selectedPostId)throw Error('E6_ALREADY_PREPARED_NO_RESET');
// Only a generated synthetic body enters this instance. Never output/store a collector copy.
const seed=randomBytes(10).toString('hex');
const body='<p>반복문으로 합계를 구하는 Python 코드를 작성했습니다. '+seed+'<br>문제는 없었지만 빈 목록과 음수를 넣어 결과를 점검했습니다.<br>초기값과 경계 입력을 함께 확인하는 방법을 배웠습니다.</p>';
await withReader(async client=>{
 const id=await client.call('core_webservice_get_site_info');assert.equal(id.userid,f.users.one);assert.equal(String(id.version),'2024100715');
 for(let n=0;n<2;n++)await client.call('mod_assign_get_submission_status',{assignid:f.assignment.instanceId,userid:0});
});
await writeSource('mod_page_view_page',{pageid:f.activity.instanceId});
await writeSource('mod_assign_save_submission',{assignmentid:f.assignment.instanceId,'plugindata[onlinetext_editor][text]':'<p>Synthetic loop '+seed+'</p>','plugindata[onlinetext_editor][format]':1,'plugindata[onlinetext_editor][itemid]':0});
let draft;
await withReader(async c=>{draft=(await c.call('mod_assign_get_submission_status',{assignid:f.assignment.instanceId,userid:0})).lastattempt.submission.status;});assert.equal(draft,'draft');
await writeSource('mod_assign_submit_for_grading',{assignmentid:f.assignment.instanceId,acceptsubmissionstatement:1});
const created=await writeSource('mod_forum_add_discussion',{forumid:f.reflection.forumId,subject:'Python reflection '+seed.slice(0,4),message:body});
let selected,automatic,submitted;
await withReader(async c=>{
 const list=await c.call('mod_forum_get_forum_discussions',{forumid:f.reflection.forumId,page:0,perpage:20});selected=list.discussions.find(d=>d.discussion===created.discussionid&&d.userid===f.users.one)?.id;assert.ok(selected);
 automatic=(await c.call('core_completion_get_activities_completion_status',{courseid:f.courseId,userid:f.users.one})).statuses.find(s=>s.cmid===f.activity.cmId);assert.equal(automatic.state,1);assert.equal(automatic.isautomatic,true);assert.equal(automatic.details[0].rulename,'completionview');
 submitted=(await c.call('mod_assign_get_submission_status',{assignid:f.assignment.instanceId,userid:0})).lastattempt.submission.status;assert.equal(submitted,'submitted');
});
f.selectedPostId=selected;await writeFile(new URL('fixture.json',runtime),JSON.stringify(f),{mode:0o600});
const report={version:'clear-moodle-e6-fixture.1',environmentRef:f.environmentRef,runRef:f.runRef,mappingRevision:1,project:'clear-moodle-e6-20261018',port:18768,sourceVersion:f.sourceVersion,apiVersion:'2024100715',publicSourceCommit:'215f44380bdc3ccf852a3a22e34f8423ff64033a',courseId:f.courseId,activity:f.activity,assignment:f.assignment,reflection:{...f.reflection,selectedPostId:selected},participantMapping:{participantId:'participant-e6-one',applicationId:'application-e6-one',moodleUserId:f.users.one,accountBindingRef:'e6-one-account',revision:1,assurance:'GENERATED_SYNTHETIC_ACCOUNT_NOT_REAL_IDENTITY'},automaticConfiguration:{tracking:automatic.tracking,isAutomatic:automatic.isautomatic,rules:automatic.details.map(d=>d.rulename),assurance:'AUTHENTICATED_API_FIELDS'},completionSetupReceipt:f.setupCompletionConfiguration,completionSetupReceiptHash:p0Hash('E6-SETUP',f.setupCompletionConfiguration),setupAssurance:'OWNED_SETUP_DB_RECEIPT_SEPARATE_FROM_API',preparedAtMs:Date.now(),sourceTimestampRewritten:false,productRuntimeReady:false};
await writeFile(new URL('./mapping-report.json',import.meta.url),JSON.stringify({report,reportHash:p0Hash('E6-FIXTURE-REPORT',report)},null,2)+'\n');
console.log(JSON.stringify({prepared:true,automaticComplete:true,assignmentDraftObserved:draft==='draft',assignmentSubmittedObserved:submitted==='submitted',selectedPostExplicit:true,sourceBodiesPublished:false}));
