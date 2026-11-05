// Pure operator-wrapper adapter. No auth, network, approval, executor or UI mount.
// Keeps standalone D/native v2.1 unchanged. Successful conversion is DISPLAY_ONLY.
import {toPanelProposal} from './condition-proposal-v21.js';

const check=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const exact=(v,keys)=>check(v && Object.getPrototypeOf(v)===Object.prototype
  && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k)),'OPERATOR_FIELDS');
const freeze=v=>{if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const hex=v=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const positive=v=>Number.isSafeInteger(v) && v>0;
const keys=['appContextRef','contextRef','revision','generation','sourceText','bodyHash','sourceHash','proposalHash'];
function snapshot(value){
  const v=structuredClone(value);exact(v,keys);
  check(typeof v.appContextRef==='string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v.appContextRef),'OPERATOR_APP_CONTEXT');
  check(typeof v.contextRef==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.contextRef),'OPERATOR_CONTEXT');
  check(positive(v.revision) && Number.isSafeInteger(v.generation) && v.generation>=0,'OPERATOR_REVISION');
  check(typeof v.sourceText==='string' && v.sourceText.length>0 && v.sourceText.length<=4096 && v.sourceText.isWellFormed(),'OPERATOR_SOURCE');
  check(['bodyHash','sourceHash','proposalHash'].every(k=>hex(v[k])),'OPERATOR_PIN');
  return freeze(v);
}
function synchronous(fn){
  const value=fn();
  if(value && typeof value.then==='function'){
    Promise.resolve(value).catch(()=>{});check(false,'OPERATOR_SYNC_REQUIRED');
  }
  return value;
}

/** expected is the caller's pinned snapshot, not values inferred from this reply.
 * readCurrent returns the current snapshot with exactly the same keys.
 * assertCurrent(): void synchronously throws on logout/scope/deployment/closure.
 * The owner must clear generation/pins at edit/logout and recheck on later use.
 * This function accepts only PROPOSED; RELAY/D_HTTP failures stay separate.
 */
export async function toOperatorPanel(packet,{expected,readCurrent,assertCurrent,clock=Date.now}={}){
  check(typeof readCurrent==='function' && typeof assertCurrent==='function' && typeof clock==='function','OPERATOR_CURRENT_REQUIRED');
  const pin=snapshot(expected),reply=structuredClone(packet);
  check(reply?.version==='clear-operator-preview.1','OPERATOR_VERSION');
  check(reply.stage==='PROPOSED','OPERATOR_NOT_SUCCESS');
  exact(reply,['version','scope','automaticEligibility','paymentAllowed','stage','contextRef','revision','expiresAt','generated']);
  check(reply.scope==='PRECONFIGURATION_ONLY' && reply.automaticEligibility===false && reply.paymentAllowed===false,'OPERATOR_GATES');
  check(reply.contextRef===pin.contextRef && reply.revision===pin.revision,'OPERATOR_CONTEXT_PIN');
  check(positive(reply.expiresAt) && positive(reply.generated?.expiresAt),'OPERATOR_EXPIRY');
  const d=reply.generated;
  check(d.version==='clear-external-preview-draft.1','OPERATOR_D_VERSION');
  check(d.bodyHash===pin.bodyHash && d.proposal?.proposalHash===pin.proposalHash
    && d.proposal?.sourceHash===pin.sourceHash && d.draft?.sourceText===pin.sourceText,'OPERATOR_PIN');
  const expiresAt=Math.min(reply.expiresAt,d.expiresAt);let floor=0;
  function current(){
    check(synchronous(assertCurrent)===undefined,'OPERATOR_NOT_CURRENT');
    const now=synchronous(clock);
    check(positive(now) && now>=floor && now<expiresAt,'OPERATOR_EXPIRED');floor=now;
    const live=snapshot(synchronous(readCurrent));
    check(keys.every(k=>live[k]===pin[k]),'OPERATOR_NOT_CURRENT');
    return now;
  }
  const now=current();
  const panel=await toPanelProposal(pin.sourceText,d,{expectedBodyHash:pin.bodyHash,
    expectedProposalHash:pin.proposalHash,now,executionContract:'DISPLAY_ONLY'});
  // No await after this check: crypto verification may outlive the pin/TTL.
  current();
  return freeze({...panel,canExecute:false,
    serverBinding:{...panel.serverBinding,expiresAt},
    operatorBinding:{version:'clear-operator-panel-binding.1',...pin,expiresAt,
      outerExpiresAt:reply.expiresAt,dExpiresAt:d.expiresAt}});
}
