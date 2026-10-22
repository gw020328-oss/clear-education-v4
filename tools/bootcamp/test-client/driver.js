// Button-driven single application only. This is not a product front end or a source/model runner.
const check=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const unknown=e=>e?.outcome==='UNKNOWN';
export function createTestDriver({session,createNormalClient,id=()=>crypto.randomUUID(),now=()=>Date.now(),changed=()=>{}}){
 const api=createNormalClient({request:(...args)=>session.request(...args)});
 let state={config:null,identity:null,bootstrap:null,applicationId:null,view:null,operations:null,approval:null,receipt:null,busy:false,error:null,operationId:null,ended:false},active,createKey,consentIntent;
 const snapshot=()=>structuredClone({...state,consentReplayPending:!!consentIntent});
 const emit=()=>changed(snapshot());
 async function run(action){check(!state.busy&&!state.ended,'TEST_BUSY_OR_ENDED');state.busy=true;state.error=null;active=new AbortController();emit();
  try{return await action(active.signal);}catch(e){state.view=null;state.operations=null;state.approval=null;state.error={code:/^(?:(?:TEST_|BC_|AUTH_|WALLET_)[A-Z0-9_]{1,100}|FORBIDDEN|CSRF|ORIGIN|TRANSPORT|SIGNATURE)$/.test(e.code??e.message)?(e.code??e.message):'TEST_ACTION_FAILED',outcome:e.outcome??'NOT_SENT'};throw e;}
  finally{state.busy=false;active=null;emit();}}
 const app=()=>{check(state.applicationId,'TEST_APPLICATION_REQUIRED');return state.applicationId;};
 const participant=()=>check(state.bootstrap?.role==='PARTICIPANT','TEST_PARTICIPANT_ONLY');
 const normalSession=async signal=>{const b=await api.session({signal});check(b.policyHash===state.config.policyHash,'TEST_POLICY');
  check(!b.applicationId||!state.applicationId||b.applicationId===state.applicationId,'TEST_APPLICATION_CHANGED');state.bootstrap=b;if(b.applicationId)state.applicationId=b.applicationId;return b;};
 const sendConsent=async signal=>{const intent=consentIntent;check(intent,'TEST_NO_PENDING_CONSENT');try{
  const r=await api.consent(app(),intent.view,intent.value,{idempotencyKey:intent.key,signal});state.operationId=r.record.operationId;consentIntent=null;state.view=null;return r;
 }catch(e){if(!unknown(e))consentIntent=null;throw e;}};
 return Object.freeze({snapshot,
  config:()=>run(async signal=>{const c=await session.publicRead('/__dev/config',{signal});check(c.version==='clear-bootcamp-frontend-host.1'&&c.sourceMode==='REGISTERED_TEST_SOURCE'&&c.productionEnabled===false,'TEST_HOST');if(state.identity&&(c.chainId!==state.config.chainId||c.policyHash!==state.config.policyHash||c.origin!==state.config.origin||c.phase!=='ACTIVE_LOCAL_TEST')){await session.end();check(false,'TEST_HOST_CHANGED');}state.config=c;}),
  network:()=>run(signal=>session.network(state.config,{signal})),
  login:()=>run(async signal=>{state.identity=await session.login(state.config,{signal});await normalSession(signal);}),
  refresh:()=>run(async signal=>{check(state.identity,'AUTH_REQUIRED');await normalSession(signal);state.view=null;state.operations=null;state.approval=null;
   if(!state.applicationId)return;
   try{state.view=await api.view(app(),{signal});}catch(e){if(e.code!=='BC_NORMAL_PROCEDURE_NOT_READY')throw e;
    const o=await session.request('/bootcamp/v2/applications/'+app()+'/operations',{signal});check(o.version==='clear-bootcamp-operations-projection.2'&&o.applicationId===app()&&o.policyHash===state.bootstrap.policyHash&&o.runtimeMappingHash===state.bootstrap.runtimeMappingHash,'TEST_OPERATIONS');state.operations=o;}}),
  create:()=>run(async signal=>{participant();check(!state.applicationId,'TEST_APPLICATION_EXISTS');createKey??='test-create-'+id();
   const r=await session.request('/bootcamp/v1/applications',{method:'POST',body:{},idempotencyKey:createKey,signal});check(/^[a-z][a-z0-9.-]{0,63}$/.test(r.record?.applicationId??''),'TEST_APPLICATION');state.applicationId=r.record.applicationId;}),
  bind:()=>run(async signal=>{participant();await api.bindSourceSession(app(),{signal});await normalSession(signal);}),
  approval:()=>run(async signal=>{participant();state.approval=await api.pendingSourceSignature(app(),{signal});}),
  sign:()=>run(async signal=>{participant();const a=state.approval;check(a&&now()<a.expiresAt*1000,'TEST_APPROVAL_EXPIRED');state.approval=null;
   const signature=await session.sign(a.message,{signal});check(!signal.aborted&&now()<a.expiresAt*1000,'TEST_APPROVAL_EXPIRED');await api.submitSourceSignature(app(),a,signature,{signal});}),
  consent:value=>run(async signal=>{check(state.view&&!consentIntent&&['AGREE','WITHDRAW'].includes(value),'TEST_REFRESH_BEFORE_CONSENT');
   consentIntent={view:structuredClone(state.view),value,key:'test-consent-'+id()};return sendConsent(signal);}),
  replayConsent:()=>run(sendConsent),
  receipt:()=>run(async signal=>{state.receipt=null;emit();state.receipt=await api.paymentReceipt(app(),{signal});}),
  operation:()=>run(async signal=>{check(state.operationId,'TEST_NO_OPERATION');return api.operation(app(),state.operationId,{signal});}),
  cancel(){active?.abort();state.view=null;state.approval=null;emit();},
  async end(){active?.abort();state={config:state.config,ended:true,busy:false,error:null,identity:null,bootstrap:null,applicationId:null,view:null,operations:null,approval:null,receipt:null,operationId:null};consentIntent=null;emit();return session.end();}
 });
}
