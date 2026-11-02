// Constructor-owned session capability. Never exposes a provider or raw signer.
import {createProductSession} from './product-session.mjs';
import {createNormalBootcampClient} from '../bootcamp/normal-client.mjs';
export function createTeamPort({session,wallet,config}){
 const product=createProductSession({session,wallet,config});
 const request=(path,options={})=>{
  if(options.method?.toUpperCase()==='POST'&&path.includes('/recipient-registration'))throw Error('TEAM_REGISTRATION_GUARDED_ONLY');
  return session.request(path,options);
 };
 const normal=createNormalBootcampClient({request});
 return Object.freeze({
  async attach(role){const actor=await session.assertSession();if(actor.role!==role)throw Error('TEAM_ROLE_CHANGED');
   return Object.freeze({wallet:actor.wallet,signIn:async()=>actor,signOut:()=>session.dispose(),request,
    bootcampSession:()=>normal.session(),signMessage:message=>product.bridge.sign(message),
    signTypedData(){throw Error('TEAM_REGISTRATION_GUARDED_ONLY');}});},
  normal:Object.freeze({...normal,get registrationUnknown(){return product.registrationUnknown;},recipientRegistration:()=>product.readRegistration(),
   registerReviewedRecipient:async packet=>{const b=await normal.session();if(b.failure)throw Error('TEAM_EXECUTION_FAILED');return product.submitRegistration(packet);},
   submitRecipientRegistration(){throw Error('TEAM_REGISTRATION_GUARDED_ONLY');}}),
  bridge:Object.freeze({...product.bridge,request,publicRead:request}),
 });
}
