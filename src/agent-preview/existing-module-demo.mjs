// Repository-only adapter. Imports producer code without copying or weakening P0.
import {executePublicDemo,TOPICS} from './index.mjs';
import {validateGroundedReview} from '../document-precheck/review/grounding.mjs';
import {createBootcampMoodleRequest,readBootcampMoodle,validateBootcampMoodleResult,BOOTCAMP_MOODLE_SOURCE} from '../review-evidence/moodle/bootcamp.mjs';
import {P0_POLICY,p0Hash,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
async function moodleDemo(criterionId) {
 const now=1792200000000,c=P0_POLICY.criteria.find(c=>c.criterionId===criterionId),activity=criterionId==='activity-complete';
 const h=k=>p0Hash('PUBLIC-PREVIEW',k);
 const context={participantId:'public-student',applicationId:'public-application',policyHash:p0PolicyHash(P0_POLICY),criterionId,capability:c.capability,evidenceId:'public-evidence',evidenceRevision:1,runtimeMappingHash:h('mapping'),fixtureReportHash:h('fixture'),sourceRunId:'public-run',sourceGeneration:1,attempt:1,issuedAtMs:now-1000,expiresAtMs:now+60000};
 const pin={environmentRef:'public-synthetic',runRef:'public-run',sourceVersion:BOOTCAMP_MOODLE_SOURCE,apiVersion:'2024100715',fixtureReportHash:context.fixtureReportHash,courseId:2,
  participantMapping:{participantId:context.participantId,applicationId:context.applicationId,moodleUserId:6,accountBindingRef:'public-account',revision:1},
  target:{targetLogicalId:c.targetLogicalId,cmId:activity?3:4,instanceId:activity?8:9,module:activity?'page':'assign',selectedPostId:null},completionSetupReceiptHash:activity?h('setup'):null};
 const completion={state:1,timecompleted:1792199990,overrideby:null,hascompletion:true,isautomatic:true,istrackeduser:true,uservisible:true,details:[{rulename:'completionview',rulevalue:{status:1}}]};
 const responses={core_webservice_get_site_info:{userid:6,version:'2024100715'},
  core_course_get_contents:[{modules:[{id:3,instance:8,modname:'page',completion:2,completiondata:completion},{id:4,instance:9,modname:'assign',completion:0}]}],
  core_completion_get_activities_completion_status:{statuses:[{...completion,cmid:3,instance:8,modname:'page',tracking:2}],warnings:[]},
  mod_assign_get_assignments:{courses:[{id:2,assignments:[{id:9,cmid:4,course:2,teamsubmission:0,timemodified:1792199900}]}],warnings:[]},
  mod_assign_get_submission_status:{lastattempt:{submissionsenabled:true,submission:{id:20,userid:6,groupid:0,assignment:9,attemptnumber:0,status:'submitted',timecreated:1792199950,timemodified:1792199990}},warnings:[]}};
 const calls=[],request=createBootcampMoodleRequest({context,pin});
 const result=await readBootcampMoodle({request,client:{async call(method){if(!Object.hasOwn(responses,method))throw Error('REVIEW_READ_ONLY');calls.push(method);return structuredClone(responses[method]);}},
  getCurrentRequest:()=>request,getCurrentContext:()=>context,getCurrentPin:()=>pin,now:()=>now});
 validateBootcampMoodleResult(result,{request,expectedReceiptHash:result.receiptHash,nowMs:now});
 // Do not export the producer's LOCAL_LMS_RECORD acquisition as a live receipt.
 return {module:'review-evidence/moodle/bootcamp',executionMode:'PUBLIC_SYNTHETIC',calls,facts:result.facts,predicate:result.acquisition.sourcePredicate,receiptHash:result.receiptHash,usableForAcceptance:false};
}
export async function executeExistingModuleDemo(plan,draft) {
 const preview=executePublicDemo(plan,draft),modules=[];
 for(const observation of preview.observations) {
  if(observation.tool==='moodle.activity.public'||observation.tool==='moodle.assignment.public') {
   modules.push({conditionId:observation.conditionId,...await moodleDemo(observation.tool==='moodle.activity.public'?'activity-complete':'assignment-submitted')});
  } else if(observation.tool==='reflection.topics.public') {
   const r=observation.record,sourceId='public-reflection';
   const grounded=validateGroundedReview({fields:TOPICS.map((fieldId,i)=>({fieldId,state:'OBSERVED',value:r.quotes[i],evidence:{kind:'TEXT_QUOTE',sourceId,quote:r.quotes[i]},inspectedSourceIds:[sourceId]}))},TOPICS,[{sourceId,kind:'TEXT',text:r.text}]);
   modules.push({conditionId:observation.conditionId,module:'document-precheck/review/grounding',executionMode:'PUBLIC_SYNTHETIC',grounded});
  } else {
   modules.push({conditionId:observation.conditionId,module:null,status:'RECLAIM_SIGNATURE_DEMO_NOT_CONNECTED',executionMode:'PUBLIC_SYNTHETIC'});
  }
 }
 return {...preview,modules,existingModuleCoverage:modules.every(m=>m.module!==null)?'SELECTED_MODULES_EXECUTED':'PARTIAL'};
}
