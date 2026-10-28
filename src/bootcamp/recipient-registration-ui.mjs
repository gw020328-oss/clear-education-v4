import {requireRule as check} from '../policy/values.mjs';
// Read-only canonical overlay. Recheck the original actor and current packet
// after asynchronous RPC; an earlier authenticated read cannot authorize return.
export async function readRecipientRegistration({store,connection,context,applicationId,authorize}){
 authorize(context,false);const before=store.getRecipientRegistration(context,applicationId);
 if(!before.registrationTargetId)return before;
 await connection.refresh(applicationId);authorize(context,false);
 const after=store.getRecipientRegistration(context,applicationId);
 check(after.registrationTargetId===before.registrationTargetId,'BC_RECIPIENT_REGISTRATION_TARGET');
 return {...after,...connection.recipientRegistrationState(applicationId)};
}
