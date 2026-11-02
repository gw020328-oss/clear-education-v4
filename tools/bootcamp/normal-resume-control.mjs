// One in-process reflection continuation, never a restart/retry dispatcher.
import {exactKeys,requireRule as check} from '../../src/policy/values.mjs';
export function createNormalResumeControl({applicationId,authorize,inspect,prepareResume}){
 let failure=null,revision=0,queued=false;
 const view=()=>{
  if(!failure)return null;
  let current;try{current=inspect();}catch{current={status:'AUTH_OR_EVIDENCE_RENEWAL_REQUIRED',resumeAllowed:false};}
  return Object.freeze({...failure,failureRevision:revision,applicationRevision:current.applicationRevision??null,
   resumeAllowed:!queued&&current.resumeAllowed===true,recoveryStatus:queued?'RESUME_QUEUED':current.status,
   retryAllowed:false,automaticRetry:false});
 };
 return Object.freeze({
  open(value){if(!failure){failure=value;revision++;queued=false;}return view();},view,
  request(context,id,body){
   const actor=authorize(context,true);check(actor.role.toLowerCase()==='operator','FORBIDDEN');
   exactKeys(body,['failureRevision','expectedRevision'],'BC_NORMAL_RESUME_BODY');
   check(id===applicationId()&&failure&&!queued,'BC_NORMAL_RESUME_BLOCKED');
   const current=view();check(body.failureRevision===revision&&body.expectedRevision===current.applicationRevision,'BC_NORMAL_RESUME_STALE');
   check(current.resumeAllowed,'BC_NORMAL_RESUME_BLOCKED');prepareResume(current);queued=true;
   return {status:'RESUME_QUEUED',failureRevision:revision,applicationId:id};
  },
  take(){if(!queued)return false;queued=false;failure=null;return true;},
  cancel(){queued=false;failure=null;},
 });
}
