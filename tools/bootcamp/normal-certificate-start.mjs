import {exactKeys,requireRule as check} from '../../src/policy/values.mjs';
import {readNormalView} from './normal-current-view.mjs';

export const CERTIFICATE_STAGE='SOURCE_python-basic-certificate';
// An owner-scoped wait, not a background task launched by a bind/read request.
export function createNormalCertificateStart({store,commandScope,authorize,getBinding,
  validateParticipant,now,expiresAt,signal,getStage}) {
 let state='NOT_READY',waiting=null,attempt=null;
 const binding=()=>{check(!signal.aborted&&now()<expiresAt,'BC_CERTIFICATE_CLOSED');return getBinding();};
 const own=(context,applicationId,write=false)=>{
  const actor=authorize(context,write),bound=binding();
  check(actor.role==='participant'&&applicationId===bound.app&&!!bound.user
   &&context.token===bound.user.token,'FORBIDDEN');return bound;
 };
 const cancel=()=>{state='UNAVAILABLE';waiting?.reject(Error('BC_CERTIFICATE_CLOSED'));waiting=null;};
 signal.addEventListener('abort',cancel,{once:true});
 return Object.freeze({
  view(context,applicationId){
   own(context,applicationId);attempt?.assertAuthority();
   const ready=getStage()===CERTIFICATE_STAGE;
   return {version:'clear-certificate-start.1',applicationId,criterionId:'python-basic-certificate',
    state,startAllowed:ready&&state==='READY_TO_START',signatureReady:ready&&state==='AWAITING_SIGNATURE'};
  },
  async wait(){
   binding();check(state==='NOT_READY'&&getStage()===CERTIFICATE_STAGE,'BC_CERTIFICATE_STAGE');
   state='READY_TO_START';
   const accepted=await new Promise((resolve,reject)=>{waiting={resolve,reject};});
   accepted.assertAuthority();return accepted;
  },
  start(context,applicationId,body,idempotencyKey){
   exactKeys(body,['expectedRevision'],'BC_CERTIFICATE_BODY');
   check(Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>0
    &&typeof idempotencyKey==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(idempotencyKey),'BC_CERTIFICATE_BODY');
   const bound=own(context,applicationId,true);validateParticipant();
   if(attempt){
    check(attempt.key===idempotencyKey&&attempt.revision===body.expectedRevision,'BC_CERTIFICATE_ALREADY_STARTED');
    attempt.assertAuthority();commandScope.assert();commandScope.memoryCommitted();return attempt.reply;
   }
   check(state==='READY_TO_START'&&waiting&&getStage()===CERTIFICATE_STAGE,'BC_CERTIFICATE_NOT_READY');
   const view=readNormalView(()=>store.getApplication(context,applicationId));
   check(view.status==='ACTIVE'&&view.revision===body.expectedRevision,'BC_REVISION_CONFLICT');
   const assertIntent=commandScope.captureCertificateAuthority(applicationId);
   // This fence also runs inside store transactions: no projection reads here.
   const assertAuthority=()=>{assertIntent();const current=binding();
    check(current.app===applicationId&&current.user?.token===bound.user.token,'FORBIDDEN');};
   const reply=Object.freeze({version:'clear-certificate-start-receipt.1',applicationId,
    criterionId:'python-basic-certificate',status:'START_ACCEPTED',paymentAuthorization:false});
   commandScope.assert();commandScope.memoryCommitted();
   attempt={key:idempotencyKey,revision:body.expectedRevision,reply,assertAuthority};state='START_ACCEPTED';
   const gate=waiting;waiting=null;gate.resolve({expectedRevision:body.expectedRevision,assertAuthority});
   return reply;
  },
  async signature(request){
   check(state==='START_ACCEPTED'&&attempt,'BC_CERTIFICATE_NOT_STARTED');attempt.assertAuthority();
   state='AWAITING_SIGNATURE';
   try{const signature=await request();attempt.assertAuthority();state='SIGNATURE_ACCEPTED';return signature;}
   catch(error){state='UNAVAILABLE';throw error;}
  },
  complete(){attempt?.assertAuthority();check(state==='SIGNATURE_ACCEPTED','BC_CERTIFICATE_NOT_SIGNED');state='VERIFIED';},
  fail(){state='UNAVAILABLE';},
  close(){signal.removeEventListener('abort',cancel);cancel();},
 });
}
