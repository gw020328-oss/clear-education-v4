// Only authenticated projections may be reread. This module never signs, registers or sends.
import {RuleError,requireRule as check} from '../../src/policy/values.mjs';
import {readNormalView,normalViewConflict,normalSourceTarget,assertNormalSourceTarget} from './normal-current-view.mjs';
import {requireNormalSourceWindow,REVIEW_WINDOW} from './normal-review-window.mjs';
import {waitUntil} from './normal-host-flow.mjs';
const phases=new Set(['RECIPIENT_DEADLINE_READ','RECIPIENT_POLL_AUTH','RECIPIENT_POLL_REGISTRATION']);
function read(phase,fn){try{return readNormalView(fn);}catch(error){
 if(normalViewConflict(error))throw Object.assign(new RuleError('BC_VIEW_STALE'),{cause:error,failurePhase:phase});throw error;
}}
export async function waitForNormalRecipientRegistration({participant,registration,deadlineMs,signal,nowMs=Date.now}){
 const initial=read('RECIPIENT_DEADLINE_READ',registration);
 check(Number(initial.payload?.message.deadline)*1000===deadlineMs,'BC_RECIPIENT_REGISTRATION_TARGET');
 check(nowMs()<deadlineMs,'BC_RECIPIENT_REGISTRATION_EXPIRED');
 await waitUntil(()=>{
  check(nowMs()<deadlineMs,'BC_RECIPIENT_REGISTRATION_EXPIRED');
  read('RECIPIENT_POLL_AUTH',participant);
  const r=read('RECIPIENT_POLL_REGISTRATION',registration);
  check(Number(r.payload?.message.deadline)*1000===deadlineMs,'BC_RECIPIENT_REGISTRATION_TARGET');
  check(['AWAITING_SIGNATURE','SIGNED'].includes(r.status),'BC_RECIPIENT_REGISTRATION_EXPIRED');return r.status==='SIGNED';
 },{signal,timeoutMs:deadlineMs-nowMs()});
}
// In-memory capability for the suspended WAIT only. No restart, report replay or payment retry entry.
export function createNormalRecipientWaitCheckpoint({store,connection,user,app,target,intake,report,assertCurrent,signal,nowMs=Date.now}){
 const record=intake.record,packet=JSON.stringify(record.recipientRegistration),deadlineMs=Number(record.recipientRegistration?.message.deadline)*1000;
 let active=true,paused=false,permit=false;
 const current=()=>{
  check(active&&!signal?.aborted,'BC_NORMAL_RECIPIENT_RESUME_BLOCKED');assertCurrent();
  const metrics=connection.metrics(),native=connection.failureState();
  check(['keyAccesses','paymentSignatures','transactionSignatures','broadcasts'].every(k=>metrics[k]===0)
   &&Array.isArray(native.envelopes)&&native.envelopes.length===0&&report.stages.length===0&&!report.claim&&!report.completed&&!report.chainApplicationId,'BC_NORMAL_RECIPIENT_RESUME_BLOCKED');
  assertNormalSourceTarget(normalSourceTarget(readNormalView(()=>store.getApplication(user,app))),target);
  const r=readNormalView(()=>store.getRecipientRegistration(user,app));
  check(r.registrationTargetId===record.id&&r.applicationRevision===target.applicationRevision&&JSON.stringify(r.payload)===packet
   &&['AWAITING_SIGNATURE','SIGNED'].includes(r.status),'BC_RECIPIENT_REGISTRATION_TARGET');
  check(Number.isSafeInteger(deadlineMs)&&Number.isSafeInteger(record.sourceValidUntilExclusive)
   &&Math.min(deadlineMs,record.sourceValidUntilExclusive*1000)-nowMs()>=REVIEW_WINDOW.openingSeconds*1000,'BC_RECIPIENT_REGISTRATION_EXPIRED');
  return r;
 };
 return Object.freeze({deadlineMs,
  pause(error){paused=normalViewConflict(error)&&phases.has(error.failurePhase);permit=false;},
  inspect(){try{check(paused&&!permit,'BC_NORMAL_RECIPIENT_RESUME_BLOCKED');current();return {status:'RECIPIENT_WAIT_NOT_SENT',resumeAllowed:true,applicationRevision:target.applicationRevision};}
   catch{return {status:'RECIPIENT_WAIT_RENEWAL_REQUIRED',resumeAllowed:false};}},
  requestResume(){check(this.inspect().resumeAllowed,'BC_NORMAL_RECIPIENT_RESUME_BLOCKED');permit=true;},
  async resume(){check(paused&&permit,'BC_NORMAL_RECIPIENT_RESUME_BLOCKED');permit=false;current();
   await connection.refresh(app);current();const chain=connection.recipientRegistrationState(app);
   check(chain.canonical===true&&chain.chainStatus==='NOT_REGISTERED','BC_NORMAL_RECIPIENT_RESUME_BLOCKED');
   requireNormalSourceWindow({store,context:user,applicationId:app,sourceTarget:target});current();paused=false;
  },close(){active=false;paused=false;permit=false;},
 });
}
