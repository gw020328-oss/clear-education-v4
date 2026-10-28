// One happy-path source collection, reusing the existing live fixture/getter.
// No product acceptance, wallet assertion, AI judgement, signer or payment.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {query,collect,php,metrics} from './runtime.mjs';
import {openMoodleSourceSession} from '../../../src/review-evidence/moodle/source-session.mjs';
import {bootcampMoodleRequestHash} from '../../../src/review-evidence/moodle/bootcamp.mjs';
import {p0Hash} from '../../../specs/bootcamp/p0-contract.mjs';
const records=[];let binding;
for(const criterion of ['activity-complete','assignment-submitted','reflection-topics']){
 const request=await query(criterion,{ttlMs:240000});
 const scope={participantId:request.context.participantId,applicationId:request.context.applicationId,policyHash:request.context.policyHash,runtimeMappingHash:request.context.runtimeMappingHash,fixtureReportHash:request.context.fixtureReportHash};
 if(binding)assert.deepEqual(scope,binding);else binding=scope;
 const authority={available:true,requestHash:bootcampMoodleRequestHash(request),pinHash:p0Hash('MOODLE-PIN',request.pin),sourceEpoch:'normal-source-fixture',authExpiresAtMs:request.context.expiresAtMs,rawExpiresAtMs:request.context.issuedAtMs+1800000,queryExpiresAtMs:request.context.expiresAtMs};
 const handle=await openMoodleSourceSession({request,collect,resolveCurrent:()=>authority});
 try{
  const raw=await handle.getRaw();
  if(criterion==='activity-complete'){assert.equal(handle.metadata.facts.completionState,'COMPLETED');assert.equal(handle.metadata.facts.completionMode,'AUTOMATIC');}
  if(criterion==='assignment-submitted')assert.equal(handle.metadata.facts.submissionState,'SUBMITTED');
  if(criterion==='reflection-topics'){assert.equal(raw.id,request.pin.target.selectedPostId);assert.equal(raw.authorId,request.pin.participantMapping.moodleUserId);assert.ok(typeof raw.body==='string'&&raw.body.length>0);assert.ok(handle.metadata.facts.topics.every(t=>t.state==='UNCERTAIN'));}
  records.push({criterion,request,pinHash:handle.metadata.acquisition.pinHash,sourceReceiptHash:handle.metadata.sourceReceiptHash,sourceHash:handle.metadata.sourceHash,facts:handle.metadata.facts,observed:handle.metadata.acquisition.observed,expiresAtMs:handle.expiresAtMs,originalBodyPublished:false});
 }finally{handle.dispose();}
}
const audit=php('credential.php',{action:'audit'});assert.equal(audit.activeTokens,0);
const report={version:'clear-moodle-normal-source-handoff.1',clientDate:'2026-10-19',checkedAtMs:Date.now(),execution:'ACTUAL_LOCAL_API_GENERATED_SYNTHETIC_ACCOUNT',bindingLevel:'SOURCE_FIXTURE_ONLY_NOT_API_ACCEPTANCE',binding,
 walletBinding:'NOT_SUPPLIED_BY_PRODUCT_API',records,metrics,activeTokens:audit.activeTokens,rawHandlesDisposed:true,designatedTargetsDeleted:false,containersStopped:false,modelCalls:0,personalSourceCalls:0,productEvidenceAccepted:false,decisionRecorded:false,transactionSubmitted:false};
await writeFile(new URL('./normal-path-source-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sourceSteps:['activity-COMPLETED','assignment-SUBMITTED','explicit-reflection-body-readable'],sameFixtureApplicationParticipantPolicy:true,walletBinding:'NOT_SUPPLIED_BY_PRODUCT_API',metrics,activeTokens:audit.activeTokens,rawPublished:false,productEvidenceAccepted:false}));
