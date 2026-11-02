// Owner callbacks only. No network/model port, synthetic mode or retry is installed here.
import {observeSource} from '../../src/hackerrank-evidence/diagnostics.mjs';
import {requireRule as check} from '../../src/policy/values.mjs';
import {readNormalView} from './normal-current-view.mjs';
import {requireNormalModelWindow,REVIEW_WINDOW} from './normal-review-window.mjs';

export function createNormalSourceSequence({store,getContext,applicationId,sourceWindows,startedAt,now,
  signal,key,stage,diagnostics,waitForReaders,requireReaders,onPrepared,nowMs=()=>now()*1000,
  getReflectionRecovery=()=>({status:'UNOBSERVED',resumeAllowed:false}),sourceValiditySeconds=900}){
  check(Number.isSafeInteger(sourceValiditySeconds)&&sourceValiditySeconds>0&&sourceValiditySeconds<=900,'BC_NORMAL_SOURCE_WINDOW');
  let state='NEW',pending=null,failedCriterion=null,skipAccepted=false;
  const requireHr=()=>{const v=readNormalView(()=>store.getApplication(getContext(),applicationId));
    check(v.evidence.some(e=>e.current&&e.record.criterionId==='python-basic-certificate'&&e.record.condition==='MET'),'BC_NORMAL_NOT_MET');};
  const accepted=()=>{
    if(!pending||typeof store.getRequest!=='function')return false;
    const q=store.getRequest(getContext(),applicationId,pending.request.record.target.requestId,{bridge:true});
    const v=readNormalView(()=>store.getApplication(getContext(),applicationId));
    return q.status==='CONSUMED'&&v.evidence.some(e=>e.current&&e.record.criterionId==='reflection-topics'
      &&e.record.requestHash===q.record.requestHash&&e.record.condition==='MET');
  };
  const recovery=()=>{
    if(state!=='FAILED'||failedCriterion!=='reflection-topics'||!pending)return {status:'STAGE_NOT_RESUMABLE',resumeAllowed:false};
    try{requireHr();const v=readNormalView(()=>store.getApplication(getContext(),applicationId));
      if(accepted()){requireNormalModelWindow({...pending.preparation,isCurrent:()=>true},nowMs());return {status:'ALREADY_ACCEPTED',resumeAllowed:true};}
      if(v.revision!==pending.request.record.applicationRevision)return {status:'SOURCE_REVISION_CHANGED',resumeAllowed:false};
      const r=getReflectionRecovery(pending.request.record.target.requestId);
      requireNormalModelWindow({...pending.preparation,isCurrent:()=>r.status==='RESULT_READY'||pending.preparation.isCurrent()},nowMs());return r;
    }catch{return {status:'EVIDENCE_OR_APPROVAL_RENEWAL_REQUIRED',resumeAllowed:false};}
  };
  return Object.freeze({
    recovery,requestResume(){const r=recovery();check(r.resumeAllowed,'BC_NORMAL_RESUME_BLOCKED');skipAccepted=r.status==='ALREADY_ACCEPTED';state='RETRY_READY';},
    dispose(){pending?.preparation?.dispose();pending=null;state='FAILED';},
    get preparation(){return state==='WAITING'?pending?.preparation??null:null;},
    async collect({prepareReflection=false}={}){
      check(!signal?.aborted&&(state==='NEW'||['WAITING','RETRY_READY'].includes(state)&&!prepareReflection),'BC_LIVE_SINGLE_COLLECTION');
      const resuming=['WAITING','RETRY_READY'].includes(state);state='RUNNING';
      try{
        if(resuming){requireReaders();requireHr();requireNormalModelWindow({...pending.preparation,isCurrent:()=>skipAccepted?accepted():pending.preparation.isCurrent()||getReflectionRecovery(pending.request.record.target.requestId).status==='RESULT_READY'},nowMs());}
        else await waitForReaders();
        const order=resuming?[...(skipAccepted?[]:['reflection-topics']),'activity-complete','assignment-submitted']:
          ['python-basic-certificate','reflection-topics','activity-complete','assignment-submitted'];
        for(const criterionId of order){
          check(!signal?.aborted,'BC_CANCELLED');
          if(criterionId==='reflection-topics'&&!resuming){await waitForReaders();requireHr();}
          const context=getContext();failedCriterion=criterionId;stage('SOURCE_'+criterionId);let request;
          if(criterionId==='python-basic-certificate')observeSource(diagnostics,'HR_COLLECTION','STARTED');
          if(resuming&&criterionId==='reflection-topics')request=pending.request;
          else{
            sourceWindows.set(criterionId,now()+(criterionId==='python-basic-certificate'?Math.max(900,sourceValiditySeconds):sourceValiditySeconds));
            request=store.issueBridgeRequest(context,applicationId,{criterionId,
              expectedRevision:readNormalView(()=>store.getApplication(context,applicationId)).revision},key());
          }
          const body={requestId:request.record.target.requestId,expectedRevision:request.record.applicationRevision};
          if(prepareReflection&&criterionId==='reflection-topics'){
            const original=await store.prepareBridgeReflection(context,applicationId,body,{signal,timeoutMs:30000});
            const preparation=Object.freeze({...original,approvalWindowEndsAtMs:Math.min(nowMs()+300000,original.packet.leaseExpiresAtMs-REVIEW_WINDOW.beforeModelSeconds*1000)});
            pending={request,preparation,collectionKey:key()};state='WAITING';onPrepared?.(preparation);
            stage('AWAITING_EXACT_REFLECTION_APPROVAL');return preparation;
          }
          await store.collectBridge(context,applicationId,body,criterionId==='reflection-topics'?(pending?.collectionKey??key()):key(),{signal,
            timeoutMs:criterionId==='python-basic-certificate'?300000:30000});
          if(criterionId==='python-basic-certificate')observeSource(diagnostics,'HR_COLLECTION','COMPLETED');
        }
        state='DONE';return readNormalView(()=>store.getApplication(getContext(),applicationId));
      }catch(error){state='FAILED';throw error;}
    },
  });
}
