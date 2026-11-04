import {canonical,exactKeys,freeze,requireRule as check} from '../../src/policy/values.mjs';
import {normalMoodleRegistrationAccess} from './normal-moodle-registration.mjs';

export const NORMAL_MOODLE_CURRENTNESS='clear-normal-moodle-currentness.1';
// No file creation, migrations, writes, refresh, tick or presence heartbeat.
// Only a branded actual registration owner supplies this read capability.
export function createNormalMoodleCurrentness({registration}){
 const access=normalMoodleRegistrationAccess(registration);
 return Object.freeze({async read(context,request,selector,{signal}={}){
  exactKeys(selector,['applicationId','registrationRef','registrationRevision'],'NORMAL_MOODLE_SELECTOR');
  const selected=structuredClone(selector);
  const frame=await access.authenticateRequest(context,request,{signal});
  check(selected.applicationId===frame.identity.applicationId,'NORMAL_MOODLE_SELECTOR');
  const slot=access.slotOf(frame.identity),record=access.head(slot);
  const validate=r=>check(r&&r.status==='ACTIVE'&&r.registrationRef===selected.registrationRef&&r.revision===selected.registrationRevision
   &&canonical(r.identity)===canonical(frame.identity)&&access.time().wall<r.expiresAtExclusive,'NORMAL_MOODLE_REGISTRATION_NOT_CURRENT');
  validate(record);frame.assertCurrent();const last=access.head(slot);validate(last);
  check(canonical(record)===canonical(last),'NORMAL_MOODLE_REGISTRATION_CHANGED');
  const time=frame.current(),expiresAtExclusive=Math.min(frame.expiry(),last.expiresAtExclusive);
  check(time.wall<expiresAtExclusive,'NORMAL_MOODLE_EXPIRED');
  return freeze({version:NORMAL_MOODLE_CURRENTNESS,ownerRunId:frame.identity.ownerRunId,applicationId:selected.applicationId,
   registrationRef:last.registrationRef,registrationRevision:last.revision,
   scope:Object.fromEntries(['installationRef','installationGeneration','courseRef','subjectRef','actorRef','role'].map(k=>[k,frame.identity[k]])),
   currentness:'OWNER_REGISTRATION_CURRENT',checkedAt:time.wall,expiresAtExclusive,displayOnly:true,paymentAuthority:false});
 }});
}
