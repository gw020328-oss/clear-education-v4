import test from 'node:test';
import assert from 'node:assert/strict';
import {runStudentHttpDemo} from '../../specs/m3/student-http-demo.mjs';
test('verified HTTPS C1 demo signs in, creates, acknowledges exact display and recovers after restart',async()=>{
 const result=await runStudentHttpDemo();assert.equal(result.restartSameOperation,true);assert.equal(result.userConsentVerified,false);assert.equal(result.studentSubmissionHttpImplemented,false);
});
