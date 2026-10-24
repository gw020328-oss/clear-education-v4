import {requireRule as check} from '../../src/policy/values.mjs';
import {REVIEW_WINDOW} from './test-client/review-window.js';
import {readNormalView,normalSourceTarget,assertNormalSourceTarget} from './normal-current-view.mjs';
export {REVIEW_WINDOW};

export function requireNormalReviewWindow(deadline,asOf,minimumSeconds=REVIEW_WINDOW.openingSeconds){
  check(Number.isSafeInteger(deadline)&&Number.isSafeInteger(asOf)&&Number.isSafeInteger(minimumSeconds)
    &&minimumSeconds>=0&&deadline-asOf>=minimumSeconds,'BC_NORMAL_REVIEW_WINDOW_REQUIRED');
  return deadline-asOf;
}

export function requireNormalModelWindow(prepared,nowMs=Date.now()){
  check(prepared?.isCurrent()===true,'BC_LIVE_AI_PREPARATION_STALE');
  const expiry=prepared.packet?.leaseExpiresAtMs;
  check(Number.isSafeInteger(expiry)&&Number.isFinite(nowMs)
    &&expiry-nowMs>=REVIEW_WINDOW.beforeModelSeconds*1000,'BC_NORMAL_REVIEW_WINDOW_REQUIRED');
}

export function requireNormalSourceWindow({store,context,applicationId,sourceTarget}){
  const application=readNormalView(()=>store.getApplication(context,applicationId));
  assertNormalSourceTarget(normalSourceTarget(application),sourceTarget);
  const view=readNormalView(()=>store.getProcedure(context,applicationId));assertNormalSourceTarget(view,sourceTarget);
  check(view.evidence.current&&view.evidence.conditionsStatus==='MET'&&view.evidence.criteria.length===4
    &&view.evidence.criteria.every(r=>r.current&&r.state==='MET')
    &&Number.isSafeInteger(view.evidence.validUntilExclusive),'BC_NORMAL_NOT_MET');
  const caps=[view.evidence.validUntilExclusive,view.procedure.reviewCapAt].filter(Number.isSafeInteger);
  return requireNormalReviewWindow(Math.min(...caps),view.asOf);
}

export function requireNormalConsentAction({view,body,phase,sourceTarget,reviewTarget}){
  // Withdrawal retains the existing store policy; this operating gate only restricts new AGREE commands.
  if(body?.value!=='AGREE')return;
  check(phase==='AWAITING_AUTHENTICATED_APP_CONSENTS'&&reviewTarget,'BC_NORMAL_REVIEW_NOT_OPEN');
  check(view.applicationId===sourceTarget.applicationId&&view.applicationRevision===sourceTarget.applicationRevision
    &&view.decisionId===sourceTarget.decisionId&&view.decisionRevision===sourceTarget.decisionRevision
    &&view.decisionHash===sourceTarget.decisionHash,'BC_NORMAL_SOURCE_CHANGED');
  check(body.expectedRevision===sourceTarget.applicationRevision&&body.targetDecisionId===reviewTarget.decisionId
    &&body.targetDecisionRevision===reviewTarget.decisionRevision&&body.targetDecisionHash===reviewTarget.decisionHash
    &&view.decisionId===reviewTarget.decisionId&&view.scopeHash===reviewTarget.consentScopeHash,
    'BC_NORMAL_REVIEW_TARGET_CHANGED');
  check(view.fullyAllocated&&view.amountAtoms==='100000000'
    &&view.reservedAtoms==='100000000'&&!view.objectionBlocked,'BC_NORMAL_REVIEW_REQUIRED');
  requireNormalReviewWindow(Math.min(view.validUntilExclusive,view.reviewCapAt),view.asOf,
    REVIEW_WINDOW.settlementReserveSeconds+1);
}

// Only an already-authorized owner GET records presence; it is never consent.
export function createNormalReviewReaders({now=()=>Math.floor(Date.now()/1000)}={}){
  const seen=new Map();
  return Object.freeze({
    observe(role){check(['PARTICIPANT','OPERATOR'].includes(role),'BC_UI_PARTICIPANT_REQUIRED');seen.set(role,now());},
    ready(){const t=now();return ['PARTICIPANT','OPERATOR'].every(role=>{
      const at=seen.get(role);return Number.isSafeInteger(at)&&at<=t&&t-at<=REVIEW_WINDOW.readersFreshSeconds;
    });},
    require(){check(this.ready(),'BC_NORMAL_REVIEW_SCREENS_REQUIRED');},
  });
}
