// Producer-owned internal read contract. Not the product runtime schema/ledger.
import {exactKeys,freeze,requireRule as check} from '../../policy/values.mjs';
import {identifier,hash32} from '../../product-workflow/contract.mjs';
import {P0_POLICY,P0_GATES,p0PolicyHash,p0Hash} from '../../../specs/bootcamp/p0-contract.mjs';
import {readForumTarget} from './forum-target.mjs';
const h=(kind,value)=>p0Hash('MOODLE-'+kind,value);
const pos=v=>check(Number.isSafeInteger(v)&&v>0,'BCM_ID');
const epochMs=v=>check(Number.isSafeInteger(v)&&v>=0&&v<=4102444800000,'BCM_CLOCK');
export const BOOTCAMP_MOODLE_SOURCE='moodle-4.5.15-215f4438';
const maxAgeMs=q=>(q.version==='clear-moodle-bootcamp-read.2-review900'?900:P0_POLICY.time.maxMoodleObservationAgeSeconds)*1000;
function validate(q){
 exactKeys(q,['version','context','pin'],'BCM_REQUEST');check(['clear-moodle-bootcamp-read.1','clear-moodle-bootcamp-read.2-review900'].includes(q.version),'BCM_VERSION');
 const c=q.context,p=q.pin;
 exactKeys(c,['participantId','applicationId','policyHash','criterionId','capability','evidenceId','evidenceRevision','runtimeMappingHash','fixtureReportHash','sourceRunId','sourceGeneration','attempt','issuedAtMs','expiresAtMs'],'BCM_CONTEXT');
 for(const k of ['participantId','applicationId','criterionId','evidenceId','sourceRunId'])identifier(c[k]);
 for(const k of ['evidenceRevision','sourceGeneration','attempt'])pos(c[k]);
 for(const k of ['policyHash','runtimeMappingHash','fixtureReportHash'])hash32(c[k]);
 check(c.policyHash===p0PolicyHash(P0_POLICY),'BCM_POLICY');
 const criterion=P0_POLICY.criteria.find(r=>r.criterionId===c.criterionId);
 check(criterion&&criterion.source!=='RECLAIM_HACKERRANK'&&criterion.capability===c.capability,'BCM_CAPABILITY');
 epochMs(c.issuedAtMs);epochMs(c.expiresAtMs);check(c.expiresAtMs>c.issuedAtMs&&c.expiresAtMs-c.issuedAtMs<=maxAgeMs(q),'BCM_LEASE');
 exactKeys(p,['environmentRef','runRef','sourceVersion','apiVersion','fixtureReportHash','courseId','participantMapping','target','completionSetupReceiptHash'],'BCM_PIN');
 for(const k of ['environmentRef','runRef'])identifier(p[k]);
 check(p.sourceVersion===BOOTCAMP_MOODLE_SOURCE,'BCM_SOURCE_VERSION');
 check(p.apiVersion==='2024100715','BCM_SOURCE_VERSION');check(p.fixtureReportHash===c.fixtureReportHash,'BCM_MAPPING');pos(p.courseId);
 exactKeys(p.participantMapping,['participantId','applicationId','moodleUserId','accountBindingRef','revision'],'BCM_MAPPING');
 check(p.participantMapping.participantId===c.participantId&&p.participantMapping.applicationId===c.applicationId,'BCM_MAPPING');
 pos(p.participantMapping.moodleUserId);pos(p.participantMapping.revision);identifier(p.participantMapping.accountBindingRef);
 exactKeys(p.target,['targetLogicalId','cmId','instanceId','module','selectedPostId'],'BCM_TARGET');
 check(p.target.targetLogicalId===criterion.targetLogicalId,'BCM_TARGET');pos(p.target.cmId);pos(p.target.instanceId);
 check(p.target.module===({'activity-complete':'page','assignment-submitted':'assign','reflection-topics':'forum'})[c.criterionId],'BCM_UNSUPPORTED');
 if(c.criterionId==='reflection-topics')pos(p.target.selectedPostId);else check(p.target.selectedPostId===null,'BCM_TARGET');
 if(c.criterionId==='activity-complete')hash32(p.completionSetupReceiptHash);else check(p.completionSetupReceiptHash===null,'BCM_PIN');
 return criterion;
}
export function createBootcampMoodleRequest({context,pin,version='clear-moodle-bootcamp-read.1'}){const q=structuredClone({version,context,pin});validate(q);return freeze(q);}
export const bootcampMoodleRequestHash=q=>{validate(q);return h('REQUEST',q);};
export const bootcampMoodleReceiptHash=r=>h('RECEIPT',r);
function uniqueRows(rows,key){check(Array.isArray(rows)&&rows.length<=200,'BCM_RESPONSE');check(rows.every(x=>x&&Number.isSafeInteger(x[key]))&&new Set(rows.map(x=>x[key])).size===rows.length,'BCM_DUPLICATE');return rows;}
function warnings(v){check(Array.isArray(v?.warnings)&&v.warnings.length===0,'BCM_PAGE_UNAVAILABLE');}
function sourceTime(v){check(Number.isSafeInteger(v)&&v>=0,'BCM_SOURCE_TIME');return v||null;}
function completion(s){return {cmId:s.cmid,instanceId:s.instance,module:s.modname,state:s.state,tracking:s.tracking,apiTimeCompleted:s.timecompleted,overrideBy:s.overrideby??null,
 hasCompletion:s.hascompletion??null,automatic:s.isautomatic??null,tracked:s.istrackeduser??null,visible:s.uservisible??null,
 rules:Array.isArray(s.details)?s.details.map(d=>({name:d.rulename,state:d.rulevalue?.status})):null};}
