import {observeSource} from '../hackerrank-evidence/diagnostics.mjs';
import {randomUUID} from 'node:crypto';
import {verifyMessage} from 'ethers';
import {exactKeys,freeze,RuleError,requireRule as check} from '../policy/values.mjs';
import {requestMessage,requestHash} from '../hackerrank-evidence/request.mjs';

function projectionConflict(error){
 try{return Object.getPrototypeOf(error)===RuleError.prototype&&Object.getOwnPropertyDescriptor(error,'message')?.value==='BC_VIEW_STALE';}
 catch{return false;}
}

// Constructor-owned public identities. No wallet key, auto-login or server signing fallback.
export function createNormalUiSession({authentication,participantWallet,operatorWallet,getApplication,now=()=>Math.floor(Date.now()/1000),diagnostics}){
 check([participantWallet,operatorWallet].every(x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'00'.repeat(20))&&participantWallet!==operatorWallet
  &&typeof getApplication==='function','BC_UI_IDENTITY_CONFIG');
 let bound=null,pending=null,used=false,closed=false;
 const actor=(context,write=false)=>{
  check(!closed,'BC_UI_CLOSED');const s=authentication.authorizeWorkflow(context,write);
  check(s.role==='participant'&&s.wallet.toLowerCase()===participantWallet||s.role==='operator'&&s.wallet.toLowerCase()===operatorWallet,'FORBIDDEN');
  return s;
 };
 const cancel=code=>{if(!pending)return;observeSource(diagnostics,'SIGNATURE_WAIT','FAILED',{code});const p=pending;pending=null;clearTimeout(p.timer);clearInterval(p.authorityTimer);p.signal?.removeEventListener('abort',p.abort);p.message=null;p.reject(Error(code));};
 const failContext=(stage,error)=>{observeSource(diagnostics,stage,'FAILED',error);cancel('BC_UI_CONTEXT_UNAVAILABLE');throw error;};
 const deadline=()=>{if(pending){const n=now();if(!Number.isSafeInteger(n)||n>=pending.expiresAt){cancel('BC_UI_SIGNATURE_EXPIRED');check(false,'BC_UI_SIGNATURE_EXPIRED');}}};
 const boundAuthority=()=>{
  try{check(bound,'BC_UI_PARTICIPANT_REQUIRED');const s=actor(bound.context,true);check(s.role==='participant'&&s.wallet.toLowerCase()===participantWallet,'FORBIDDEN');}
  catch(error){failContext('UI_SESSION_AUTHORITY',error);}
 };
 function participant(){
  deadline();boundAuthority();let v;
  try{v=getApplication(bound.context,bound.applicationId);}
  catch(error){
   // Only the store's typed read conflict may leave an existing approval pending.
   // Never return cached authority: callers (including submission) still fail this
   // read. The existing periodic check may try again within the original deadline.
   if(pending&&projectionConflict(error)){
    boundAuthority();deadline();
    if(!pending.projectionDeferred){pending.projectionDeferred=true;observeSource(diagnostics,'UI_APPLICATION_PROJECTION','DEFERRED',error);}
    throw error;
   }
   failContext('UI_APPLICATION_PROJECTION',error);
  }
  boundAuthority();deadline();
  try{check(v.applicationId===bound.applicationId&&v.participantId===bound.participantId&&v.policyHash===bound.policyHash&&v.runtimeMappingHash===bound.runtimeMappingHash&&v.status==='ACTIVE','BC_UI_APPLICATION_CHANGED');}
  catch(error){failContext('UI_APPLICATION_BINDING',error);}
  return bound.context;
 }
 const own=(context,write)=>{participant();const s=actor(context,write);check(s.role==='participant','FORBIDDEN');
  check(context.token===bound.context.token&&context.wallet.toLowerCase()===participantWallet&&context.chainId===bound.context.chainId,'BC_UI_CONTEXT_CHANGED');};
 return Object.freeze({
  authorize:actor,
  bindParticipant(context,applicationId,pins){
   const s=actor(context,true);check(s.role==='participant','FORBIDDEN');const v=getApplication(context,applicationId);
   check(!bound&&v.status==='ACTIVE'&&v.applicationId===applicationId,'BC_UI_ALREADY_BOUND');
   check(pins&&pins.dataMode==='RECLAIM_SIGNED_RECORD','BC_UI_SIGNATURE_SOURCE');
   bound={context:freeze({...context}),applicationId,participantId:v.participantId,policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,pins:freeze(structuredClone(pins))};
  },
  participant,
  async requestSignature(expected,message,{signal}={}){
   participant();check(!used&&!pending&&!signal?.aborted,'BC_UI_SIGNATURE_REQUEST_USED');
   check(expected.applicationId===bound.applicationId&&expected.participantId===bound.participantId&&expected.participantWallet===participantWallet
    &&expected.policyHash===bound.policyHash&&expected.runtimeMappingHash===bound.runtimeMappingHash,'BC_UI_SIGNATURE_TARGET');
   for(const k of ['audience','trustConfigHash','recipeHash','expectedClaimOwner','selectedCertificateId'])check(expected[k]===bound.pins[k],'BC_UI_SIGNATURE_SOURCE');
   check(expected.version==='clear-hackerrank-request.1'&&expected.criterionId==='python-basic-certificate'&&message===requestMessage(expected)
    &&Buffer.byteLength(message,'utf8')<=16384,'BC_UI_SIGNATURE_MESSAGE');
   const n=now(),expiresAt=Math.min(expected.expiresAt,n+300);
   check(Number.isSafeInteger(n)&&Number.isSafeInteger(expected.issuedAt)&&Number.isSafeInteger(expiresAt)&&expected.issuedAt<=n&&n<expiresAt,'BC_UI_SIGNATURE_EXPIRED');used=true;
   return new Promise((resolve,reject)=>{
    const p={id:'approval-'+randomUUID(),requestHash:requestHash(expected),message,expiresAt,resolve,reject,signal,abort:()=>cancel('BC_UI_SIGNATURE_CANCELLED')};
    pending=p;observeSource(diagnostics,'SIGNATURE_WAIT','STARTED');p.authorityTimer=setInterval(()=>{try{participant();}catch{}},250);p.timer=setTimeout(()=>cancel('BC_UI_SIGNATURE_EXPIRED'),Math.max(1,(expiresAt-n)*1000));signal?.addEventListener('abort',p.abort,{once:true});
    if(signal?.aborted)p.abort();
   });
  },
  pendingSignature(context){
   own(context,false);check(pending,'BC_UI_SIGNATURE_NOT_PENDING');if(now()>=pending.expiresAt){cancel('BC_UI_SIGNATURE_EXPIRED');check(false,'BC_UI_SIGNATURE_EXPIRED');}
   return freeze({approvalId:pending.id,requestHash:pending.requestHash,message:pending.message,expiresAt:pending.expiresAt,
    purpose:'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'});
  },
  submitSignature(context,body){
   observeSource(diagnostics,'SIGNATURE_ACCEPTANCE','STARTED');
   try{
   exactKeys(body,['approvalId','signature'],'BC_UI_SIGNATURE_BODY');own(context,true);check(pending&&body.approvalId===pending.id,'BC_UI_SIGNATURE_NOT_PENDING');
   if(now()>=pending.expiresAt){cancel('BC_UI_SIGNATURE_EXPIRED');check(false,'BC_UI_SIGNATURE_EXPIRED');}
   check(typeof body.signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(body.signature),'BC_UI_SIGNATURE');
   let signer;try{signer=verifyMessage(pending.message,body.signature).toLowerCase();}catch{}check(signer===participantWallet,'BC_UI_SIGNATURE');
   own(context,true);if(now()>=pending.expiresAt){cancel('BC_UI_SIGNATURE_EXPIRED');check(false,'BC_UI_SIGNATURE_EXPIRED');}
   const p=pending;pending=null;clearTimeout(p.timer);clearInterval(p.authorityTimer);p.signal?.removeEventListener('abort',p.abort);p.message=null;observeSource(diagnostics,'SIGNATURE_ACCEPTANCE','COMPLETED');observeSource(diagnostics,'SIGNATURE_WAIT','COMPLETED');p.resolve(body.signature);
   return freeze({approvalId:p.id,requestHash:p.requestHash,status:'PARTICIPANT_SIGNATURE_ACCEPTED',paymentAuthorization:false});
   }catch(error){observeSource(diagnostics,'SIGNATURE_ACCEPTANCE','FAILED',error);throw error;}
  },
  close(){if(closed)return;closed=true;cancel('BC_UI_CLOSED');bound=null;},
 });
}
