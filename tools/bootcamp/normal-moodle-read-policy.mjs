// Constructor-owned local course reader. No caller selects a user or a course.
import {exactKeys,requireRule as check} from '../../src/policy/values.mjs';
export const normalMoodleReadParameters=Object.freeze({
 core_webservice_get_site_info:Object.freeze([]),
 core_course_get_contents:Object.freeze(['courseid']),
 core_completion_get_activities_completion_status:Object.freeze(['courseid','userid']),
 mod_assign_get_assignments:Object.freeze(['courseids[0]']),
 mod_assign_get_submission_status:Object.freeze(['assignid','userid']),
});
export function assertNormalMoodleReadTarget(method,args){
 check(Object.hasOwn(normalMoodleReadParameters,method),'ACTIVITY_READER_TARGET');
 exactKeys(args,normalMoodleReadParameters[method],'ACTIVITY_READER_TARGET');
 let valid=false;
 switch(method){
  case 'core_webservice_get_site_info':valid=true;break;
  case 'core_course_get_contents':valid=args.courseid===2;break;
  case 'core_completion_get_activities_completion_status':valid=args.courseid===2&&args.userid===3;break;
  case 'mod_assign_get_assignments':valid=args['courseids[0]']===2;break;
  case 'mod_assign_get_submission_status':valid=args.assignid===1&&args.userid===0;break;
 }
 check(valid,'ACTIVITY_READER_TARGET');
}
export function normalMoodleReadClient(transport,assertCurrent){
 return Object.freeze({async call(method,args={},signal){
  check(!signal?.aborted,'REVIEW_CANCELLED');assertCurrent();assertNormalMoodleReadTarget(method,args);
  const result=await transport.call(method,args,signal);check(!signal?.aborted,'REVIEW_CANCELLED');assertCurrent();return result;
 }});
}
