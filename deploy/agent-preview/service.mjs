import {randomUUID} from 'node:crypto';
import {hash, reviewModelProposal, buildPlan, validatePlan} from '../../src/agent-preview/index.mjs';
import {prepareGeminiStructureRequest} from '../../src/agent-preview/gemini-preparation.mjs';
import {requestGeminiPreview} from '../../src/agent-preview/gemini-response.mjs';
import {developerTransport} from '../../src/ai-policy/gemini-evaluation.mjs';
import {bindingHash, check, exact} from './config.mjs';
import {awaitAbortable} from './lifecycle.mjs';
import {limits,previewModel} from './limits.mjs';
export {limits} from './limits.mjs';

const actorKeys=['institutionId','courseId','operatorId','sourceText'];
const gates={scope:'PRECONFIGURATION_ONLY', automaticEligibility:false, paymentAllowed:false,
  actualReclaimCall:false, actualPayout:false, dataMode:'DEMO_ACCOUNTS_ONLY'};
export function createService({config,store,observationAdapter=null,modelTransport=developerTransport(),clock=Date.now,
  setTimer=setTimeout,clearTimer=clearTimeout,setOperationTimer=setTimeout,clearOperationTimer=clearTimeout}) {
  const binding=bindingHash(config), drafts=new Map(),timers=new Map();
  let active=null,closed=false;
  function begin(requestSignal,draftId=null) {
    check(!closed,'SERVICE_CLOSED');check(!active,'BUSY');
    const controller=new AbortController(),signal=controller.signal;
    let expiry=Infinity,expiryCode='OPERATION_TIMEOUT',expiryTimer;
    const cancel=()=>controller.abort(new Error('REQUEST_ABORTED'));
    requestSignal?.addEventListener('abort',cancel,{once:true});
    if(requestSignal?.aborted)cancel();
    const timeout=setOperationTimer(()=>controller.abort(new Error('OPERATION_TIMEOUT')),45000);timeout.unref?.();
    const op={controller,draftId,signal,
      guard(){check(!closed,'SERVICE_CLOSED');signal.throwIfAborted();check(expiry>clock(),expiryCode);},
      expires(at,code){expiry=at;expiryCode=code;
        expiryTimer=setOperationTimer(()=>controller.abort(new Error(code)),Math.max(0,at-clock()));expiryTimer.unref?.();},
      async dispatch(fn){op.guard();const result=await awaitAbortable(fn(signal),signal);op.guard();return result;},
      end(){clearOperationTimer(timeout);if(expiryTimer!==undefined)clearOperationTimer(expiryTimer);
        requestSignal?.removeEventListener('abort',cancel);if(active===op)active=null;}
    };
    active=op;return op;
  }
  function actor(body,extra=[]) {
    check(!closed,'SERVICE_CLOSED');
    exact(body,[...actorKeys,...extra]);
    for(const k of ['institutionId','courseId','operatorId']) check(body[k]===config[k],'ACTOR_SCOPE');
    const prepared=prepareGeminiStructureRequest(body.sourceText);
    check(prepared.model===previewModel && prepared.body.generationConfig.maxOutputTokens===limits.maxOutputTokens,'MODEL_PROFILE_CHANGED');
    return prepared;
  }
  function remove(id) {
    if(active?.draftId===id)active.controller.abort(new Error('DRAFT_STALE_OR_UNREVIEWED'));
    const saved=drafts.get(id);if(saved){saved.sourceText=null;saved.rows=null;}
    drafts.delete(id);if(timers.has(id)){clearTimer(timers.get(id));timers.delete(id);}
  }
  function prune() {for(const [id,d] of drafts) if(d.expires<=clock()) remove(id);}
  return {
    prepare(body) {const p=actor(body);return {...gates,version:'clear-external-preview-preparation.1',
      sourceText:body.sourceText,bodyHash:p.bodyHash,sourceHash:p.sourceHash,model:p.model,bindingHash:binding,limits,actualModelCall:false};},
    async generate(body,{signal:requestSignal}={}) {
      const p=actor(body,['approvalRef']);
      check(typeof body.approvalRef==='string' && /^[a-zA-Z0-9_-]{8,80}$/.test(body.approvalRef),'APPROVAL_INVALID');
      check(!active,'BUSY');prune();check(drafts.size<16,'DRAFT_LIMIT');
      const op=begin(requestSignal),signal=op.signal;
      try {
        const result=await requestGeminiPreview(body.sourceText,{approvalRef:body.approvalRef,signal,
          claimAndDispatch:async ({approvalRef,model,bodyHash,body:request})=>{
            // Durable single use before countTokens and before any key read. Failure stays spent.
            op.guard();
            const grant=store.consume(approvalRef,bodyHash,binding,clock);
            op.expires(grant.expires,'APPROVAL_EXPIRED');
            const count=await op.dispatch(signal=>modelTransport.request(model,'countTokens',{generateContentRequest:{model:'models/'+model,...request}},signal));
            check(Number.isSafeInteger(count.totalTokens) && count.totalTokens>0 && count.totalTokens<=limits.maxInputTokens,'INPUT_TOKEN_LIMIT');
            // Every dispatch and result stays inside the same single-use approval.
            return op.dispatch(signal=>modelTransport.request(model,'generateContent',request,signal));
          }});
        op.guard();
        // Keep only validated AST clauses, not provider metadata or raw reply. Memory TTL: 15 min.
        const {draft}=result;
        const rows=draft.clauses.map(c=>{
          const question=draft.questions.find(q=>q.clauseId===c.id), condition=draft.conditions.find(v=>v.clauseId===c.id);
          return {quote:c.text,start:c.start,end:c.end,status:question?.reason??'SUPPORTED',
            capability:question?null:condition.capability,question:question?.question??null};
        });
        const draftId=randomUUID(), expiresAt=clock()+900000;
        drafts.set(draftId,{sourceText:body.sourceText,rows,proposalHash:draft.proposalHash,expires:expiresAt});
        // The timer closes over an opaque id only. Drop original text/AST references even while idle.
        const timer=setTimer(()=>remove(draftId),900000);timer.unref?.();timers.set(draftId,timer);
        return {...gates,version:'clear-external-preview-draft.1',draftId,expiresAt,draft,
          model:p.model,bodyHash:p.bodyHash,actualModelCall:modelTransport.execution==='ACTUAL',
          modelProvenance:modelTransport.execution==='ACTUAL'?'ACTUAL_GEMINI_HTTP':'OFFLINE_TEST_TRANSPORT'};
      } finally {op.end();}
    },
    async execute(body,{signal:requestSignal}={}) {
      actor(body,['draftId','proposalHash']);prune();
      const saved=drafts.get(body.draftId);
      check(saved && saved.sourceText===body.sourceText && saved.proposalHash===body.proposalHash,'DRAFT_STALE_OR_UNREVIEWED');
      const draft=reviewModelProposal(saved.sourceText,saved.rows,body.proposalHash),plan=buildPlan(draft),validation=validatePlan(plan,draft);
      check(validation.ok,'PLAN_REJECTED');
      // Existing core manifest is a public-demo plan grammar, not an actual execution claim.
      // This deployment bridge maps exactly one permitted capability to one fixed Moodle read.
      check(plan.steps.length===1 && plan.steps[0].tool==='moodle.activity.public','ACTUAL_TOOL_NOT_ENABLED');
      const op=begin(requestSignal,body.draftId);
      op.expires(saved.expires,'DRAFT_STALE_OR_UNREVIEWED');
      try {
        // The integration owner must supply the approved binding adapter. A caller's
        // course/operator fields and service HMAC never grant access to student records.
        check(observationAdapter && observationAdapter.execution === 'OFFLINE_TEST', 'OBSERVATION_ADAPTER_NOT_ACCEPTED');
        const observed=await op.dispatch(signal=>observationAdapter.observe({sourceHash:draft.sourceHash,planHash:plan.planHash,
          capability:'MOODLE_ACTIVITY_COMPLETION.1'},{signal}));
        check(saved.expires>clock(),'DRAFT_STALE_OR_UNREVIEWED');
        exact(observed,['targetRef','status','observedAt']);
        check(typeof observed.targetRef==='string' && observed.targetRef.length>0 && observed.targetRef.length<=128
          && ['COMPLETE','INCOMPLETE','UNKNOWN','INACCESSIBLE'].includes(observed.status) && Number.isSafeInteger(observed.observedAt)
          && observed.observedAt>0 && observed.observedAt<=Math.floor(clock()/1000)
          && Math.floor(clock()/1000)-observed.observedAt<=30,'OBSERVATION_INVALID');
        const observation={...observed,executionMode:'OFFLINE_TEST_ADAPTER',eligibility:'NOT_EVALUATED',
          completionObserved:observed.status==='COMPLETE'};
        return {...gates,version:'clear-external-preview-observation.1',draftId:body.draftId,
          proposalHash:body.proposalHash,sourceHash:draft.sourceHash,plan,validation,
          planScope:'EXISTING_PUBLIC_PLAN_GRAMMAR_ONLY',executionBridge:'PENDING_B_C_APPROVED_BINDING_ADAPTER',observation};
      } finally {op.end();}
    },
    close(){closed=true;active?.controller.abort(new Error('SERVICE_CLOSED'));for(const id of drafts.keys())remove(id);}
  };
}
