import {canonical,exact,hex,requireRule as check} from './contract.mjs';
import {PREVIEW_CONTEXT_VERSION} from './preview-context.mjs';
import {reviewModelProposal} from '../index.mjs';
import {strictJson} from '../../hackerrank-evidence/values.mjs';

const bytes=value=>Buffer.from(canonical(value));
const parse=body=>strictJson(new TextDecoder('utf-8',{fatal:true}).decode(body),16384);
const refInput=input=>({version:PREVIEW_CONTEXT_VERSION,previewContextRef:input.previewContextRef});
// Local candidate only. ACTUAL_GEMINI selects the strict real receipt contract;
// it never enables a remote URL, registers a model grant, or supplies credentials.
export function createRegisteredPreviewService({mode,owner,contexts,prepare,generation,review,delivery,observations,
  clock=()=>Math.floor(Date.now()/1000)}) {
  check(mode==='LOCAL_SYNTHETIC_ONLY','REGISTERED_PREVIEW_MODE');
  for(const t of [prepare,generation,review,delivery])
    check(t?.execution==='LOCAL_SYNTHETIC_HTTPS' && typeof t.query==='function','REGISTERED_PREVIEW_TRANSPORT');
  exact(owner,['modelMode','releaseHash','release','toolBinding','approvalRef']);
  const fixed=structuredClone(owner);
  check(['ACTUAL_GEMINI','OFFLINE_TEST'].includes(fixed.modelMode) && hex(fixed.releaseHash)
    && fixed.releaseHash!=='0'.repeat(64) && /^[a-zA-Z0-9_-]{8,80}$/.test(fixed.approvalRef),'REGISTERED_PREVIEW_OWNER');
  exact(fixed.release,['deploymentEpoch','artifactHash','model','limitsHash']);
  exact(fixed.toolBinding,['tool','planTarget','observationTargetRef']);
  check(canonical(fixed.toolBinding)===canonical({tool:'moodle.activity.public',planTarget:'python-intro',
    observationTargetRef:'core-page-manual-mark'}),'REGISTERED_PREVIEW_TARGET');
  Object.freeze(fixed.toolBinding);Object.freeze(fixed.release);Object.freeze(fixed);
  const actual=fixed.modelMode==='ACTUAL_GEMINI', prefix=actual?'clear-preview':'clear-preview-test';
  const provenance=actual?'ACTUAL_GEMINI_HTTP':'OFFLINE_TEST_TRANSPORT';
  const records=new Map();let closed=false;
  function scope(context,input) {
    const s=contexts.registrationScope(context,refInput(input));
    check(canonical(s.release)===canonical(fixed.release) && s.targetRef===fixed.toolBinding.observationTargetRef,'REGISTERED_RELEASE');
    return s;
  }
  function state(context,input,phase) {
    const s=scope(context,input),r=records.get(input.previewContextRef);
    check(!closed && r && !r.active && r.phase===phase,'REGISTERED_PHASE');
    return {s,r};
  }
  async function operation(r,s,signal,action) {
    const controller=new AbortController();
    const combined=AbortSignal.any([controller.signal,s.signal,...(signal?[signal]:[])]);
    r.active=controller;
    try {combined.throwIfAborted();return await action(combined);}
    catch(error){r.phase='FAILED';throw error;}
    finally{r.active=null;controller.abort();}
  }
  return Object.freeze({
    issue(context,input) {
      check(!closed,'REGISTERED_CLOSED');
      for(const [ref,r] of records)if(r.expiry<=clock())records.delete(ref);
      const issued=contexts.issue(context,input);
      scope(context,{previewContextRef:issued.previewContextRef});
      records.set(issued.previewContextRef,{phase:'ISSUED',expiry:issued.expiresAtExclusive,active:null});
      return issued;
    },
    // Trusted process calls this before D startup. Its releaseHash and approvalRef
    // come solely from owner composition, and scopeHash from the context issuer.
    ownerRegistration(context,input) {
      exact(input,['version','previewContextRef']);check(input.version===PREVIEW_CONTEXT_VERSION,'CONTEXT_VERSION');
      const {s,r}=state(context,input,'ISSUED');r.phase='EXPORTED';
      return {version:'clear-peer-registration.1',releaseHash:fixed.releaseHash,scopeHash:s.scopeHash,
        context:s.context,targetRef:fixed.toolBinding.observationTargetRef,planTarget:fixed.toolBinding.planTarget,
        approvalRef:fixed.approvalRef};
    },
    prepare(context,input,{signal}={}) {
      exact(input,['version','previewContextRef']);check(input.version===PREVIEW_CONTEXT_VERSION,'CONTEXT_VERSION');
      const {s,r}=state(context,input,'EXPORTED');
      return operation(r,s,signal,async cancelled=>{
        const value={version:'clear-preview-peer-context-registration.1',context:s.context,release:s.release,
          toolBinding:fixed.toolBinding,modelCapability:actual?'ACTUAL_GEMINI_HTTP':'OFFLINE_TEST',
          observationCapability:'B_VERIFIED_MOODLE',dataMode:'SYNTHETIC_ONLY'};
        const result=parse(await prepare.query(bytes(value),s.correlation,{signal:cancelled}));
        cancelled.throwIfAborted();scope(context,input);
        exact(result,['version','previewContextRef','expiresAtExclusive','registered','paymentAllowed']);
        check(result.version===prefix+'-context-receipt.1' && result.previewContextRef===input.previewContextRef
          && result.expiresAtExclusive===s.context.expiresAtExclusive && result.registered===true
          && result.paymentAllowed===false,'REGISTERED_CONTEXT_RECEIPT');
        r.phase='PREPARED';return result;
      });
    },
    generate(context,input,{signal}={}) {
      const request=contexts.generationScope(context,input);
      check(input.approvalRef===fixed.approvalRef,'REGISTERED_APPROVAL_REF');
      const {s,r}=state(context,input,'PREPARED');
      return operation(r,s,signal,async cancelled=>{
        const result=parse(await generation.query(bytes({sourceText:input.sourceText,approvalRef:fixed.approvalRef}),request.correlation,{signal:cancelled}));
        cancelled.throwIfAborted();scope(context,input);
        exact(result,['version','input','proposal','modelProvenance','actualModelCall']);
        check(result.version===prefix+'-peer-draft.1' && result.modelProvenance===provenance
          && result.actualModelCall===actual,'REGISTERED_DRAFT_PROVENANCE');
        exact(result.proposal,['sourceText','rows']);
        const draft=reviewModelProposal(result.proposal.sourceText,result.proposal.rows);
        check(result.input.previewContextRef===input.previewContextRef && draft.conditions.length===1
          && draft.conditions[0].capability==='MOODLE_ACTIVITY_COMPLETION.1'
          && draft.conditions[0].target===fixed.toolBinding.planTarget,'REGISTERED_DRAFT_TARGET');
        contexts.acceptVerifiedDraft(context,result.input,result.proposal);
        r.phase='DRAFT';return {...result,toolBinding:fixed.toolBinding,paymentAllowed:false};
      });
    },
    review(context,input,{signal}={}) {
      const request=contexts.draftScope(context,input),{s,r}=state(context,input,'DRAFT');
      return operation(r,s,signal,async cancelled=>{
        const result=parse(await review.query(bytes({draftId:input.draftId,proposalHash:input.proposalHash}),request.correlation,{signal:cancelled}));
        cancelled.throwIfAborted();scope(context,input);
        exact(result,['version','draftId','proposalHash','reviewed','paymentAllowed']);
        check(result.version===prefix+'-review-receipt.1' && result.draftId===input.draftId
          && result.proposalHash===input.proposalHash && result.reviewed===true && result.paymentAllowed===false,'REGISTERED_REVIEW_RECEIPT');
        contexts.review(context,input);r.phase='REVIEWED';return result;
      });
    },
    observe(context,input,{signal}={}) {
      const request=contexts.reviewedScope(context,input),{s,r}=state(context,input,'REVIEWED');
      return operation(r,s,signal,async cancelled=>{
        const observation=await observations.read(request.correlation,()=>contexts.observe(context,input,{signal:cancelled}));
        cancelled.throwIfAborted();
        check(observation.targetRef===fixed.toolBinding.observationTargetRef,'REGISTERED_OBSERVATION_TARGET');
        const result=parse(await contexts.deliverObservation(context,{previewContextRef:input.previewContextRef,
          draftId:input.draftId,proposalHash:input.proposalHash},observation,delivery,{signal:cancelled}));
        cancelled.throwIfAborted();scope(context,input);
        exact(result,['version','observation','modelProvenance','observationProvenance','dataMode','automaticEligibility','paymentAllowed']);
        check(result.version===prefix+'-observation-receipt.1' && result.modelProvenance===provenance
          && result.observationProvenance==='B_VERIFIED_MOODLE' && result.dataMode==='SYNTHETIC_ONLY'
          && result.automaticEligibility===false && result.paymentAllowed===false
          && canonical(result.observation)===canonical(observation),'REGISTERED_OBSERVATION_RECEIPT');
        r.phase='DELIVERED';return result;
      });
    },
    close(){closed=true;for(const r of records.values())r.active?.abort();records.clear();contexts.close();}
  });
}
