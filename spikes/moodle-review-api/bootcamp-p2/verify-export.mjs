// Offline artifact correlation only. Raw source is intentionally not published.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {p0Hash} from '../../../specs/bootcamp/p0-contract.mjs';
import {createBootcampMoodleRequest,bootcampMoodleRequestHash,bootcampMoodleReceiptHash} from '../../../src/review-evidence/moodle/bootcamp.mjs';
const mapping=JSON.parse(await readFile(new URL('./fixture-mapping.json',import.meta.url))),data=JSON.parse(await readFile(new URL('./source-exports.json',import.meta.url)));
assert.equal(mapping.fixtureReportHash,p0Hash('MOODLE-FIXTURE-REPORT',mapping.report));assert.equal(data.fixtureReportHash,mapping.fixtureReportHash);
const report=mapping.report;
for(const record of data.records){
 const a=record.acquisition,context=a.context,id=context.criterionId,actual=report.targets[record.facts.targetLogicalId];
 const target=id==='reflection-topics'?{targetLogicalId:record.facts.targetLogicalId,cmId:actual.cmId,instanceId:actual.forumId,module:'forum',selectedPostId:record.facts.sourceRecordId}:
  {...actual,targetLogicalId:record.facts.targetLogicalId,module:id==='activity-complete'?'page':'assign',selectedPostId:null};
 const participant=report.participants.find(p=>p.participantId===context.participantId);
 const pin={environmentRef:report.environmentRef,runRef:report.runRef,sourceVersion:report.sourceVersion,apiVersion:report.observedApiVersion,fixtureReportHash:data.fixtureReportHash,courseId:report.actualCourseId,
  participantMapping:{participantId:participant.participantId,applicationId:participant.applicationId,moodleUserId:participant.moodleUserId,accountBindingRef:participant.accountBindingRef,revision:1},target,
  completionSetupReceiptHash:id==='activity-complete'?report.completionSetupReceiptHash:null};
 const request=createBootcampMoodleRequest({context,pin});assert.equal(a.requestHash,bootcampMoodleRequestHash(request));assert.equal(a.pinHash,p0Hash('MOODLE-PIN',pin));
 assert.equal(a.factsHash,p0Hash('MOODLE-FACTS',record.facts));assert.equal(record.receiptHash,bootcampMoodleReceiptHash(a));assert.equal(a.observedReaderId,participant.moodleUserId);
 assert.equal(a.usableForAcceptance,false);assert.equal(a.paymentAllowed,false);
}
console.log(JSON.stringify({result:'PASS',records:data.records.length,fixtureReportHash:data.fixtureReportHash,checks:'ARTIFACT_REQUEST_PIN_FACTS_RECEIPT_CORRELATION',rawSourceRecalculated:false,sourceAuthenticationVerified:false,currentLiveReadinessVerified:false}));
