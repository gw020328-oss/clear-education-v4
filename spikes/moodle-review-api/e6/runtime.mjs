// Owned local fixture driver. No token/raw output, no HTTP product endpoint.
import {readFile,writeFile,open,unlink} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createE6MoodleClient} from '../../../src/review-evidence/moodle/bootcamp-client.mjs';
import {createBootcampMoodleRequest,readBootcampMoodle} from '../../../src/review-evidence/moodle/bootcamp.mjs';
import {P0_POLICY,p0Hash,p0PolicyHash} from '../../../specs/bootcamp/p0-contract.mjs';
export const metrics={restReadCalls:0,restWriteCalls:0};
export const runtime=new URL('../../../var/moodle-e6/',import.meta.url);
export const compose=['compose','-f',fileURLToPath(new URL('./compose.yml',import.meta.url))];
export const fixture=()=>readFile(new URL('fixture.json',runtime),'utf8').then(JSON.parse);
export function php(script,payload){try{return JSON.parse(execFileSync('docker',[...compose,'exec','-T','web','php','/lab-scripts/'+script],{input:JSON.stringify(payload??{}),encoding:'utf8',stdio:['pipe','pipe','pipe']}));}catch{throw Error('E6_OWNED_CLI_FAILED');}}
export async function withReader(fn,participant='one'){
 const credential=php('credential.php',{action:'issue',participant,mode:'read'}),client=createE6MoodleClient({tokenProvider:()=>credential.token});
 const counted={...client,call(...args){metrics.restReadCalls++;return client.call(...args);}};
 try{return await fn(counted,credential.expiresAtMs);}finally{client.close();php('credential.php',{action:'revoke',token:credential.token});credential.token=undefined;}
}
export async function writeSource(method,args,participant='one'){
 const allowed=['mod_page_view_page','mod_assign_save_submission','mod_assign_submit_for_grading','mod_forum_add_discussion','mod_forum_update_discussion_post','mod_forum_delete_post'];if(!allowed.includes(method))throw Error('E6_WRITER_ALLOWLIST');
 const c=php('credential.php',{action:'issue',participant,mode:'write'});
 try{metrics.restWriteCalls++;const r=await fetch('http://127.0.0.1:18768/webservice/rest/server.php',{method:'POST',redirect:'error',body:new URLSearchParams({wstoken:c.token,wsfunction:method,moodlewsrestformat:'json',...args}),signal:AbortSignal.timeout(10000)});const v=await r.json();if(v?.exception)throw Error('E6_SOURCE_WRITE_REJECTED');return v;}
 finally{php('credential.php',{action:'revoke',token:c.token});c.token=undefined;}
}
export async function query(criterionId,{selectedPostId,ttlMs=45000}={}){
 const f=await fixture(),report=JSON.parse(await readFile(new URL('./mapping-report.json',import.meta.url))),path=new URL('generation.json',runtime);
 let sequence=0;const lock=new URL('generation.lock',runtime);let fd;
 try{fd=await open(lock,'wx',0o600);}catch{throw Error('E6_GENERATION_BUSY');}
 try{try{const old=JSON.parse(await readFile(path));if(old.environmentRef!==f.environmentRef)throw Error('E6_MAPPING_CHANGED');if(!Number.isSafeInteger(old.sequence)||old.sequence<0)throw Error('E6_GENERATION_INVALID');sequence=old.sequence;}catch(e){if(e.code!=='ENOENT')throw e;}
  sequence++;await writeFile(path,JSON.stringify({sequence,environmentRef:f.environmentRef}),{mode:0o600});
 }finally{await fd.close();await unlink(lock);}
 const c=P0_POLICY.criteria.find(c=>c.criterionId===criterionId),t=criterionId==='activity-complete'?{...f.activity,module:'page',selectedPostId:null}:criterionId==='assignment-submitted'?{...f.assignment,module:'assign',selectedPostId:null}:{cmId:f.reflection.cmId,instanceId:f.reflection.forumId,module:'forum',selectedPostId:selectedPostId??f.selectedPostId};
 const stamp=Date.now(),context={participantId:'participant-e6-one',applicationId:'application-e6-one',policyHash:p0PolicyHash(P0_POLICY),criterionId,capability:c.capability,evidenceId:'e6-'+criterionId,evidenceRevision:1,runtimeMappingHash:p0Hash('E6-LAB-MAPPING',{reportHash:report.reportHash,mappingRevision:report.report.mappingRevision}),fixtureReportHash:report.reportHash,sourceRunId:'e6-read-'+sequence,sourceGeneration:sequence,attempt:1,issuedAtMs:stamp,expiresAtMs:stamp+ttlMs};
 return createBootcampMoodleRequest({context,pin:{environmentRef:f.environmentRef,runRef:f.runRef,sourceVersion:f.sourceVersion,apiVersion:'2024100715',fixtureReportHash:report.reportHash,courseId:f.courseId,
  participantMapping:{participantId:context.participantId,applicationId:context.applicationId,moodleUserId:f.users.one,accountBindingRef:'e6-one-account',revision:report.report.mappingRevision},target:{targetLogicalId:c.targetLogicalId,...t},completionSetupReceiptHash:criterionId==='activity-complete'?report.report.completionSetupReceiptHash:null}});
}
export function collect(q,{signal}={}){return withReader(client=>readBootcampMoodle({client,request:q,getCurrentRequest:()=>q,getCurrentContext:()=>q.context,getCurrentPin:()=>q.pin,signal}));}
