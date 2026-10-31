import {executionErrorSummary} from '../../src/bootcamp/execution-diagnostics.mjs';
const recoverable=new Set(['BC_PRODUCER_FAILED','BC_PRODUCER_TIMEOUT','BC_REQUEST_STALE','BC_VIEW_STALE','BC_NORMAL_NOT_MET','BC_LIVE_ALL_CURRENT_MET','BC_LIVE_AI_PREPARATION_STALE','NORMAL_HOST_PREPARED_SOURCE_EXPIRED','BC_RECIPIENT_REGISTRATION_EXPIRED','BC_NORMAL_REVIEW_WINDOW_REQUIRED','BC_NORMAL_REVIEW_SCREENS_REQUIRED','NORMAL_HOST_WAIT_EXPIRED','NORMAL_MODEL_STOPPED','BC_NORMAL_RECEIPT_PENDING','BC_NORMAL_CLAIM_PENDING','E5_RPC_TIMEOUT','E5_RPC_TRANSPORT','E5_RPC_HTTP','E5_RECEIPT_TIMEOUT']);
const fatal=new Set(['FORBIDDEN','AUTH_REQUIRED','ERR_SQLITE_ERROR','SQLITE_BUSY','SQLITE_LOCKED','ENOSPC','EIO','NORMAL_RUN_CHANGED','NORMAL_RUN_OWNER','NORMAL_RUN_CAPABILITY','NORMAL_RUN_APPROVAL','NORMAL_RUN_CONTEXT','NORMAL_APPROVAL_REQUIRED','NORMAL_CODE']);
export function normalFailureState(error,{phase,collectionFailure=null,paymentStarted=false}={}){
 const summary=executionErrorSummary(error);
 if(!recoverable.has(summary.code)||[summary,...summary.causes,collectionFailure,...(collectionFailure?.causes??[])].some(item=>fatal.has(item?.code)))return null;
 const safePhase=['SOURCE_python-basic-certificate','SOURCE_reflection-topics','SOURCE_activity-complete','SOURCE_assignment-submitted','AWAITING_EXACT_REFLECTION_APPROVAL'].includes(phase)?phase:paymentStarted?'PAYMENT':'SOURCE';
 return Object.freeze({status:'FAILED_WAITING',phase:safePhase,code:summary.code,
  producerCode:collectionFailure?executionErrorSummary({code:collectionFailure.code}).code:null,writeAllowed:false,retryAllowed:false,
  outcome:paymentStarted||phase==='SOURCE_reflection-topics'?'UNKNOWN':'NOT_INFERRED',
  nextAction:'READ_STATUS_THEN_EXPLICIT_FINISH',automaticRetry:false});
}
