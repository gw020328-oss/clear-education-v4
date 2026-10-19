import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {P0_POLICY,p0PolicyHash,p0Hash} from '../../../specs/bootcamp/p0-contract.mjs';
import {createBootcampMoodleClient,BOOTCAMP_READ_FUNCTIONS} from '../../../src/review-evidence/moodle/bootcamp-client.mjs';
import {createBootcampMoodleRequest,readBootcampMoodle,bootcampMoodleRequestHash,BOOTCAMP_MOODLE_SOURCE} from '../../../src/review-evidence/moodle/bootcamp.mjs';
const dir=new URL('../../../var/moodle-bootcamp-p2/',import.meta.url),f=JSON.parse(await readFile(new URL('fixture.json',dir)));
const reflection=JSON.parse(await readFile(new URL('../../../specs/bootcamp/reflection-example.json',import.meta.url)));
const rows=[];let stage='INIT',counter=0,mapping,fixtureReportHash,posts={},exports=[];
async function test(name,fn){stage=name;await fn();rows.push({name,kind:['old_source_version_is_rejected','expired_request_has_no_success_receipt'].includes(name)?'OFFLINE_GUARD_IN_LIVE_HARNESS':'ACTUAL_LOCAL_API_OR_OWN_FIXTURE',result:'PASS'});console.log('PASS '+name);}
async function api(who,mode,method,args={}){
 const r=await fetch('http://127.0.0.1:18767/webservice/rest/server.php',{method:'POST',body:new URLSearchParams({wstoken:f.tokens[who][mode],wsfunction:method,moodlewsrestformat:'json',...args}),redirect:'error',signal:AbortSignal.timeout(10000)});
 const v=await r.json();if(v?.exception)throw Error('LAB_API_'+v.errorcode);return v;
}
const client=createBootcampMoodleClient({tokenProvider:()=>f.tokens.one.read});
const mutate=mode=>execFileSync('docker',['compose','-f',fileURLToPath(new URL('./compose.yml',import.meta.url)),'exec','-T','web','php','/lab-scripts/mutate.php',mode],{stdio:['ignore','pipe','pipe']});
function request(criterionId,overrides={}){
 const criterion=P0_POLICY.criteria.find(c=>c.criterionId===criterionId),stamp=Date.now();
 const target=criterionId==='activity-complete'?{targetLogicalId:criterion.targetLogicalId,...f.activity,selectedPostId:null}:criterionId==='assignment-submitted'?{targetLogicalId:criterion.targetLogicalId,...f.assignment,module:'assign',selectedPostId:null}:{targetLogicalId:criterion.targetLogicalId,cmId:f.reflection.cmId,instanceId:f.reflection.forumId,module:'forum',selectedPostId:posts.one};
 const context={participantId:'participant-bc-one',applicationId:'application-bc-one',policyHash:p0PolicyHash(P0_POLICY),criterionId,capability:criterion.capability,evidenceId:'source-'+criterionId,evidenceRevision:1,
  runtimeMappingHash:p0Hash('MOODLE-LAB-MAPPING-REFERENCE',{fixtureReportHash,revision:1}),fixtureReportHash,sourceRunId:'bc-source-read-'+(++counter),sourceGeneration:counter,attempt:1,issuedAtMs:stamp,expiresAtMs:stamp+60000};
 return createBootcampMoodleRequest({context,pin:{environmentRef:f.environmentRef,runRef:f.runRef,sourceVersion:BOOTCAMP_MOODLE_SOURCE,apiVersion:'2024100715',fixtureReportHash,courseId:f.courseId,
  participantMapping:{participantId:context.participantId,applicationId:context.applicationId,moodleUserId:f.users.one,accountBindingRef:'bc-one-account-map',revision:1},target,
  completionSetupReceiptHash:criterionId==='activity-complete'?mapping.completionSetupReceiptHash:null,...overrides}});
}
const read=(q,extra={})=>readBootcampMoodle({client,request:q,getCurrentRequest:()=>q,getCurrentContext:()=>q.context,getCurrentPin:()=>q.pin,...extra});
function record(label,r){exports.push({label,criterionId:r.acquisition.context.criterionId,facts:r.facts,acquisition:r.acquisition,receiptHash:r.receiptHash,rawSourceIncluded:false});}
try{
 await test('actual_fixture_course_targets_participant_and_source_version',async()=>{
  const id=await client.call('core_webservice_get_site_info');assert.equal(id.userid,f.users.one);assert.equal(String(id.version),'2024100715');
  const modules=(await client.call('core_course_get_contents',{courseid:f.courseId})).flatMap(s=>s.modules);
  for(const [cmId,instance,module] of [[f.activity.cmId,f.activity.instanceId,'page'],[f.assignment.cmId,f.assignment.instanceId,'assign'],[f.reflection.cmId,f.reflection.forumId,'forum']])assert.ok(modules.some(m=>m.id===cmId&&m.instance===instance&&m.modname===module));
  const activity=modules.find(m=>m.id===f.activity.cmId);assert.equal(activity.completion,2);assert.equal(activity.completiondata.isautomatic,true);assert.equal(activity.completiondata.details[0].rulename,'completionview');
  const setup={assurance:'OWNER_SETUP_DB_RECEIPT_NOT_REST_API',record:f.setupCompletionConfiguration,setupObservedAt:f.setupObservedAt};
  mapping={version:'clear-moodle-bootcamp-fixture-report.1',dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',environmentRef:f.environmentRef,runRef:f.runRef,project:'clear-moodle-bootcamp-p2-20261017',loopbackPort:18767,
   moodleCommit:'215f44380bdc3ccf852a3a22e34f8423ff64033a',sourceVersion:BOOTCAMP_MOODLE_SOURCE,observedApiVersion:String(id.version),observedRelease:id.release,
   policyHash:p0PolicyHash(P0_POLICY),courseLogicalId:P0_POLICY.courseLogicalId,actualCourseId:f.courseId,
   targets:{'python-intro-activity':f.activity,'python-practice-task':f.assignment,'python-reflection':f.reflection},
   participants:['one','two','outsider'].map(label=>({participantId:'participant-bc-'+label,applicationId:'application-bc-'+label,moodleUserId:f.users[label],accountBindingRef:'bc-'+label+'-account-map',enrolled:label!=='outsider',assurance:'OWNER_CREATED_SYNTHETIC_ACCOUNT_NOT_REAL_IDENTITY'})),
   completionSetupReceipt:setup,completionSetupReceiptHash:p0Hash('MOODLE-COMPLETION-SETUP',setup),
   observedCompletionConfiguration:{tracking:activity.completion,isAutomatic:activity.completiondata.isautomatic,ruleNames:activity.completiondata.details.map(d=>d.rulename),assurance:'DIRECT_AUTHENTICATED_REST_FIELDS'},
   readFunctions:BOOTCAMP_READ_FUNCTIONS,writerFunctions:['mod_page_view_page','mod_assign_save_submission','mod_assign_submit_for_grading','mod_forum_add_discussion','mod_forum_update_discussion_post','mod_forum_delete_post'],
   authority:'OWNER_FIXTURE_REPORT_FOR_COMMON_RUNTIME_PINNING',globalP0RuntimeMappingModified:false,productReady:false};
  fixtureReportHash=p0Hash('MOODLE-FIXTURE-REPORT',mapping);
 });
 await test('initialize_source_new_records_before_bound_acquisition',async()=>{
  for(const label of ['one','two']){
   await api(label,'read','core_course_get_contents',{courseid:f.courseId});
   for(let i=0;i<2;i++){const r=await api(label,'read','mod_assign_get_submission_status',{assignid:f.assignment.instanceId,userid:0});assert.ok(!r.lastattempt.submission||r.lastattempt.submission.status==='new');}
  }
 });
 await test('activity_incomplete_with_api_automatic_rule',async()=>{const r=await read(request('activity-complete'));assert.equal(r.facts.completionState,'INCOMPLETE');assert.equal(r.facts.ruleAssurance,'OBSERVED_API_AUTOMATIC_RULE');assert.equal(r.acquisition.sourcePredicate,'NOT_MET');record('activity-incomplete',r);});
 await test('read_token_cannot_mark_view_or_write',async()=>{await assert.rejects(api('one','read','mod_page_view_page',{pageid:f.activity.instanceId}),/LAB_API_/);await assert.rejects(api('one','read','mod_assign_submit_for_grading',{assignmentid:f.assignment.instanceId,acceptsubmissionstatement:1}),/LAB_API_/);});
 await test('page_view_write_causes_system_automatic_complete',async()=>{await api('one','write','mod_page_view_page',{pageid:f.activity.instanceId});const r=await read(request('activity-complete'));assert.equal(r.facts.completionState,'COMPLETED');assert.equal(r.acquisition.sourcePredicate,'MET');assert.equal(r.facts.sourceCompletedAt,null);assert.ok(r.facts.sourceStateModifiedAt);record('activity-completed',r);});
 await test('manual_completion_configuration_is_not_auto_verified',async()=>{try{mutate('manual-activity');const r=await read(request('activity-complete'));assert.equal(r.facts.completionMode,'UNKNOWN');assert.equal(r.acquisition.sourcePredicate,'UNKNOWN');}finally{mutate('automatic-activity');}});
 await test('assignment_no_submission_is_not_submitted',async()=>{const r=await read(request('assignment-submitted'));assert.equal(r.facts.submissionState,'NOT_SUBMITTED');assert.equal(r.acquisition.sourcePredicate,'NOT_MET');record('assignment-none',r);});
 await test('save_online_text_is_draft_not_submitted',async()=>{await api('one','write','mod_assign_save_submission',{assignmentid:f.assignment.instanceId,'plugindata[onlinetext_editor][text]':'<p>Synthetic Python loop practice</p>','plugindata[onlinetext_editor][format]':1,'plugindata[onlinetext_editor][itemid]':0});const r=await read(request('assignment-submitted'));assert.equal(r.facts.submissionState,'DRAFT');assert.equal(r.acquisition.sourcePredicate,'NOT_MET');record('assignment-draft',r);});
 await test('submit_for_grading_is_submitted_without_grade',async()=>{await api('one','write','mod_assign_submit_for_grading',{assignmentid:f.assignment.instanceId,acceptsubmissionstatement:1});const r=await read(request('assignment-submitted'));assert.equal(r.facts.submissionState,'SUBMITTED');assert.equal(r.acquisition.sourcePredicate,'MET');assert.equal(r.facts.sourceSubmittedAt,null);assert.equal(r.facts.gradingRequired,false);record('assignment-submitted',r);});
 await test('other_account_has_no_submission',async()=>{const other=createBootcampMoodleClient({tokenProvider:()=>f.tokens.two.read}),q=request('assignment-submitted'),q2=structuredClone(q);q2.context.participantId='participant-bc-two';q2.context.applicationId='application-bc-two';q2.pin.participantMapping={...q2.pin.participantMapping,participantId:q2.context.participantId,applicationId:q2.context.applicationId,moodleUserId:f.users.two,accountBindingRef:'bc-two-account-map'};const r=await readBootcampMoodle({client:other,request:q2,getCurrentRequest:()=>q2,getCurrentContext:()=>q2.context,getCurrentPin:()=>q2.pin});assert.equal(r.facts.submissionState,'NOT_SUBMITTED');other.close();});
 await test('other_reader_cannot_satisfy_bound_participant',async()=>{const other=createBootcampMoodleClient({tokenProvider:()=>f.tokens.two.read});try{await assert.rejects(read(request('assignment-submitted'),{client:other}),/BCM_READER/);}finally{other.close();}});
 await test('standard_api_other_student_submission_is_denied',async()=>{await assert.rejects(api('two','read','mod_assign_get_submission_status',{assignid:f.assignment.instanceId,userid:f.users.one}),/LAB_API_/);});
 await test('standard_api_other_student_completion_is_denied',async()=>{await assert.rejects(api('two','read','core_completion_get_activities_completion_status',{courseid:f.courseId,userid:f.users.one}),/LAB_API_/);});
 await test('wrong_course_target_is_not_reused',async()=>{await assert.rejects(read(request('activity-complete',{courseId:f.otherCourseId})),/REVIEW_ACCESS|BCM_TARGET_UNAVAILABLE/);});
 await test('outsider_course_access_denied',async()=>{const outsider=createBootcampMoodleClient({tokenProvider:()=>f.tokens.outsider.read});try{await assert.rejects(outsider.call('core_course_get_contents',{courseid:f.courseId}),/REVIEW_ACCESS/);}finally{outsider.close();}});
 await test('create_two_reflections_and_select_exact_own_post',async()=>{
  for(const label of ['one','two']){await api(label,'write','mod_forum_add_discussion',{forumid:f.reflection.forumId,subject:'Synthetic Python reflection '+label,message:'<p>'+reflection.text.replaceAll('\n','<br>')+'</p>'});const v=await api(label,'read','mod_forum_get_forum_discussions',{forumid:f.reflection.forumId,page:0,perpage:20});posts[label]=v.discussions.find(d=>d.userid===f.users[label]).id;}
  const r=await read(request('reflection-topics'));assert.equal(r.facts.sourceRecordId,posts.one);assert.equal(r.source.authorId,f.users.one);assert.ok(r.source.body.includes('for'));assert.ok(r.facts.topics.every(t=>t.state==='UNCERTAIN'));assert.equal(r.acquisition.sourcePredicate,'UNKNOWN');record('reflection-selected',r);
 });
 await test('other_author_selected_post_is_rejected',async()=>{const q=request('reflection-topics');const bad=structuredClone(q);bad.pin.target.selectedPostId=posts.two;await assert.rejects(read(bad),/REVIEW_AUTHOR_MISMATCH/);});
 await test('edit_reflection_changes_source_hash',async()=>{const before=await read(request('reflection-topics'));await api('one','write','mod_forum_update_discussion_post',{postid:posts.one,message:'<p>'+reflection.text.replaceAll('\n','<br>')+'<br>추가 점검했습니다.</p>'});const after=await read(request('reflection-topics'));assert.notEqual(after.acquisition.sourceHash,before.acquisition.sourceHash);assert.notEqual(after.facts.originalBodyHash,before.facts.originalBodyHash);record('reflection-edited',after);});
 await test('hidden_reflection_unavailable_not_missing',async()=>{try{mutate('hide-reflection');await assert.rejects(read(request('reflection-topics')),/BCM_TARGET_UNAVAILABLE|REVIEW_ACCESS|REVIEW_COURSE_FORUM_MISMATCH/);}finally{mutate('show-reflection');}});
 await test('repeat_read_same_request_is_not_new_durable_acceptance',async()=>{const q=request('reflection-topics'),a=await read(q),b=await read(q);assert.equal(a.acquisition.requestHash,b.acquisition.requestHash);assert.equal(a.acquisition.sourceHash,b.acquisition.sourceHash);assert.equal(a.acquisition.usableForAcceptance,false);});
 await test('delete_selected_reflection_has_no_success_receipt',async()=>{await api('one','write','mod_forum_delete_post',{postid:posts.one});await assert.rejects(read(request('reflection-topics')),/REVIEW_TARGET_NOT_IN_VISIBLE_PAGES|REVIEW_NOT_FOUND_OR_UNAVAILABLE/);});
 await test('delete_assignment_has_no_success_receipt',async()=>{mutate('delete-assignment');await assert.rejects(read(request('assignment-submitted')),/BCM_TARGET_UNAVAILABLE|REVIEW_ACCESS/);});
 await test('old_source_version_is_rejected',async()=>{assert.throws(()=>request('activity-complete',{sourceVersion:'moodle-old'}),/BCM_SOURCE_VERSION/);});
 await test('expired_request_has_no_success_receipt',async()=>{const q=request('activity-complete');await assert.rejects(read(q,{now:()=>q.context.expiresAtMs}),/BCM_EXPIRED/);});
}catch(e){console.log('FAILED '+stage+' '+(String(e.message).match(/^(LAB_API_|REVIEW_|BCM_)[A-Z_a-z0-9]+/)?.[0]??'ASSERTION'));process.exitCode=1;}
finally{
 client.close();const completed=!process.exitCode;
 if(mapping)await writeFile(new URL('./fixture-mapping.json',import.meta.url),JSON.stringify({report:mapping,fixtureReportHash},null,2)+'\n');
 await writeFile(new URL('./actual-report.json',import.meta.url),JSON.stringify({date:'2026-10-17',kind:'ACTUAL_ISOLATED_MOODLE_SYNTHETIC_ACCOUNTS',environmentRef:f.environmentRef,runRef:f.runRef,fixtureReportHash:fixtureReportHash??null,cases:rows,actualLocalApiOrFixtureCases:rows.filter(r=>r.kind==='ACTUAL_LOCAL_API_OR_OWN_FIXTURE').length,offlineGuardCases:rows.filter(r=>r.kind==='OFFLINE_GUARD_IN_LIVE_HARNESS').length,complete:completed,failedStage:completed?null:stage,apiWritesBySeparateFixtureHarness:true,productAcceptance:false,paymentAllowed:false},null,2)+'\n');
 await writeFile(new URL('./source-exports.json',import.meta.url),JSON.stringify({kind:'ACTUAL_LOCAL_API_NORMALIZED_FACTS_AND_RECEIPTS_NO_RAW',fixtureReportHash:fixtureReportHash??null,records:exports},null,2)+'\n');
}
