import {randomUUID} from 'node:crypto';
import {hash, reviewModelProposal, buildPlan, validatePlan} from '../../src/agent-preview/index.mjs';
import {prepareGeminiStructureRequest} from '../../src/agent-preview/gemini-preparation.mjs';
import {requestGeminiPreview} from '../../src/agent-preview/gemini-response.mjs';
import {developerTransport} from '../../src/ai-policy/gemini-evaluation.mjs';
import {bindingHash, check, exact} from './config.mjs';

const actorKeys=['institutionId','courseId','operatorId','sourceText'];
const gates={scope:'PRECONFIGURATION_ONLY', automaticEligibility:false, paymentAllowed:false,
  actualReclaimCall:false, actualPayout:false, dataMode:'DEMO_ACCOUNTS_ONLY'};
export const limits=Object.freeze({countTokens:1,generateContent:1,automaticRetries:0,maxInputTokens:4096,maxOutputTokens:2048,
  maximumGenerationCostUsd:'0.0063488',priceCheckedOn:'2026-11-04',priceSource:'https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite'});

export function createService({config,store,observationAdapter=null,modelTransport=developerTransport(),clock=Date.now}) {
  const binding=bindingHash(config), drafts=new Map();
  let active=false;
  function actor(body,extra=[]) {
    exact(body,[...actorKeys,...extra]);
    for(const k of ['institutionId','courseId','operatorId']) check(body[k]===config[k],'ACTOR_SCOPE');
    return prepareGeminiStructureRequest(body.sourceText);
  }
  function prune() {for(const [id,d] of drafts) if(d.expires<=clock()) drafts.delete(id);}
  return {
    prepare(body) {const p=actor(body);return {...gates,version:'clear-external-preview-preparation.1',
      sourceText:body.sourceText,bodyHash:p.bodyHash,sourceHash:p.sourceHash,model:p.model,bindingHash:binding,limits,actualModelCall:false};},
    async generate(body) {
      const p=actor(body,['approvalRef']);
      check(typeof body.approvalRef==='string' && /^[a-zA-Z0-9_-]{8,80}$/.test(body.approvalRef),'APPROVAL_INVALID');
      check(!active,'BUSY');prune();check(drafts.size<16,'DRAFT_LIMIT');
      active=true;
      const signal=AbortSignal.timeout(45000);
      try {
        const result=await requestGeminiPreview(body.sourceText,{approvalRef:body.approvalRef,signal,
          claimAndDispatch:async ({approvalRef,model,bodyHash,body:request})=>{
            // Durable single use before countTokens and before any key read. Failure stays spent.
            const grant=store.consume(approvalRef,bodyHash,binding,clock);
            check(grant.expires>clock(),'APPROVAL_EXPIRED');
            const count=await modelTransport.request(model,'countTokens',{generateContentRequest:{model:'models/'+model,...request}},signal);
            check(Number.isSafeInteger(count.totalTokens) && count.totalTokens>0 && count.totalTokens<=limits.maxInputTokens,'INPUT_TOKEN_LIMIT');
            signal.throwIfAborted();
            // Both outbound calls must begin within the same single-use approval.
            check(grant.expires>clock(),'APPROVAL_EXPIRED');
            return modelTransport.request(model,'generateContent',request,signal);
          }});
        signal.throwIfAborted();
        // Keep only validated AST clauses, not provider metadata or raw reply. Memory TTL: 15 min.
        const {draft}=result;
        const rows=draft.clauses.map(c=>{
          const question=draft.questions.find(q=>q.clauseId===c.id), condition=draft.conditions.find(v=>v.clauseId===c.id);
          return {quote:c.text,start:c.start,end:c.end,status:question?.reason??'SUPPORTED',
            capability:question?null:condition.capability,question:question?.question??null};
        });
        const draftId=randomUUID(), expiresAt=clock()+900000;
        drafts.set(draftId,{sourceText:body.sourceText,rows,proposalHash:draft.proposalHash,expires:expiresAt});
        return {...gates,version:'clear-external-preview-draft.1',draftId,expiresAt,draft,
          model:p.model,bodyHash:p.bodyHash,actualModelCall:modelTransport.execution==='ACTUAL',
          modelProvenance:modelTransport.execution==='ACTUAL'?'ACTUAL_GEMINI_HTTP':'OFFLINE_TEST_TRANSPORT'};
      } finally {active=false;}
    },
    async execute(body) {
      actor(body,['draftId','proposalHash']);prune();
      const saved=drafts.get(body.draftId);
      check(saved && saved.sourceText===body.sourceText && saved.proposalHash===body.proposalHash,'DRAFT_STALE_OR_UNREVIEWED');
      const draft=reviewModelProposal(saved.sourceText,saved.rows,body.proposalHash),plan=buildPlan(draft),validation=validatePlan(plan,draft);
      check(validation.ok,'PLAN_REJECTED');
      // Existing core manifest is a public-demo plan grammar, not an actual execution claim.
      // This deployment bridge maps exactly one permitted capability to one fixed Moodle read.
      check(plan.steps.length===1 && plan.steps[0].tool==='moodle.activity.public','ACTUAL_TOOL_NOT_ENABLED');
      check(!active,'BUSY');active=true;
      try {
        // The integration owner must supply the approved binding adapter. A caller's
        // course/operator fields and service HMAC never grant access to student records.
        check(observationAdapter && observationAdapter.execution === 'OFFLINE_TEST', 'OBSERVATION_ADAPTER_NOT_ACCEPTED');
        const observed=await observationAdapter.observe({sourceHash:draft.sourceHash,planHash:plan.planHash,
          capability:'MOODLE_ACTIVITY_COMPLETION.1'});
        check(saved.expires>clock(),'DRAFT_STALE_OR_UNREVIEWED');
        exact(observed,['targetRef','status','observedAt']);
        check(typeof observed.targetRef==='string' && observed.targetRef.length>0 && observed.targetRef.length<=128
          && ['OBSERVED','UNKNOWN'].includes(observed.status) && Number.isSafeInteger(observed.observedAt)
          && observed.observedAt<=clock() && clock()-observed.observedAt<=30000,'OBSERVATION_INVALID');
        const observation={...observed,executionMode:'OFFLINE_TEST_ADAPTER',eligibility:'NOT_EVALUATED'};
        return {...gates,version:'clear-external-preview-observation.1',draftId:body.draftId,
          proposalHash:body.proposalHash,sourceHash:draft.sourceHash,plan,validation,
          planScope:'EXISTING_PUBLIC_PLAN_GRAMMAR_ONLY',executionBridge:'PENDING_B_C_APPROVED_BINDING_ADAPTER',observation};
      } finally {active=false;}
    },
    close(){drafts.clear();}
  };
}
