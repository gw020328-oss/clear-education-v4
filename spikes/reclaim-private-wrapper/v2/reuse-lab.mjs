// In-memory candidate study only. Does not produce a claim nullifier or payout authority.
import {createHmac,createHash} from 'node:crypto';
import {canonical,examKey} from '../../../src/ybm-collector/values.mjs';
import {syntheticVerifier} from './adapter.mjs';
export function privateRegistryLab({key,registrations,signer,clock,state}){
 if(!(key instanceof Uint8Array)||key.length!==32)throw Error('LAB_KEY');
 const secret=Buffer.from(key),keyId=createHash('sha256').update(secret).digest('hex');
 const approved=new Map(registrations.map(r=>[r.application,{r:structuredClone(r),verify:syntheticVerifier({record:r,signer,clock})}]));
 if(state&&state.keyId!==keyId)throw Error('KEY_ROTATION_REVIEW_REQUIRED');
 // This is a trusted PRIVATE state model, not a durable database or a rollback
 // proof. Never accept this checkpoint from an applicant or publish its tags.
 const seen=new Map(state?.entries??[]);let closed=false;
 return {
   keyId,
   async observe({application,proof,expectedKeyId=keyId}){
     if(closed)throw Error('LAB_CLOSED');if(expectedKeyId!==keyId)throw Error('KEY_ROTATION_REVIEW_REQUIRED');
     const a=approved.get(application);if(!a)throw Error('REGISTRATION_NOT_APPROVED');
     const verified=await a.verify(proof);if(closed)throw Error('LAB_CLOSED');
     const record=verified.private.matching[0].fields;
     // Leading-zero equivalence is not established by source documentation.
     if(record.registration_number.startsWith('0'))throw Error('SOURCE_ID_NORMALIZATION_UNRESOLVED');
     const tag=createHmac('sha256',secret).update(canonical(['CLEAR_REUSE_LAB_V1',a.r.reuseScope,examKey(record)])).digest('hex');
     const previous=seen.get(tag);if(!previous)seen.set(tag,application);
     return {scope:'SYNTHETIC_PRIVATE_REGISTRY_CANDIDATE',firstSeen:!previous,sameApplication:previous===application,
       publicTagIssued:false,requiresOnlineService:true,requiresStableKeyAndDurableState:true,paymentAllowed:false};
   },
   privateCheckpoint(){if(closed)throw Error('LAB_CLOSED');return {keyId,entries:[...seen.entries()]};},
   close(){secret.fill(0);seen.clear();closed=true;}
 };
}
export function academyBindingCandidate({studentBinding,reuseScope,examDate}){
 // Counterexample helper only: no attested link from source exam account to student.
 return createHash('sha256').update(canonical([studentBinding,reuseScope,examDate])).digest('hex');
}
