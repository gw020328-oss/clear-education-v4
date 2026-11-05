import test from 'node:test';
import assert from 'node:assert/strict';
import {normalMoodleReadParameters,normalMoodleReadClient,assertNormalMoodleReadTarget} from '../../tools/bootcamp/normal-moodle-read-policy.mjs';
const requests=[['core_webservice_get_site_info',{}],['core_course_get_contents',{courseid:2}],['core_completion_get_activities_completion_status',{courseid:2,userid:3}],['mod_assign_get_assignments',{'courseids[0]':2}],['mod_assign_get_submission_status',{assignid:1,userid:0}]];
test('old lesson-only target guard reproduces assignment rejection; fixed policy dispatches exact two reads',async()=>{
 let fetches=0;const controller=new AbortController(),reply={lastattempt:{submission:{userid:3,status:'submitted',groupid:0}}};
 const client=normalMoodleReadClient({async call(method,args,signal){fetches++;assert.equal(signal,controller.signal);return reply;}},()=>{});
 for(const [method,args] of requests){const old=method==='core_webservice_get_site_info'||args.courseid===2;
  if(method.startsWith('mod_assign'))assert.equal(old,false);
  assert.doesNotThrow(()=>assertNormalMoodleReadTarget(method,args));assert.equal(await client.call(method,args,controller.signal),reply);
 }
 assert.equal(fetches,5);assert.equal(Object.keys(normalMoodleReadParameters).length,5);
});
test('no arbitrary course, assignment, participant, write, extra key or numeric coercion reaches transport',async()=>{
 let calls=0;const client=normalMoodleReadClient({call(){calls++;}},()=>{});
 for(const [method,args] of [['mod_assign_get_assignments',{'courseids[0]':3}],['mod_assign_get_assignments',{'courseids[0]':2,'courseids[1]':3}],['mod_assign_get_assignments',{'courseids[0]':'2'}],['mod_assign_get_submission_status',{assignid:2,userid:0}],['mod_assign_get_submission_status',{assignid:1,userid:3}],['mod_assign_get_submission_status',{assignid:1,userid:9}],['mod_assign_get_submission_status',{assignid:1,userid:0,groupid:1}],['mod_assign_submit_for_grading',{assignid:1}],['core_webservice_get_site_info',{userid:3}],['core_completion_get_activities_completion_status',{courseid:2,userid:6}]])await assert.rejects(client.call(method,args),/ACTIVITY_READER_TARGET/);
 assert.equal(calls,0);
});
test('existing owner authority callback rejection is retained before/after await',async()=>{
 let current=false,calls=0;const client=normalMoodleReadClient({async call(){calls++;current=false;return{};}},()=>{if(!current)throw Error('CURRENT_AUTHORITY_REVOKED');});
 await assert.rejects(client.call('mod_assign_get_submission_status',{assignid:1,userid:0}),/CURRENT_AUTHORITY_REVOKED/);assert.equal(calls,0);
 current=true;await assert.rejects(client.call('mod_assign_get_submission_status',{assignid:1,userid:0}),/CURRENT_AUTHORITY_REVOKED/);assert.equal(calls,1);
});
test('abort identity propagates and cancellation during read cannot publish metadata',async()=>{
 const stop=new AbortController();const client=normalMoodleReadClient({async call(_m,_a,signal){assert.equal(signal,stop.signal);stop.abort();return{};}},()=>{});
 await assert.rejects(client.call('mod_assign_get_submission_status',{assignid:1,userid:0},stop.signal),/REVIEW_CANCELLED/);
});