async function snapshot(call,q){
 const p=q.pin,t=p.target,criterion=q.context.criterionId;
 const sections=await call('core_course_get_contents',{courseid:p.courseId});check(Array.isArray(sections)&&sections.length<=100,'BCM_PAGE_UNAVAILABLE');
 const modules=uniqueRows(sections.flatMap(s=>{check(Array.isArray(s.modules),'BCM_PAGE_UNAVAILABLE');return s.modules;}),'id');
 const module=modules.find(m=>m.id===t.cmId);check(module&&module.instance===t.instanceId&&module.modname===t.module,'BCM_TARGET_UNAVAILABLE');
 if(criterion==='activity-complete'){
  const result=await call('core_completion_get_activities_completion_status',{courseid:p.courseId,userid:p.participantMapping.moodleUserId});warnings(result);
  const row=uniqueRows(result.statuses,'cmid').find(s=>s.cmid===t.cmId);check(row&&row.instance===t.instanceId&&row.modname===t.module,'BCM_TARGET_UNAVAILABLE');
  const state=completion(row),metadata=module.completiondata;
  check(!metadata||h('COMPLETION',completion({...metadata,cmid:t.cmId,instance:t.instanceId,modname:t.module,tracking:module.completion}))===h('COMPLETION',state),'BCM_SOURCE_CHANGED');
  sourceTime(state.apiTimeCompleted);
  const auto=Boolean(metadata)&&state.tracking===2&&state.automatic===true&&state.tracked===true&&state.visible===true&&state.hasCompletion===true
   &&state.overrideBy===null&&Array.isArray(state.rules)&&state.rules.length===1&&state.rules[0].name==='completionview'&&[0,1].includes(state.rules[0].state);
  const completionState=auto&&state.state===1?'COMPLETED':auto&&state.state===0?'INCOMPLETE':'UNKNOWN';
  return {raw:state,facts:{completionState,completionMode:auto?'AUTOMATIC':'UNKNOWN',completionRuleHash:auto?h('COMPLETION-RULE',{tracking:2,ruleNames:['completionview']}):null,
   ruleAssurance:auto?'OBSERVED_API_AUTOMATIC_RULE':'UNKNOWN',setupConfigurationReceiptHash:p.completionSetupReceiptHash,
   sourceCompletedAt:null,sourceStateModifiedAt:sourceTime(state.apiTimeCompleted),sourceTimeSemantics:'API_TIMECOMPLETED_IS_RECORD_LAST_MODIFIED_NOT_FIRST_COMPLETION'},
   sourcePredicate:completionState==='COMPLETED'?'MET':completionState==='INCOMPLETE'?'NOT_MET':'UNKNOWN'};
 }
 if(criterion==='assignment-submitted'){
  const inventory=await call('mod_assign_get_assignments',{'courseids[0]':p.courseId});warnings(inventory);
  const course=uniqueRows(inventory.courses,'id').find(c=>c.id===p.courseId);check(course,'BCM_TARGET_UNAVAILABLE');
  const a=uniqueRows(course.assignments,'id').find(a=>a.id===t.instanceId);
  check(a&&a.course===p.courseId&&a.cmid===t.cmId,'BCM_TARGET_UNAVAILABLE');check(a.teamsubmission===0,'BCM_UNSUPPORTED');
  const result=await call('mod_assign_get_submission_status',{assignid:t.instanceId,userid:0});warnings(result);
  const attempt=result.lastattempt;check(attempt&&typeof attempt.submissionsenabled==='boolean','BCM_RESPONSE');
  const s=attempt.submission;
  if(!s)return {raw:{assignmentId:a.id,cmId:a.cmid,assignmentModifiedAt:a.timemodified,submission:null},facts:{submissionState:'NOT_SUBMITTED',sourceSubmittedAt:null,sourceCreatedAt:null,sourceModifiedAt:null,submissionId:null,attemptNumber:null,gradingRequired:false},sourcePredicate:'NOT_MET'};
  check(s.userid===p.participantMapping.moodleUserId&&s.groupid===0&&(!Object.hasOwn(s,'assignment')||s.assignment===t.instanceId),'BCM_PARTICIPANT');
  pos(s.id);check(Number.isSafeInteger(s.attemptnumber)&&s.attemptnumber>=0,'BCM_RESPONSE');
  const created=sourceTime(s.timecreated),modified=sourceTime(s.timemodified);check(created&&modified&&modified>=created,'BCM_SOURCE_TIME');
  const submissionState=({submitted:'SUBMITTED',draft:'DRAFT',new:'NOT_SUBMITTED'})[s.status]??'UNKNOWN';
  const raw={assignmentId:a.id,cmId:a.cmid,assignmentModifiedAt:a.timemodified,submission:{id:s.id,userid:s.userid,state:s.status,attemptNumber:s.attemptnumber,createdAt:created,modifiedAt:modified}};
  return {raw,facts:{submissionState,sourceSubmittedAt:null,sourceCreatedAt:created,sourceModifiedAt:modified,submissionId:s.id,attemptNumber:s.attemptnumber,gradingRequired:false,
   sourceTimeSemantics:'MODIFIED_IS_NOT_DEDICATED_SUBMITTED_AT'},sourcePredicate:submissionState==='SUBMITTED'?'MET':submissionState==='UNKNOWN'?'UNKNOWN':'NOT_MET'};
 }
 const raw=await readForumTarget(call,{instanceRef:p.environmentRef,courseId:p.courseId,forumId:t.instanceId,postId:t.selectedPostId,authorId:p.participantMapping.moodleUserId});
 return {raw,facts:{sourceRecordId:raw.id,originalBodyHash:h('REFLECTION-BODY',raw.body),originalTitleHash:h('REFLECTION-TITLE',raw.subject),authorAccountId:raw.authorId,courseId:raw.courseId,forumId:raw.forumId,createdAt:raw.createdAt,modifiedAt:raw.modifiedAt,visibility:'AUTHENTICATED_PARTICIPANT_ONLY',
  topics:P0_POLICY.criteria[2].predicate.topics.map(topicId=>({topicId,state:'UNCERTAIN',reason:'TEXT_REVIEW_NOT_RUN'}))},sourcePredicate:'UNKNOWN'};
}
export async function readBootcampMoodle({client,request,getCurrentRequest,getCurrentContext,getCurrentPin,signal,now=()=>Date.now()}){
 const q=freeze(structuredClone(request)),criterion=validate(q),requestHash=bootcampMoodleRequestHash(q);
 check([getCurrentRequest,getCurrentContext,getCurrentPin,now].every(f=>typeof f==='function')&&typeof client?.call==='function','BCM_CURRENT_REQUIRED');
 const cancelled=()=>check(!signal?.aborted,'REVIEW_CANCELLED');let last=-1;
 const clock=()=>{const n=now();epochMs(n);check(n>=last,'BCM_CLOCK');last=n;return n;};
 async function resolve(fn){cancelled();let value;try{value=structuredClone(await fn());}catch{cancelled();throw Error('REVIEW_UNAVAILABLE');}cancelled();return value;}
 async function current(){
  check(bootcampMoodleRequestHash(await resolve(getCurrentRequest))===requestHash,'BCM_STALE_REQUEST');
  check(h('CONTEXT',await resolve(getCurrentContext))===h('CONTEXT',q.context),'BCM_STALE_CONTEXT');
  check(h('PIN',await resolve(getCurrentPin))===h('PIN',q.pin),'BCM_STALE_MAPPING');
  check(bootcampMoodleRequestHash(await resolve(getCurrentRequest))===requestHash,'BCM_STALE_REQUEST');
  const n=clock();check(n>=q.context.issuedAtMs&&n<q.context.expiresAtMs,'BCM_EXPIRED');
 }
 await current();const startedAtMs=clock();
 const call=async(m,a={})=>{
  cancelled();let v;
  try{v=structuredClone(await client.call(m,a,signal));}
  catch(e){cancelled();const safe=['REVIEW_AUTH','REVIEW_ACCESS','REVIEW_TIMEOUT','REVIEW_UNAVAILABLE','REVIEW_NOT_FOUND_OR_UNAVAILABLE','REVIEW_CANCELLED','REVIEW_RESPONSE_LIMIT','REVIEW_PARAMETERS','REVIEW_READ_ONLY'];throw Error(safe.includes(e?.message)?e.message:'REVIEW_UNAVAILABLE');}
  cancelled();return v;
 };
 const identity=await call('core_webservice_get_site_info');check(identity?.userid===q.pin.participantMapping.moodleUserId,'BCM_READER');
 check(String(identity.version)===q.pin.apiVersion,'BCM_SOURCE_VERSION');
 const first=await snapshot(call,q),second=await snapshot(call,q);check(h('SOURCE',first)===h('SOURCE',second),'BCM_SOURCE_CHANGED');
 const finishedAtMs=clock();check(finishedAtMs-startedAtMs<=30000,'BCM_CLOCK');
 // Never rewrite a source timestamp with acquiredAt or scenario time.
 for(const value of [first.facts.sourceCreatedAt,first.facts.sourceModifiedAt,first.facts.sourceStateModifiedAt,first.facts.createdAt,first.facts.modifiedAt])if(value!=null)check(value*1000<=finishedAtMs,'BCM_SOURCE_TIME');
 await current();
 const facts=freeze({capability:criterion.capability,targetLogicalId:criterion.targetLogicalId,...first.facts});
 const sourceHash=h('SOURCE',first.raw),factsHash=h('FACTS',facts);
 const acquisition=freeze({version:'clear-moodle-bootcamp-acquisition.1',dataMode:'LOCAL_LMS_RECORD',dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',context:q.context,
  requestHash,pinHash:h('PIN',q.pin),runtimeMappingHash:q.context.runtimeMappingHash,fixtureReportHash:q.context.fixtureReportHash,
  sourceVersion:q.pin.sourceVersion,observedApiVersion:String(identity.version),expectedReaderId:q.pin.participantMapping.moodleUserId,observedReaderId:identity.userid,
  sourceHash,factsHash,observed:{startedAtMs,finishedAtMs},expiresAtMs:q.context.expiresAtMs,
  sourceStatus:'OBSERVED_LOCAL_API',sourcePredicate:first.sourcePredicate,consistency:'TWO_READS_NON_ATOMIC',
  assurance:{source:'LOCAL_API_TOKEN',participant:'HOST_FIXTURE_PIN_ONLY',request:'HOST_CORRELATION_ONLY',integrity:'CANONICAL_HASH_ONLY',completionSetup:'SEPARATE_SETUP_RECEIPT_NOT_API'},
  usableForAcceptance:false,identityVerified:false,academyAcceptance:'UNKNOWN',...P0_GATES});
 const receiptHash=bootcampMoodleReceiptHash(acquisition);const n=clock();check(n<q.context.expiresAtMs,'BCM_EXPIRED');cancelled();
 return freeze({facts,acquisition,receiptHash,source:structuredClone(first.raw)});
}
// Integrity/correlation against an independently retained producer receipt hash.
// This is not source authentication, a signature, a product Evidence schema or CAS.
export function validateBootcampMoodleResult(result,{request,expectedReceiptHash,nowMs}){
 validate(request);hash32(expectedReceiptHash);epochMs(nowMs);
 const {facts,acquisition:a,source,receiptHash}=result;
 check(receiptHash===expectedReceiptHash&&bootcampMoodleReceiptHash(a)===expectedReceiptHash,'BCM_RECEIPT_HASH');
 check(a.version==='clear-moodle-bootcamp-acquisition.1'&&a.requestHash===bootcampMoodleRequestHash(request)
  &&h('CONTEXT',a.context)===h('CONTEXT',request.context)&&a.pinHash===h('PIN',request.pin),'BCM_RECEIPT_BINDING');
 check(a.sourceVersion===request.pin.sourceVersion&&a.observedApiVersion===request.pin.apiVersion
  &&a.observedReaderId===request.pin.participantMapping.moodleUserId&&a.expectedReaderId===a.observedReaderId,'BCM_RECEIPT_BINDING');
 check(a.runtimeMappingHash===request.context.runtimeMappingHash&&a.fixtureReportHash===request.context.fixtureReportHash,'BCM_RECEIPT_BINDING');
 check(a.factsHash===h('FACTS',facts)&&a.sourceHash===h('SOURCE',source),'BCM_RESULT_CHANGED');
 check(a.usableForAcceptance===false&&a.identityVerified===false&&a.academyAcceptance==='UNKNOWN'
  &&Object.entries(P0_GATES).every(([key,value])=>a[key]===value),'BCM_GATES');
 check(facts.capability===request.context.capability&&facts.targetLogicalId===request.pin.target.targetLogicalId,'BCM_CAPABILITY');
 epochMs(a.observed.startedAtMs);epochMs(a.observed.finishedAtMs);
 check(a.observed.startedAtMs>=request.context.issuedAtMs&&a.observed.finishedAtMs>=a.observed.startedAtMs
  &&a.observed.finishedAtMs-a.observed.startedAtMs<=30000&&a.expiresAtMs===request.context.expiresAtMs,'BCM_CLOCK');
 check(nowMs>=a.observed.finishedAtMs&&nowMs<a.expiresAtMs&&nowMs-a.observed.startedAtMs<=maxAgeMs(request),'BCM_EXPIRED');
 return result;
}
