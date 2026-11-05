// Same browser-local storage boundary as OAuth diagnostics. No network sink.
export const cancelDiagnosticKey = 'clear.moodle.cancel.diagnostic.v1';
const origins = new Set(['workflow-failure','explicit-cancel','wallet-change','expiry','dispatch-failure','command-failure','sign-out','destroy']);
const actions = new Set(['NONE','connect-google','connect-metamask','select-wallet','check-network','sign-in','finish-connection','sign-out','cancel',
 'read-session','create-application','read-application','refresh-activity','start-certificate','bind-source-session','read-source-signature',
 'approve-source-signature','read-registration','approve-registration','approve-reflection','consent','payment-receipt','decision-evidence','read-operation']);
const codes = new Set(['UNKNOWN','CANCELLED','EXPIRED','WALLET_CHANGED','AUTH_REQUIRED','FORBIDDEN','CSRF','ROLE_CHANGED','PRODUCT_ROLE_CHANGED',
 'SESSION_CHANGED','SESSION_CONTEXT','WALLET_CONTEXT_CANCELLED','STALE_SELECTION','NETWORK_UNAVAILABLE','WALLET_REJECTED','WALLET_TIMEOUT',
 'API_REQUEST_FAILED','API_NETWORK','API_TIMEOUT','API_ABORTED','API_RESPONSE_INVALID','BC_VIEW_STALE','MOODLE_WORKFLOW_UNAVAILABLE']);
function property(value,key) { try { return value?.[key]; } catch { return undefined; } }
export function readCancelDiagnostic(storage) {
 try {
  const d=JSON.parse(storage.getItem(cancelDiagnosticKey));
  if(d?.version!==1||d.event!=='CANCEL_TRIGGER'||!origins.has(d.origin)||!actions.has(d.action)||!codes.has(d.causeCode)
   ||!Number.isSafeInteger(d.sequence)||d.sequence<1
   ||!(d.httpStatus===null||Number.isInteger(d.httpStatus)&&d.httpStatus>=100&&d.httpStatus<=599))return null;
  return {version:1,event:'CANCEL_TRIGGER',sequence:d.sequence,origin:d.origin,action:d.action,causeCode:d.causeCode,httpStatus:d.httpStatus};
 } catch { return null; }
}
export function createCancelDiagnostic(storage) {
 let recorded=false,sequence=readCancelDiagnostic(storage)?.sequence??0;
 return Object.freeze({
  reset(){recorded=false;},
  record(origin,action,cause){
   if(recorded)return;recorded=true;
   // Latch before touching storage or exception properties; diagnostics cannot block retirement.
   try {
    if(sequence===Number.MAX_SAFE_INTEGER)return;
    const code=property(cause,'code'),message=property(cause,'message'),status=property(cause,'status');
    const event={version:1,event:'CANCEL_TRIGGER',sequence:++sequence,
     origin:origins.has(origin)?origin:'dispatch-failure',action:actions.has(action)?action:'NONE',
     causeCode:codes.has(code)?code:codes.has(message)?message:'UNKNOWN',
     httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null};
    storage?.setItem(cancelDiagnosticKey,JSON.stringify(event));
   } catch {} // Includes denied storage, quota, and hostile SDK exceptions.
  },
 });
}
