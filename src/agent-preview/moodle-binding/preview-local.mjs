import { AsyncLocalStorage } from 'node:async_hooks';
import { canonical, exact, requireRule as check, validateDto, versions } from './contract.mjs';
import { createSyntheticVerifier } from './synthetic.mjs';
import { reviewModelProposal, TOOL_MANIFEST } from '../index.mjs';
import { strictJson } from '../../hackerrank-evidence/values.mjs';

const bytes = value => Buffer.from(canonical(value));
const parse = body => strictJson(new TextDecoder('utf-8', { fatal:true }).decode(body), 16384);
function local(mode, transport) {
  check(mode === 'LOCAL_SYNTHETIC_ONLY' && transport?.execution === 'LOCAL_SYNTHETIC_HTTPS', 'LOCAL_PREVIEW_CONFIG');
}

// Correlation exists only during the current authenticated read, across its async
// source request. The original coordinator owns full .3/currentness validation.
export function createLocalObservationBridge({ mode, transport, confirmationVerifier }) {
  check(mode === 'LOCAL_SYNTHETIC_ONLY' && ['LOCAL_SYNTHETIC_HTTPS','LOCAL_SYNTHETIC_HTTP'].includes(transport?.execution), 'LOCAL_PREVIEW_CONFIG');
  const reads = new AsyncLocalStorage();
  const verifier = createSyntheticVerifier(async (request, { signal } = {}) => {
    if(request.version !== versions.observationsRequest) {
      check(confirmationVerifier, 'LOCAL_CONFIRMATION_DISABLED');
      return confirmationVerifier.query(request, { signal });
    }
    const scope = reads.getStore();
    check(scope, 'LOCAL_OBSERVATION_SCOPE');
    validateDto('observationsRequest', request);
    const body = await transport.query(bytes(request), scope, { signal });
    return validateDto('observations', parse(body));
  });
  return Object.freeze({
    verifier,
    read(scope, operation) {
      exact(scope, ['contextRef','sourceHash','proposalHash','expiresAtExclusive']);
      return reads.run(Object.freeze({ ...scope }), operation);
    }
  });
}

export function createLocalPreviewService({ mode, contexts, generation, review, delivery, observations, toolBinding,
  clock = () => Math.floor(Date.now() / 1000) }) {
  for(const transport of [generation, review, delivery]) local(mode, transport);
  exact(toolBinding, ['tool','planTarget','observationTargetRef']);
  const mapping = Object.freeze({ ...toolBinding });
  const tool = TOOL_MANIFEST.find(entry => entry.tool === mapping.tool && entry.target === mapping.planTarget);
  check(tool?.capability === 'MOODLE_ACTIVITY_COMPLETION.1' && typeof mapping.observationTargetRef === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(mapping.observationTargetRef), 'LOCAL_TOOL_BINDING');
  const active = new Map(), acceptedReviews = new Map();
  let closed = false;
  async function operation(input, signal, action) {
    check(!closed && !active.has(input.previewContextRef), 'LOCAL_PREVIEW_BUSY');
    for(const [ref, accepted] of acceptedReviews) if(accepted.expiry <= clock()) acceptedReviews.delete(ref);
    const controller = new AbortController();
    const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    active.set(input.previewContextRef, controller);
    try { combined.throwIfAborted(); return await action(combined); }
    finally { active.delete(input.previewContextRef); controller.abort(); }
  }
  return Object.freeze({
    issue(context, input) { check(!closed, 'LOCAL_PREVIEW_CLOSED'); return contexts.issue(context, input); },
    generate(context, input, { signal } = {}) {
      return operation(input, signal, async cancelled => {
        const scope = contexts.generationScope(context, input);
        const combined = AbortSignal.any([cancelled, scope.signal]);
        const result = parse(await generation.query(bytes({sourceText:input.sourceText,approvalRef:input.approvalRef}), scope.correlation, {signal:combined}));
        combined.throwIfAborted();
        exact(result, ['input','proposal']);
        check(result.input.previewContextRef === input.previewContextRef, 'LOCAL_DRAFT_CONTEXT');
        exact(result.proposal, ['sourceText','rows']);
        const draft = reviewModelProposal(result.proposal.sourceText, result.proposal.rows);
        check(draft.conditions.length === 1 && draft.conditions[0].capability === tool.capability
          && draft.conditions[0].target === mapping.planTarget, 'LOCAL_TOOL_BINDING');
        contexts.acceptVerifiedDraft(context, result.input, result.proposal);
        // This is a validated draft for explicit browser review. Source text is
        // transient during this operation and remains absent from context storage.
        return { version:'clear-local-preview-draft.1', ...result, toolBinding:mapping, provenance:'OFFLINE_TEST', paymentAllowed:false };
      });
    },
    review(context, input, { signal } = {}) {
      return operation(input, signal, async cancelled => {
        contexts.review(context, input);
        const scope = contexts.reviewedScope(context, input);
        const combined = AbortSignal.any([cancelled, scope.signal]);
        const result = parse(await review.query(bytes({draftId:input.draftId,proposalHash:input.proposalHash}), scope.correlation, {signal:combined}));
        combined.throwIfAborted();
        exact(result, ['version','draftId','proposalHash','reviewed','paymentAllowed']);
        check(result.version === 'clear-offline-review-receipt.1' && result.draftId === input.draftId
          && result.proposalHash === input.proposalHash && result.reviewed === true && result.paymentAllowed === false, 'LOCAL_REVIEW_RECEIPT');
        contexts.reviewedScope(context, input);
        acceptedReviews.set(input.previewContextRef, {draftId:input.draftId,proposalHash:input.proposalHash,expiry:scope.correlation.expiresAtExclusive});
        return result;
      });
    },
    observe(context, input, { signal } = {}) {
      return operation(input, signal, async cancelled => {
        const scope = contexts.reviewedScope(context, input), accepted = acceptedReviews.get(input.previewContextRef);
        check(accepted && accepted.draftId === input.draftId && accepted.proposalHash === input.proposalHash, 'LOCAL_REVIEW_REQUIRED');
        const combined = AbortSignal.any([cancelled, scope.signal]);
        const observation = await observations.read(scope.correlation, () => contexts.observe(context, input, {signal:combined}));
        combined.throwIfAborted();
        check(observation.targetRef === mapping.observationTargetRef, 'LOCAL_TOOL_BINDING');
        const result = parse(await contexts.deliverObservation(context, {
          previewContextRef:input.previewContextRef, draftId:input.draftId, proposalHash:input.proposalHash
        }, observation, delivery, {signal:combined}));
        combined.throwIfAborted();
        exact(result, ['version','observation','provenance','automaticEligibility','paymentAllowed']);
        check(result.version === 'clear-offline-observation-receipt.1' && result.provenance === 'OFFLINE_TEST'
          && result.automaticEligibility === false && result.paymentAllowed === false
          && canonical(result.observation) === canonical(observation), 'LOCAL_OBSERVATION_RECEIPT');
        contexts.reviewedScope(context, input);
        return result;
      });
    },
    close() {
      closed = true;
      for(const controller of active.values()) controller.abort(Error('LOCAL_PREVIEW_CLOSED'));
      acceptedReviews.clear();
      contexts.close();
    }
  });
}
