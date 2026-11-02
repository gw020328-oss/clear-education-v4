import {canonical,exactKeys,RuleError,requireRule as check} from '../policy/values.mjs';
// A displayed checkpoint is an observation, not part of the signed packet.
// An anchored reread proves canonical ancestry and repeats authentication/CAS
// after asynchronous RPC; it never changes the registration target or deadline.
export async function readRecipientRegistration({store,connection,context,applicationId,authorize,checkpoint}){
 if(checkpoint!==undefined){
  exactKeys(checkpoint,['number','hash','time'],'BC_RECIPIENT_REGISTRATION_CHECKPOINT');
  check(['number','time'].every(k=>typeof checkpoint[k]==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(checkpoint[k]))
   &&typeof checkpoint.hash==='string'&&/^0x[0-9a-f]{64}$/.test(checkpoint.hash),'BC_RECIPIENT_REGISTRATION_CHECKPOINT');
 }
 // One fresh local projection after a rolled-back clock conflict. Never repeat
 // RPC refresh, ancestry verification, signing or submission at this boundary.
 const read=()=>{try{return store.getRecipientRegistration(context,applicationId);}catch(error){
  let conflict=false;try{conflict=Object.getPrototypeOf(error)===RuleError.prototype&&Object.getOwnPropertyDescriptor(error,'message')?.value==='BC_VIEW_STALE';}catch{}
  if(!conflict)throw error;return store.getRecipientRegistration(context,applicationId);
 }};
 authorize(context,false);const before=read();
 if(!before.registrationTargetId){check(checkpoint===undefined,'BC_RECIPIENT_REGISTRATION_TARGET');return before;}
 await connection.refresh(applicationId);authorize(context,false);
 let after=read();
 check(after.registrationTargetId===before.registrationTargetId,'BC_RECIPIENT_REGISTRATION_TARGET');
 if(checkpoint===undefined)return {...after,...connection.recipientRegistrationState(applicationId)};
 const stable=v=>{const {observedAt,...fixed}=v;return canonical(fixed);};
 check(stable(before)===stable(after),'BC_RECIPIENT_REGISTRATION_TARGET');
 const state=connection.recipientRegistrationState(applicationId);
 check(state.canonical===true&&state.chainStatus==='NOT_REGISTERED','BC_RECIPIENT_REGISTRATION_CHAIN');
 await connection.verifyRecipientRegistrationCheckpoint(applicationId,checkpoint);
 authorize(context,false);after=read();
 check(stable(before)===stable(after),'BC_RECIPIENT_REGISTRATION_TARGET');
 const current=connection.recipientRegistrationState(applicationId);
 check(canonical(current)===canonical(state),'BC_RECIPIENT_REGISTRATION_CHAIN');
 return {...after,...current,checkpointContinuity:{status:'CANONICAL_ANCESTOR',from:checkpoint,to:current.checkpoint}};
}
