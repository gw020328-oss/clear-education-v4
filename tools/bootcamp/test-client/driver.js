// Button-driven single application only. This is not a product front end or a source/model runner.
import {REVIEW_WINDOW,displayedReviewWindow} from './review-window.js';
const check=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const unknown=e=>e?.outcome==='UNKNOWN';
export function createTestDriver({session,createNormalClient,id=()=>crypto.randomUUID(),now=()=>Date.now(),elapsedNow=now,changed=()=>{}}){
 const api=createNormalClient({request:(...args)=>session.request(...args)});
 let state={config:null,identity:null,bootstrap:null,applicationId:null,view:null,operations:null,approval:null,receipt:null,busy:false,error:null,operationId:null,ended:false,
  viewReadStartedAtMs:null,consentTargetChanged:false,reviewStopped:false,aiApprovalUnknown:false,aiApprovalReceipt:null,aiApprovalReadStartedAtMs:null},active,createKey,consentIntent,lastReviewKey;
 const reviewWindow=()=>displayedReviewWindow(state.view,{nowMs:elapsedNow(),readStartedAtMs:state.viewReadStartedAtMs});
 const aiRemaining=()=>{const a=state.bootstrap?.aiApproval,age=elapsedNow()-state.aiApprovalReadStartedAtMs;
  return a&&Number.isFinite(age)&&age>=0?a.approvalWindowEndsAtMs-a.observedAtMs-age:-1;};
 const snapshot=()=>structuredClone({...state,consentReplayPending:!!consentIntent,reviewWindow:reviewWindow(),aiApprovalRemainingMs:aiRemaining(),
  canAgree:!!state.view&&!!ready(state.view)&&!consentIntent&&!state.reviewStopped&&!state.consentTargetChanged
   &&(reviewWindow()?.remainingMs??0)>REVIEW_WINDOW.settlementReserveSeconds*1000});
 const emit=()=>changed(snapshot());
 async function run(action,{reading=false}={}){check(!state.busy&&!state.ended,'TEST_BUSY_OR_ENDED');state.busy=true;if(!reading)state.error=null;active=new AbortController();emit();
  try{const result=await action(active.signal);state.error=null;return result;}catch(e){state.view=null;state.operations=null;if(state.bootstrap?.aiApproval)state.bootstrap={...state.bootstrap,aiApproval:null};if(!reading)state.approval=null;state.error={code:/^(?:(?:TEST_|BC_|AUTH_|WALLET_)[A-Z0-9_]{1,100}|FORBIDDEN|CSRF|ORIGIN|TRANSPORT|SIGNATURE)$/.test(e.code??e.message)?(e.code??e.message):'TEST_ACTION_FAILED',outcome:e.outcome??'NOT_SENT'};throw e;}
  finally{state.busy=false;active=null;emit();}}
 const app=()=>{check(state.applicationId,'TEST_APPLICATION_REQUIRED');return state.applicationId;};
 const participant=()=>check(state.bootstrap?.role==='PARTICIPANT','TEST_PARTICIPANT_ONLY');
 const normalSession=async signal=>{state.aiApprovalReadStartedAtMs=elapsedNow();const b=await api.session({signal});check(b.policyHash===state.config.policyHash,'TEST_POLICY');
  if(b.expectedPayment)check(/^0x[0-9a-f]{40}$/.test(b.expectedPayment.recipient)&&/^0x[0-9a-f]{40}$/.test(b.expectedPayment.token)
   &&b.expectedPayment.amountAtoms==='100000000'&&b.expectedPayment.symbol==='TEST'&&b.expectedPayment.decimals===6,'TEST_PAYMENT_TARGET');
  if(state.bootstrap?.expectedPayment)check(JSON.stringify(state.bootstrap.expectedPayment)===JSON.stringify(b.expectedPayment),'TEST_PAYMENT_TARGET_CHANGED');
  check(!b.applicationId||!state.applicationId||b.applicationId===state.applicationId,'TEST_APPLICATION_CHANGED');state.bootstrap=b;if(b.applicationId)state.applicationId=b.applicationId;return b;};
 const ready=v=>state.bootstrap?.phase==='AWAITING_AUTHENTICATED_APP_CONSENTS'
  &&v?.decision?.current&&v.decision.evidenceCurrent&&v.decision.conditionsStatus==='MET'
  &&v.criteria?.length===4&&v.criteria.every(r=>r.current&&r.state==='MET')
  &&v.funding?.matchesCurrentDecision===true&&v.funding.status==='FULLY_ALLOCATED'&&v.funding.amountAtoms==='100000000'&&v.funding.reservedAtoms==='100000000'
  &&v.procedure?.publishedDecisionId===v.decision.id&&Number.isSafeInteger(v.procedure.firstStartedAt)
  &&v.consent?.scopeHash&&v.objection?.blocked===false&&!!state.bootstrap?.expectedPayment;
 const reviewKey=v=>JSON.stringify([v.applicationId,v.target.expectedRevision,v.decision.id,v.decision.revision,v.decision.hash,
  v.funding.allocationId,state.bootstrap?.expectedPayment,v.consent.scopeHash]);
 const refresh=automatic=>run(async signal=>{check(state.identity,'AUTH_REQUIRED');await normalSession(signal);
  state.view=null;state.operations=null;if(!automatic)state.approval=null;
  if(!state.applicationId)return;
  const started=elapsedNow();
  try{const v=await api.view(app(),{signal});state.view=v;state.viewReadStartedAtMs=started;
   if(ready(v)){
    const key=reviewKey(v),changed=lastReviewKey!==undefined&&lastReviewKey!==key;
    if((lastReviewKey===undefined||changed)&&(reviewWindow()?.remainingMs??0)<REVIEW_WINDOW.firstDisplaySeconds*1000)state.reviewStopped=true;
    if(changed&&automatic)state.consentTargetChanged=true;
    if(!automatic)state.consentTargetChanged=false;lastReviewKey=key;
   }else if(lastReviewKey!==undefined&&state.bootstrap?.phase==='AWAITING_AUTHENTICATED_APP_CONSENTS')state.reviewStopped=true;
  }catch(e){if(e.code!=='BC_NORMAL_PROCEDURE_NOT_READY')throw e;
   const o=await session.request('/bootcamp/v2/applications/'+app()+'/operations',{signal});check(o.version==='clear-bootcamp-operations-projection.2'&&o.applicationId===app()&&o.policyHash===state.bootstrap.policyHash&&o.runtimeMappingHash===state.bootstrap.runtimeMappingHash,'TEST_OPERATIONS');state.operations=o;}
 },{reading:automatic});
 const sendConsent=async signal=>{const intent=consentIntent;check(intent,'TEST_NO_PENDING_CONSENT');try{
  const r=await api.consent(app(),intent.view,intent.value,{idempotencyKey:intent.key,signal});state.operationId=r.record.operationId;consentIntent=null;state.view=null;return r;
 }catch(e){if(!unknown(e))consentIntent=null;throw e;}};
 return Object.freeze({snapshot,
  config:()=>run(async signal=>{const c=await session.publicRead('/__dev/config',{signal});check(c.version==='clear-bootcamp-frontend-host.1'&&c.sourceMode==='REGISTERED_TEST_SOURCE'&&c.productionEnabled===false,'TEST_HOST');if(state.identity&&(c.chainId!==state.config.chainId||c.policyHash!==state.config.policyHash||c.origin!==state.config.origin||c.phase!=='ACTIVE_LOCAL_TEST')){await session.end();check(false,'TEST_HOST_CHANGED');}state.config=c;}),
  network:()=>run(signal=>session.network(state.config,{signal})),
  login:()=>run(async signal=>{state.identity=await session.login(state.config,{signal});await normalSession(signal);}),
  refresh:()=>refresh(false),
  readLive:()=>refresh(true),
  create:()=>run(async signal=>{participant();check(!state.applicationId,'TEST_APPLICATION_EXISTS');createKey??='test-create-'+id();
   const r=await session.request('/bootcamp/v1/applications',{method:'POST',body:{},idempotencyKey:createKey,signal});check(/^[a-z][a-z0-9.-]{0,63}$/.test(r.record?.applicationId??''),'TEST_APPLICATION');state.applicationId=r.record.applicationId;}),
  bind:()=>run(async signal=>{participant();await api.bindSourceSession(app(),{signal});await normalSession(signal);}),
  approval:()=>run(async signal=>{participant();state.approval=await api.pendingSourceSignature(app(),{signal});}),
  sign:()=>run(async signal=>{participant();const a=state.approval;check(a&&now()<a.expiresAt*1000,'TEST_APPROVAL_EXPIRED');state.approval=null;
   const signature=await session.sign(a.message,{signal});check(!signal.aborted&&now()<a.expiresAt*1000,'TEST_APPROVAL_EXPIRED');await api.submitSourceSignature(app(),a,signature,{signal});}),
  consent:value=>run(async signal=>{check(state.view&&!consentIntent&&['AGREE','WITHDRAW'].includes(value),'TEST_REFRESH_BEFORE_CONSENT');
   if(value==='AGREE')check(ready(state.view)&&!state.reviewStopped&&!state.consentTargetChanged
    &&(reviewWindow()?.remainingMs??0)>REVIEW_WINDOW.settlementReserveSeconds*1000,'TEST_REVIEW_WINDOW_REQUIRED');
   consentIntent={view:structuredClone(state.view),value,key:'test-consent-'+id()};return sendConsent(signal);}),
  approveAi:()=>run(async signal=>{const a=state.bootstrap?.aiApproval;
   check(a?.permitted&&a.status==='WAITING'&&!state.aiApprovalUnknown&&a.applicationId===app(),'TEST_AI_APPROVAL_NOT_READY');
   check(aiRemaining()>=0,'TEST_AI_APPROVAL_NOT_READY');
   const body={version:'clear-normal-ai-approval-action.1',applicationId:app(),bodySha256:a.bodySha256,planHash:a.planHash,
    contextHash:a.contextHash,runBindingHash:a.runBindingHash,codeHead:a.codeHead,model:a.model,
    action:'APPROVE_THIS_INPUT_ONCE',costAcknowledgment:a.costAcknowledgment};
   try{const result=await session.request('/bootcamp/v4/applications/'+app()+'/reflection-approval',
     {method:'POST',body,idempotencyKey:'test-ai-'+id(),signal});
    check(result?.version==='clear-normal-ai-approval-receipt.1'&&result.applicationId===app()
     &&result.runBindingHash===a.runBindingHash&&result.status==='RECORDED'&&result.paymentConsentIncluded===false,'TEST_AI_APPROVAL_RESPONSE');
    state.aiApprovalReceipt=result;state.bootstrap.aiApproval={...a,permitted:false,status:'RECORDED'};return result;
   }catch(e){if(unknown(e))state.aiApprovalUnknown=true;throw e;}
  }),
  replayConsent:()=>run(sendConsent),
  receipt:()=>run(async signal=>{state.receipt=null;emit();state.receipt=await api.paymentReceipt(app(),{signal});}),
  operation:()=>run(async signal=>{check(state.operationId,'TEST_NO_OPERATION');return api.operation(app(),state.operationId,{signal});}),
  cancel(){active?.abort();state.view=null;state.approval=null;emit();},
  async end(){active?.abort();state={config:state.config,ended:true,busy:false,error:null,identity:null,bootstrap:null,applicationId:null,view:null,operations:null,approval:null,receipt:null,operationId:null};consentIntent=null;emit();return session.end();}
 });
}

// Only GETs. A poll never logs in, signs, approves, consents, creates or replays a POST.
export function createTestAutoReader({driver,setTimer=setTimeout,clearTimer=clearTimeout,visible=()=>true,pollMs=REVIEW_WINDOW.pollMs}={}){
 let timer=null,reading=false,enabled=true,closed=false;
 const retryable=new Set(['BC_VIEW_STALE','BC_NORMAL_STALE']);
 const stopTimer=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const sync=()=>{
  const s=driver.snapshot();
  if(closed||!enabled||!visible()||!s.identity||s.ended||s.busy||s.consentReplayPending
    ||s.aiApprovalUnknown||s.error&&!retryable.has(s.error.code)){stopTimer();return;}
  if(timer===null&&!reading)timer=setTimer(async()=>{timer=null;reading=true;
   try{await driver.readLive();}catch{}finally{reading=false;sync();}
  },pollMs);
 };
 return Object.freeze({sync,setEnabled(value){enabled=value===true;sync();},get enabled(){return enabled;},close(){closed=true;stopTimer();}});
}
