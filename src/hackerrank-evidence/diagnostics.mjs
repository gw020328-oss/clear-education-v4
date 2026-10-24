// Observer only. No request, identity, raw input, message, stack or transport
// object is serialized. These fixed vocabularies require explicit source review.
import {types} from 'node:util';
import {CLAIM_RETURN_REASON_HINTS} from './claim-return-diagnostics.mjs';
export const SOURCE_DIAGNOSTIC_STAGES=Object.freeze([
 'NORMAL_FLOW','MANAGED_SOURCE','HR_COLLECTION','PREPARED_SOURCE',
 'SIGNATURE_WAIT','SIGNATURE_ACCEPTANCE','PARTICIPANT_ENVELOPE_VERIFY','COLLECTOR_SETUP',
 'UI_SESSION_AUTHORITY','UI_APPLICATION_PROJECTION','UI_APPLICATION_BINDING',
 'ACCOUNT_COOKIE_READ','ACCOUNT_CLAIM_CALL','ACCOUNT_RESPONSE_INSPECTION','ACCOUNT_PROOF_RETURN','ACCOUNT_OFFICIAL_VERIFY',
 'CERTIFICATE_COOKIE_READ','CERTIFICATE_CLAIM_CALL','CERTIFICATE_RESPONSE_INSPECTION','CERTIFICATE_PROOF_RETURN',
 'PAIR_OFFICIAL_VERIFY','CANDIDATE_LEASE',
 ...['ACCOUNT','CERTIFICATE'].flatMap(role=>[
  'SDK_CALL','SDK_RETURN','RETURN_VALIDATION','SDK_ABORT_OBSERVED','SDK_CONNECTING',
  'SDK_SENDING_REQUEST','SDK_WAITING_RESPONSE','SDK_ZK_PROGRESS_OBSERVED','SDK_VERIFICATION_PHASE_OBSERVED',
  'SDK_CLAIM_RPC_OBSERVER','SDK_CLAIM_RPC','SDK_RPC_SEND',
 ].map(stage=>`${role}_${stage}`)),
]);
// Ordered by the pinned 5.1.4 protobuf failure enum. Zero and UNRECOGNIZED
// are deliberately absent. Classification of an SDK object belongs to its caller.
export const SOURCE_DIAGNOSTIC_SDK_CODES=Object.freeze([
 'ERROR_INTERNAL','ERROR_BAD_REQUEST','ERROR_NOT_FOUND','ERROR_PROXY_ERROR','ERROR_INVALID_CLAIM',
 'ERROR_NETWORK_ERROR','ERROR_PAYMENT_REFUSED','ERROR_BGP_ANNOUNCEMENT_OVERLAP',
 'ERROR_AUTHENTICATION_FAILED','ERROR_TIMEOUT','ERROR_TOPRF_OUT_OF_BOUNDS','ERROR_CERTIFICATE_FETCH_FAILED',
]);
const codes=new Set(`
ACCOUNT_JOIN AMBIGUOUS_CERTIFICATE AUTH_REQUIRED BC_CANCELLED BC_CLOCK_REVERSED BC_COMMIT_AUTHORITY BC_LIVE_CONTEXT BC_VIEW_STALE
BC_NORMAL_REVIEW_WINDOW_REQUIRED BC_NORMAL_REVIEW_SCREENS_REQUIRED E5B_CONTROLLER_REJECTED
BC_PRODUCER_FAILED BC_PRODUCER_TIMEOUT BC_REQUEST_STALE BC_REVISION_CONFLICT BC_SOURCE_UNKNOWN
BC_UI_ALREADY_BOUND BC_UI_APPLICATION_CHANGED BC_UI_CLOSED BC_UI_CONTEXT_CHANGED BC_UI_CONTEXT_UNAVAILABLE
BC_UI_IDENTITY_CONFIG BC_UI_PARTICIPANT_REQUIRED BC_UI_SIGNATURE BC_UI_SIGNATURE_BODY BC_UI_SIGNATURE_CANCELLED
BC_UI_SIGNATURE_EXPIRED BC_UI_SIGNATURE_MESSAGE BC_UI_SIGNATURE_NOT_PENDING BC_UI_SIGNATURE_REQUEST_USED
BC_UI_SIGNATURE_SOURCE BC_UI_SIGNATURE_TARGET CANDIDATE_EXPIRED CERTIFICATE_CLASS_OR_SELECTION CERTIFICATE_FIELDS
CERTIFICATE_ID CERTIFICATE_METADATA CERTIFICATE_METADATA_CONFLICT CERTIFICATE_RECORDS CERTIFICATE_RECORD_SHAPE
CERTIFICATE_SHADOW_ID CLAIM_EPOCH CLAIM_IDENTIFIER CLAIM_OWNER CLAIM_OWNER_OR_PROVIDER CLAIM_SHAPE CLAIM_SIGNATURE
COLLECTION_FAILED COLLECTOR_AUTHORITY COLLECTOR_BROWSER_PAGE COLLECTOR_CANCELLED COLLECTOR_CLEANUP_FAILED
COLLECTOR_CLOSED COLLECTOR_COOKIES COLLECTOR_COOKIE_DOMAIN COLLECTOR_COOKIE_NAME COLLECTOR_COOKIE_VALUE
COLLECTOR_HOST_PORTS COLLECTOR_LEASE_CLOSED COLLECTOR_NAVIGATION COLLECTOR_OWNER COLLECTOR_PAIR_REJECTED
COLLECTOR_PORT COLLECTOR_PROOF_LIMIT COLLECTOR_SAME_CLIENT COLLECTOR_SESSION COLLECTOR_SIGNED_CLAIM
COLLECTOR_SOURCE_URL COLLECTOR_TEST_DRIVER CSRF ECONNREFUSED ECONNRESET ENOTFOUND ERR_PACKAGE_PATH_NOT_EXPORTED
ERR_MODULE_NOT_FOUND ERR_SQLITE_ERROR ETIMEDOUT EXPECTED_REQUEST_MISMATCH EXTRACTED_FIELDS FORBIDDEN INPUT_LIMIT
INPUT_SHAPE INVALID_INPUT LOCKED_LAUNCHER_REQUIRED PARTICIPANT_SIGNATURE PROOF_PAIR PROOF_SHAPE PROOF_TIME
PROVIDER_HASH REQUEST_DOMAIN REQUEST_EXPIRED REQUEST_IDENTITY REQUEST_POLICY REQUEST_RECIPE REQUEST_SELECTION
REQUEST_SHAPE REQUEST_TRUST REQUEST_WINDOW SIGNED_CONTEXT_REQUIRED SIGNED_REQUEST_BINDING SIGNED_JSON SIGNED_JSON_LIMIT
SESSION_CONTEXT WALLET_CONTEXT_CHANGED SOURCE_JSON SOURCE_JSON_KEY SOURCE_JSON_LIMIT SOURCE_RECIPE SOURCE_RECORD_REDACTED SOURCE_USERNAME
TRUST_EPOCHS TRUST_EXPIRED TRUST_MODE TRUST_NOT_CONFIGURED TRUST_SHAPE TRUST_SIGNERS TRUST_SOURCE_REVIEW TRUST_VERSION
TRUST_WINDOW UNKNOWN_ISSUER_STATUS UNTRUSTED_CANDIDATE UNTRUSTED_COLLECTOR_LEASE UNTRUSTED_SIGNER
WORKER_ACCOUNT_COPIES WORKER_ACCOUNT_PATH WORKER_ACCOUNT_SCRIPT WORKER_CERTIFICATE_PATH WORKER_COLLECTION_FAILED
WORKER_EXTRACTION_MISMATCH WORKER_HOOK_REQUIRED WORKER_HOOK_REUSED WORKER_HTML_LIMIT WORKER_HTTP_ENCODING
WORKER_HTTP_FRAMING WORKER_HTTP_HEADERS WORKER_HTTP_INTERPRETATION WORKER_HTTP_LIMIT WORKER_HTTP_STATUS
WORKER_HTTP_TYPE WORKER_PROTOCOL WORKER_RECIPE_POLICY WORKER_REDACTIONS WORKER_REQUEST_LIMIT WORKER_REQUEST_MISMATCH
WORKER_SIGNED_CLAIM WORKER_SIGNED_FIELDS WORKER_SOURCE_BINDING WORKER_SOURCE_REQUIRED WORKER_TRANSCRIPT
WORKER_TRANSCRIPT_REJECTED DUPLICATE_OR_UNSAFE_JSON_KEY
`.trim().split(/\s+/));
export function sourceDiagnosticCode(error){
 // Do not invoke getters, stringify errors, walk causes or read a stack.
 if(types.isProxy(error))return 'UNKNOWN_ERROR';
 try{for(const key of ['code','message']){
  const value=Object.getOwnPropertyDescriptor(error,key)?.value;
  if(typeof value==='string'&&codes.has(value))return value;
 }}catch{}
 return 'UNKNOWN_ERROR';
}
const owned=new WeakSet();
const own=(value,key)=>{try{return types.isProxy(value)?undefined:Object.getOwnPropertyDescriptor(value,key)?.value;}catch{return undefined;}};
function claimReturnDetails(value,invalidClaim){
 if(!value||typeof value!=='object'||types.isProxy(value))return null;
 const hint=own(value,'reasonHint');
 const result={basis:'REMOTE_ERROR_HINT',reasonHint:invalidClaim&&CLAIM_RETURN_REASON_HINTS.includes(hint)?hint:'UNKNOWN'};
 for(const key of ['errorPresent','claimPresent','claimSignaturePresent','resultSignaturePresent']){
  const flag=own(value,key);result[key]=typeof flag==='boolean'?flag:null;
 }
 return Object.freeze(result);
}
const systemCodes=new Set(['ECONNREFUSED','ECONNRESET','ENOTFOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_MODULE_NOT_FOUND','ERR_SQLITE_ERROR','ETIMEDOUT']);
const transportCodes=['ATTESTOR_BACKPRESSURE_LIMIT','ATTESTOR_MESSAGE_LIMIT','ATTESTOR_QUEUE_LIMIT','ATTESTOR_QUEUE_TIMEOUT','ATTESTOR_SEND_TIMEOUT','ATTESTOR_SEND_FAILED','ATTESTOR_SEND_ABORTED','ATTESTOR_SEND_CLOSED'];
function sendDetails(value){
 const phase=own(value,'phase');
 if(!['ADMISSION','QUEUED','DRAIN_WAIT','SENDING','COMPLETE'].includes(phase))return null;
 const reason=own(value,'terminalReason'),result={phase,terminalReason:transportCodes.includes(reason)?reason:null};
 for(const key of ['frameBytes','socketQueuedBytes','retainedBytes','pendingCount','frameLimitBytes','retainedLimitBytes','pendingCountLimit','terminalFrameBytes','terminalSocketQueuedBytes','terminalRetainedBytes','terminalPendingCount']){
  const n=own(value,key);result[key]=Number.isSafeInteger(n)&&n>=0?n:null;
 }
 for(const key of ['timeoutMs','waitMs','sendMs']){
  const n=own(value,key);result[key]=typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
 }
 return Object.freeze(result);
}
export function createSourceDiagnostics({persist,monotonicNow=()=>performance.now()}={}){
 const stages=Object.fromEntries(SOURCE_DIAGNOSTIC_STAGES.map(stage=>[stage,{state:'NOT_OBSERVED',completedObserved:false}]));
 const events=[],starts=new Map();let persistence='COMPLETE',timing='COMPLETE',firstFailure=null,truncated=false,origin,last;
 const elapsed=()=>{
  if(timing==='INCOMPLETE')return null;
  try{
   const at=monotonicNow();
   if(typeof at!=='number'||!Number.isFinite(at)||at<0||(last!==undefined&&at<last))throw null;
   origin??=at;last=at;const relative=at-origin;if(!Number.isFinite(relative))throw null;return relative;
  }catch{timing='INCOMPLETE';return null;}
 };
 elapsed();
 const snapshot=()=>structuredClone({version:'clear-normal-source-diagnostics.5',persistence,timing,truncated,
  signatureAcceptance:stages.SIGNATURE_ACCEPTANCE.completedObserved?'ACCEPTED':'UNKNOWN',stages,firstFailure,events});
 const save=()=>{try{if(typeof persist!=='function')throw null;persist(snapshot());}catch{persistence='INCOMPLETE';}};
 const diagnostics=Object.freeze({snapshot,record(stage,state,error,details){
  if(!SOURCE_DIAGNOSTIC_STAGES.includes(stage)||!['STARTED','COMPLETED','FAILED','DEFERRED','OBSERVED'].includes(state))return;
  if(state==='DEFERRED'&&(stage!=='UI_APPLICATION_PROJECTION'||sourceDiagnosticCode(error)!=='BC_VIEW_STALE'))return;
  const sdkReturn=stage.endsWith('_SDK_RETURN'),send=stage.endsWith('_SDK_RPC_SEND'),sdkCall=stage.endsWith('_SDK_CALL')||stage.endsWith('_SDK_CLAIM_RPC')||send;
  if(state==='OBSERVED'&&!(sdkReturn||send||stage.includes('_SDK_')&&!sdkCall))return;
  if(events.length>=128){if(!truncated){truncated=true;save();}return;}
  const offsetMs=elapsed(),start=starts.get(stage);
  const durationMs=(state==='COMPLETED'||state==='FAILED')&&typeof start==='number'&&offsetMs!==null?offsetMs-start:null;
  if(state==='STARTED')starts.set(stage,offsetMs);else if(state==='COMPLETED'||state==='FAILED')starts.delete(stage);
  const kind=own(details,'resultKind'),resultKind=sdkReturn&&['ERROR','MISSING_SIGNATURE','MALFORMED','SIGNED_CLAIM','UNKNOWN'].includes(kind)?kind:null;
  let code=state==='FAILED'||state==='DEFERRED'?sourceDiagnosticCode(error):null;
  let codeNamespace=code===null?null:code==='UNKNOWN_ERROR'?'UNKNOWN':systemCodes.has(code)?'SYSTEM':'CLEAR';
  let codeBasis=code===null?null:code==='UNKNOWN_ERROR'?'UNKNOWN':'FIXED_CODE_OR_MESSAGE';
  if((sdkCall&&state==='FAILED')||(sdkReturn&&resultKind==='ERROR')){
   const sdkCode=own(details,'sdkCode');
   if(SOURCE_DIAGNOSTIC_SDK_CODES.includes(sdkCode)){code=sdkCode;codeNamespace='ATTESTOR_SDK';codeBasis=sdkCall?'ATTESTOR_ERROR_OWN_CODE':'PROTO_ERROR_CODE';}
   else if(sdkReturn){code='UNKNOWN_ERROR';codeNamespace=codeBasis='UNKNOWN';}
   const bounded=own(details,'boundedSendCode');
   if(sdkCall&&transportCodes.includes(bounded)){code=bounded;codeNamespace='CLEAR_TRANSPORT';codeBasis='OWNED_BOUNDED_SEND';}
  }
  const abort=own(details,'aborted'),aborted=typeof abort==='boolean'?abort:null;
  const kindValue=own(details,'errorKind'),codeKindValue=own(details,'ownCodeKind');
  const errorKind=sdkCall&&state==='FAILED'&&['OWNED_BOUNDED_SEND','HR_ATTESTOR_ERROR','TRANSPORT_ATTESTOR_ERROR','NATIVE_TYPE_ERROR','NATIVE_RANGE_ERROR','NATIVE_ERROR','NON_ERROR','UNKNOWN'].includes(kindValue)?kindValue:null;
  const ownCodeKind=sdkCall&&state==='FAILED'&&['ABSENT','ACCESSOR','STRING','NUMBER','OTHER','UNKNOWN'].includes(codeKindValue)?codeKindValue:null;
  const transport=send||(sdkCall&&codeBasis==='OWNED_BOUNDED_SEND')?sendDetails(own(details,'transport')):null;
  // A remote text classification is only a hint. It never changes the SDK code,
  // firstFailure, validation outcome, or signature/claim authority.
  const claimReturn=sdkReturn&&state==='OBSERVED'?claimReturnDetails(own(details,'claimReturn'),code==='ERROR_INVALID_CLAIM'):null;
  const event=Object.freeze({sequence:events.length+1,stage,state,code,codeNamespace,codeBasis,offsetMs,durationMs,aborted,resultKind,errorKind,ownCodeKind,transport,claimReturn});
  events.push(event);stages[stage]={state,completedObserved:stages[stage].completedObserved||state==='COMPLETED'};
  if(state==='FAILED'&&!firstFailure)firstFailure=event;
  save();
 }});
 owned.add(diagnostics);save();return diagnostics;
}
export function observeSource(diagnostics,stage,state,error,details){
 // Never change an original result/exception, trigger an async retry, or call
 // an untrusted duck-typed observer. Persistence is synchronous, best effort.
 try{if(owned.has(diagnostics))diagnostics.record(stage,state,error,details);}catch{}
}
