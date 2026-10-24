// Fixed diagnostic vocabulary only: never serialize errors, requests or certificates.
const codes=new Set(['OK','E5_CHECKPOINT_CAS_RETRY_REQUIRED','E5_ROLE_NONCE_BUSY','E5_CAPABILITY_EXPIRED','E5_LEASE_EXPIRED','E5_TEST_GATE_TIMEOUT','E5_STALE_WORKER','E5_SEAL_FAILED','E5_RECOVERY_BLOCKED']);
const phases=new Set(['INIT','READY','START','NONCE_READY','CHECKPOINT_READY','BEFORE_SIGN','BEFORE_NONCE_RESERVATION','BEFORE_KEY_FINAL_SYNC','BEFORE_TRANSACTION_KEY_FINAL_SYNC','AFTER_SIGN','AFTER_SIGN_FINAL_SYNC','BEFORE_PRIVATE_BYTES','SEALED_FINAL_SYNC','DONE']);
const cuts=new Set(['none','RESERVED_BEFORE_SIGN','SIGNED_BEFORE_RECHECK','BYTES_DURABLE_BEFORE_SEALED','SEALED_BEFORE_API_COMMIT','SEND_STARTED_BEFORE_BROADCAST','BROADCAST_RESPONSE']);
const nativeCodes=new Set(['ERR_SQLITE_ERROR','SQLITE_BUSY','SQLITE_LOCKED','ETIMEDOUT']);
const count=x=>Number.isSafeInteger(x)&&x>=0?x:0;
export function childDiagnostic({code,nativeCode,phase,cut,metrics={},buildMs,elapsedMs,leaseRemainingSeconds}={}){
 return {code:codes.has(code)?code:'E5_CHILD_UNCLASSIFIED',nativeCode:nativeCodes.has(nativeCode)?nativeCode:null,phase:phases.has(phase)?phase:'INIT',cut:cuts.has(cut)?cut:'none',buildMs:count(buildMs),elapsedMs:count(elapsedMs),leaseRemainingSeconds:Number.isSafeInteger(leaseRemainingSeconds)?leaseRemainingSeconds:null,metrics:Object.fromEntries(['keyAccesses','paymentSignatures','transactionSignatures','broadcasts'].map(k=>[k,count(metrics[k])]))};
}
