// Executable SYNTHETIC-only reference boundary. Never verifies Reclaim or authorizes a product action.
import {createHash} from 'node:crypto';
import {lifecycleSchemas,validateLifecycleShape} from './lifecycle-schema.mjs';
const canonical = value => JSON.stringify(value,(_,v)=>v && !Array.isArray(v) && typeof v==='object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
export const lifecycleDigest = value => '0x'+createHash('sha256').update('CLEAR-SYNTHETIC-LIFECYCLE-1\n'+canonical(value)).digest('hex');
const same = (a,b) => canonical(a)===canonical(b);
const requireValue = (ok,code) => {if(!ok) throw new Error(code);};
const examIdentity = row => lifecycleDigest({examRef:row.examRef,examAt:row.examAt});
const shape = (name,value) => validateLifecycleShape(value,lifecycleSchemas[name]);
const marker = {version:'clear-exam-lifecycle.1',mode:'SYNTHETIC',paymentAllowed:false};
const fields = ['purpose','binding','policyDigest','registeredAt','sessionId','nonce','revision','period'];
const project = value => Object.fromEntries(fields.map(k=>[k,structuredClone(value[k])]));
const nowValue = clock => {const now=clock();requireValue(Number.isSafeInteger(now)&&now>=0&&now<=4102444800,'CLOCK');return now;};

// clock, policy and binding are supplied by the test harness, never by a browser request.
// The private registry models pinned receipt hashes. There is NO persistent store or trust registry.
export function createSyntheticExamLifecycle({policy:inputPolicy,binding:inputBinding,clock}) {
  shape('LifecyclePolicy',inputPolicy);shape('LifecycleBinding',inputBinding);
  const policy=structuredClone(inputPolicy),binding=structuredClone(inputBinding);
  requireValue(binding.policyVersion===policy.policyVersion,'POLICY_VERSION');
  requireValue(policy.achievementFromOffsetSeconds<policy.achievementUntilOffsetSeconds &&
    policy.achievementUntilOffsetSeconds<=policy.achievementSubmitUntilOffsetSeconds,'POLICY_WINDOW');
  const registeredAt=nowValue(clock),policyDigest=lifecycleDigest(policy);
  requireValue(registeredAt>=policy.baselineLookbackSeconds && registeredAt+policy.achievementSubmitUntilOffsetSeconds<=4102444800,'REGISTRATION_WINDOW');
  const registration={...marker,binding,policyDigest,registeredAt,event:policy.registrationEvent};
  const sessions=new Map(),nonceSet=new Set(),latest=new Map(),accepted=new Map(),pins=new Map(),sourceUse=new Map();
  let lastNow=registeredAt, firstAchievementKey=null;
  const now = () => {const value=nowValue(clock);requireValue(value>=lastNow,'CLOCK_ROLLBACK');lastNow=value;return value;};
  const windowFor = purpose => ({from:purpose==='BASELINE_HISTORY'?registeredAt-policy.baselineLookbackSeconds:registeredAt+policy.achievementFromOffsetSeconds,
    until:purpose==='BASELINE_HISTORY'?registeredAt:registeredAt+policy.achievementUntilOffsetSeconds,boundaries:'[from,until)'});
  const checkReceipt = (receipt,purpose) => {
    shape('LifecycleReceipt',receipt);
    requireValue(receipt.purpose===purpose,'PURPOSE_MISMATCH');
    requireValue(same(receipt.binding,binding)&&receipt.policyDigest===policyDigest&&receipt.registeredAt===registeredAt,'BINDING_MISMATCH');
    const current=accepted.get(purpose);
    requireValue(current && receipt.sessionId===current.sessionId && receipt.revision===current.revision,'RECEIPT_SUPERSEDED');
    requireValue(pins.get(receipt.sessionId)===lifecycleDigest(receipt),'RECEIPT_INTEGRITY');
    // Freshness was enforced once at acceptance. Advancing the evaluation clock cannot erase that fact.
    return receipt.status;
  };
  return {
    registration:()=>structuredClone(registration),
    openSession(purpose,{sessionId,nonce}) {
      requireValue(['BASELINE_HISTORY','ACHIEVEMENT'].includes(purpose),'PURPOSE');
      requireValue(purpose!=='BASELINE_HISTORY'||policy.baselineRequired,'BASELINE_NOT_REQUIRED');
      const createdAt=now();
      const acceptUntil=registeredAt+(purpose==='BASELINE_HISTORY'?policy.baselineCollectionLagSeconds:policy.achievementSubmitUntilOffsetSeconds);
      requireValue(createdAt<=acceptUntil,'COLLECTION_WINDOW_CLOSED');
      requireValue(!sessions.has(sessionId)&&!nonceSet.has(nonce),'SESSION_REUSE');
      const revision=(latest.get(purpose)?.revision??0)+1;
      const session={...marker,purpose,binding:structuredClone(binding),policyDigest,registeredAt,sessionId,nonce,revision,
        period:windowFor(purpose),createdAt,acceptUntil};
      shape('LifecycleSession',session);
      sessions.set(sessionId,session);nonceSet.add(nonce);latest.set(purpose,session);
      // A replacement suspends the previous result; a late old job cannot restore it.
      accepted.delete(purpose);
      return structuredClone(session);
    },
    accept(submission) {
      shape('LifecycleSubmission',submission);
      const session=sessions.get(submission.sessionId);
      requireValue(session,'SESSION_UNKNOWN');
      requireValue(latest.get(session.purpose)===session,'SESSION_SUPERSEDED');
      requireValue(!pins.has(session.sessionId),'SESSION_CONSUMED');
      requireValue(submission.purpose===session.purpose,'PURPOSE_MISMATCH');
      requireValue(same(submission.binding,binding)&&submission.policyDigest===policyDigest&&submission.registeredAt===registeredAt,'BINDING_MISMATCH');
      requireValue(submission.nonce===session.nonce&&submission.revision===session.revision,'SESSION_BINDING');
      requireValue(same(submission.period,session.period),'PERIOD_MISMATCH');
      const acceptedAt=now();
      requireValue(acceptedAt<=session.acceptUntil && submission.collectedAt>=session.createdAt &&
        submission.collectedAt<=acceptedAt && acceptedAt-submission.collectedAt<=policy.acceptanceMaxAgeSeconds,'ACQUISITION_TIME');
      requireValue(!sourceUse.has(submission.sourceDigest),'SOURCE_REUSE');
      const rows=submission.rows;
      if(session.purpose==='ACHIEVEMENT') {
        requireValue(rows.length<=1,'ACHIEVEMENT_SINGLE_EXAM');
        requireValue(!firstAchievementKey || rows.length===0 || examIdentity(rows[0])===firstAchievementKey,'FIRST_ACHIEVEMENT_MISMATCH');
      }
      requireValue(new Set(rows.map(r=>r.examRef)).size===rows.length,'DUPLICATE_EXAM');
      for(const row of rows) {
        requireValue(row.examAt<=submission.collectedAt,'EXAM_TIME');
        requireValue(row.examAt>=session.period.from&&row.examAt<session.period.until,'EXAM_PERIOD');
        requireValue(row.availableAt===null || (row.availableAt>=row.examAt&&row.availableAt<=submission.collectedAt),'PUBLICATION_TIME');
      }
      let status='UNKNOWN',reason='NONE';
      if(!submission.signatureVerifiedSynthetic) reason='SOURCE_UNVERIFIED';
      else if(!submission.accountBoundSynthetic) reason='ACCOUNT_UNVERIFIED';
      else if(session.purpose==='BASELINE_HISTORY' && submission.coverage!=='COMPLETE_SYNTHETIC') reason='COVERAGE_UNKNOWN';
      else if(rows.length===0 && (session.purpose==='ACHIEVEMENT'||submission.emptyMeaning!=='NO_RECORD_SYNTHETIC')) reason='EMPTY_UNCONFIRMED';
      else if(rows.some(r=>r.availableAt===null)) reason='PUBLICATION_UNKNOWN';
      else if(session.purpose==='BASELINE_HISTORY' && rows.some(r=>r.availableAt>registeredAt)) reason='PUBLICATION_AFTER_REGISTRATION';
      else if(rows.some(r=>r.score===null)) reason='SCORE_UNKNOWN';
      else {
        const met=session.purpose==='BASELINE_HISTORY'?rows.every(r=>r.score<policy.baselineMaxScoreExclusive):rows.some(r=>r.score>=policy.achievementMinScore);
        status=met?'MET_SYNTHETIC':'NOT_MET';reason=met?'NONE':'THRESHOLD_NOT_MET';
      }
      const receipt={...marker,...project(session),sourceTrustProfile:policy.sourceTrustProfile,verifierVersion:'synthetic-lifecycle.1',
        sourceDigest:submission.sourceDigest,submissionDigest:lifecycleDigest(submission),collectedAt:submission.collectedAt,
        acceptedAt,freshAtAcceptance:true,status,reason,proofVerified:false,accountIdentityBound:false,fullHistoryProven:false};
      shape('LifecycleReceipt',receipt);
      if(session.purpose==='ACHIEVEMENT' && rows.length===1 && !firstAchievementKey) firstAchievementKey=examIdentity(rows[0]);
      pins.set(session.sessionId,lifecycleDigest(receipt));sourceUse.set(submission.sourceDigest,session.purpose);accepted.set(session.purpose,receipt);
      return structuredClone(receipt);
    },
    evaluate({baseline=null,achievement=null}={}) {
      const evaluatedAt=now();
      requireValue(policy.baselineRequired||!baseline,'BASELINE_NOT_REQUIRED');
      const baselineStatus=baseline?checkReceipt(baseline,'BASELINE_HISTORY'):policy.baselineRequired?'UNKNOWN':'NOT_REQUIRED';
      const achievementStatus=achievement?checkReceipt(achievement,'ACHIEVEMENT'):'UNKNOWN';
      const statuses=[baselineStatus,achievementStatus];
      const status=statuses.includes('NOT_MET')?'NOT_MET':statuses.includes('UNKNOWN')?'UNKNOWN':'MET_SYNTHETIC';
      const result={...marker,status,baselineStatus,achievementStatus,evaluatedAt,productEligible:false,
        reason:policy.baselineRequired&&!baseline?'BASELINE_MISSING':!achievement?'ACHIEVEMENT_MISSING':'NONE',
        binding:structuredClone(binding),policyDigest,baselineReceiptHash:baseline?lifecycleDigest(baseline):null,
        achievementReceiptHash:achievement?lifecycleDigest(achievement):null};
      shape('LifecycleEvaluation',result);return result;
    }
  };
}
