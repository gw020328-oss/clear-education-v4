import { randomBytes } from 'node:crypto';
import { canonical, exact, hash, digest, hex, opaque, integer, requireRule as check } from './contract.mjs';
import { validateTimePolicy } from './currentness.mjs';
import { reviewModelProposal } from '../index.mjs';

export const PREVIEW_CONTEXT_VERSION = 'clear-self-preview-context.1';
// Owner-only composition. No raw session token, wallet, source text, or provider reply
// is retained. Every operation requires the live student authentication context.
export function createPreviewContexts({ authentication, student, coordinator, applicationId, targetRef, issuerEpoch,
  deployment, prepareModel, timePolicy, clock = () => Math.floor(Date.now() / 1000), monotonic = () => performance.now(),
  ttlSeconds = 60, maximumContexts = 16 }) {
  check(opaque(applicationId) && opaque(targetRef) && opaque(issuerEpoch) && typeof deployment === 'function'
    && typeof prepareModel === 'function' && integer(ttlSeconds) && ttlSeconds > 0 && ttlSeconds <= 120
    && integer(maximumContexts) && maximumContexts > 0 && maximumContexts <= 64, 'CONTEXT_CONFIG');
  const policy = validateTimePolicy(timePolicy), records = new Map(), observations = new WeakMap(); let closed = false, floor = 0;
  function time() {
    const now = clock(), mono = monotonic();
    check(!closed && integer(now) && now > 0 && now >= floor && Number.isFinite(mono) && mono >= 0, 'CONTEXT_CLOCK');
    floor = now; return { now, mono };
  }
  function current(context) {
    const began = time(), actor = authentication.authorizeWorkflow(context, true);
    check(actor.role === 'participant', 'CONTEXT_SELF_ONLY');
    const auth = authentication.moodleBindingManifest(), app = student.get(context, applicationId);
    check(app.state === 'ACKNOWLEDGED_SYNTHETIC' && app.policyCurrent && app.acknowledgment?.current, 'CONTEXT_ACK');
    const binding = coordinator.bindingStatus(context, applicationId), release = structuredClone(deployment());
    // Owner reads can wait for SQLite locks. Never use a pre-lock clock for TTL.
    const at = time(); check(at.mono >= began.mono && at.now < binding.expiresAtExclusive, 'CONTEXT_EXPIRED');
    exact(release, ['deploymentEpoch','artifactHash','model','limitsHash','validUntil']);
    check(opaque(release.deploymentEpoch) && hex(release.artifactHash) && hex(release.limitsHash)
      && typeof release.model === 'string' && /^[a-z0-9][a-z0-9.-]{0,127}$/.test(release.model)
      && integer(release.validUntil) && release.validUntil > at.now, 'CONTEXT_DEPLOYMENT');
    // Every revision is obtained from an owner service or the coordinator, not an HTTP/model field.
    return { at, expiry: Math.min(binding.expiresAtExclusive, release.validUntil), scope: {
      applicationId, authConfigHash: auth.configHash, authorityRevision: auth.revision,
      applicationRevision: app.workflowRevision, policyHash: app.policyHash, policyRevision: app.policyRevision,
      bindingRef: binding.bindingRef, bindingRevision: binding.bindingRevision, targetRef, issuerEpoch, ...release,
      sessionDigest: digest(context.token)
    } };
  }
  function forget(ref, reason = 'CONTEXT_EXPIRED') {
    const r = records.get(ref);
    records.delete(ref);
    if(r) {
      clearTimeout(r.timer);
      r.lifetime.abort(Error(reason));
    }
  }
  function record(context, ref) {
    check(opaque(ref), 'CONTEXT_REF'); const live = current(context), r = records.get(ref);
    if(r && (live.at.now >= r.expiresAtExclusive || live.at.mono >= r.expiresMono)) forget(ref);
    check(r && !r.lifetime.signal.aborted && live.at.mono >= r.beganMono, 'CONTEXT_EXPIRED');
    check(hash(live.scope) === r.scopeHash && live.expiry >= r.expiresAtExclusive, 'CONTEXT_CHANGED');
    return { r, live };
  }
  function matching(r, input) {
    check(r.draft && input.draftId === r.draft.draftId && input.proposalHash === r.draft.proposalHash, 'CONTEXT_DRAFT');
  }
  return Object.freeze({
    issue(context, input) {
      exact(input, ['version','sourceText']); check(input.version === PREVIEW_CONTEXT_VERSION, 'CONTEXT_VERSION');
      const before = current(context), prepared = prepareModel(input.sourceText), live = current(context);
      check(hash(before.scope) === hash(live.scope), 'CONTEXT_CHANGED');
      check(hex(prepared.sourceHash) && hex(prepared.bodyHash) && prepared.model === live.scope.model
        && prepared.actualModelCall === false, 'CONTEXT_MODEL');
      for(const [ref,r] of records) if(r.expiresAtExclusive <= live.at.now || r.expiresMono <= live.at.mono) forget(ref);
      check(records.size < maximumContexts, 'CONTEXT_LIMIT');
      const ref = randomBytes(32).toString('hex'), expiresAtExclusive = Math.min(live.expiry, live.at.now + ttlSeconds);
      const scopeHash = hash(live.scope), approvalBindingHash = hash({ domain:'CLEAR_SELF_PREVIEW_APPROVAL_1',
        contextRef:ref, scopeHash, sourceHash:prepared.sourceHash, bodyHash:prepared.bodyHash,
        model:live.scope.model, limitsHash:live.scope.limitsHash, artifactHash:live.scope.artifactHash,
        deploymentEpoch:live.scope.deploymentEpoch, expiresAtExclusive });
      const timer = setTimeout(() => forget(ref), (expiresAtExclusive - live.at.now) * 1000); timer.unref();
      records.set(ref, { scopeHash, bindingRef:live.scope.bindingRef, sourceHash:prepared.sourceHash, bodyHash:prepared.bodyHash,
        approvalBindingHash, model:prepared.model, expiresAtExclusive, beganMono:live.at.mono,
        expiresMono:live.at.mono + (expiresAtExclusive - live.at.now)*1000, timer, lifetime:new AbortController(), draft:null, reviewed:false, active:false });
      return { version:PREVIEW_CONTEXT_VERSION, previewContextRef:ref, sourceHash:prepared.sourceHash,
        bodyHash:prepared.bodyHash, model:prepared.model, approvalBindingHash, expiresAtExclusive,
        automaticEligibility:false, paymentAllowed:false };
    },
    // Only the server's peer-verified D response consumer calls this method. It is
    // deliberately absent from HTTP dispatch and accepts no raw model response.
    acceptVerifiedDraft(context, input, proposal) {
      exact(input, ['previewContextRef','draftId','proposalHash','sourceHash','bodyHash','approvalBindingHash']);
      const {r} = record(context, input.previewContextRef);
      check(opaque(input.draftId) && hex(input.proposalHash) && input.proposalHash !== '0'.repeat(64) && input.sourceHash === r.sourceHash
        && input.bodyHash === r.bodyHash && input.approvalBindingHash === r.approvalBindingHash, 'CONTEXT_DRAFT');
      exact(proposal, ['sourceText','rows']);
      const prepared = prepareModel(proposal.sourceText);
      check(prepared.sourceHash === r.sourceHash && prepared.bodyHash === r.bodyHash
        && prepared.model === r.model && prepared.actualModelCall === false, 'CONTEXT_PROPOSAL');
      const validated = reviewModelProposal(proposal.sourceText, proposal.rows);
      check(validated.sourceHash === r.sourceHash && validated.proposalHash === input.proposalHash
        && validated.status === 'OPERATOR_REVIEW_REQUIRED', 'CONTEXT_PROPOSAL');
      record(context, input.previewContextRef);
      check(!r.draft || r.draft.draftId === input.draftId && r.draft.proposalHash === input.proposalHash, 'CONTEXT_DRAFT_REPLACED');
      r.draft = { draftId:input.draftId, proposalHash:input.proposalHash };
    },
    review(context, input) {
      exact(input, ['version','previewContextRef','draftId','proposalHash']); check(input.version === PREVIEW_CONTEXT_VERSION, 'CONTEXT_VERSION');
      const {r} = record(context, input.previewContextRef); matching(r,input); r.reviewed = true;
      return { version:PREVIEW_CONTEXT_VERSION, previewContextRef:input.previewContextRef, reviewed:true, paymentAllowed:false };
    },
    async observe(context, input) {
      exact(input, ['version','previewContextRef','draftId','proposalHash']); check(input.version === PREVIEW_CONTEXT_VERSION, 'CONTEXT_VERSION');
      const {r} = record(context, input.previewContextRef); matching(r,input);
      check(r.reviewed && !r.active, 'CONTEXT_REVIEW_OR_BUSY'); r.active = true;
      const controller = new AbortController();
      const cancel = () => controller.abort(r.lifetime.signal.reason);
      r.lifetime.signal.addEventListener('abort', cancel, { once:true });
      try {
        const cancelled = new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once:true });
        });
        const result = await Promise.race([
          cancelled,
          Promise.resolve().then(() => {
            controller.signal.throwIfAborted();
            return coordinator.readPreview(context, applicationId, r.bindingRef, { signal:controller.signal });
          })
        ]);
        controller.signal.throwIfAborted();
        const received = time();
        const {live} = record(context,input.previewContextRef);
        const items = result.observations.filter(item => item.targetRef === targetRef);
        check(items.length === 1 && result.scope === 'READ_PREVIEW' && result.sourceStatus === 'OBSERVED_AT'
          && result.paymentAllowed === false && result.automaticEligibility === false, 'CONTEXT_OBSERVATION');
        const final = time(), item = items[0];
        check(final.mono >= received.mono && final.mono - received.mono < policy.finalFenceMs
          && final.now - item.observedAt + policy.maxClockSkewSeconds < policy.maxObservationAgeSeconds
          && final.now < Math.min(result.expiresAtExclusive,r.expiresAtExclusive,live.expiry), 'CONTEXT_OBSERVATION_EXPIRED');
        // This is the only observation payload allowed into the D peer envelope.
        const triple = { targetRef:item.targetRef, status:item.status, observedAt:item.observedAt };
        observations.set(triple, { ref:input.previewContextRef, digest:hash(triple), finalMono:final.mono,
          expiry:Math.min(result.expiresAtExclusive,r.expiresAtExclusive,item.observedAt + policy.maxObservationAgeSeconds - policy.maxClockSkewSeconds) });
        return triple;
      } finally {
        r.lifetime.signal.removeEventListener('abort', cancel);
        controller.abort();
        r.active = false;
      }
    },
    deliverObservation(context, input, observation, transport) {
      exact(input,['previewContextRef','draftId','proposalHash']); const {r} = record(context,input.previewContextRef); matching(r,input);
      check(r.reviewed, 'CONTEXT_REVIEW_OR_BUSY');
      const receipt = observations.get(observation), final = time();
      check(receipt && receipt.ref === input.previewContextRef && receipt.digest === hash(observation)
        && final.mono >= receipt.finalMono && final.mono - receipt.finalMono < policy.finalFenceMs
        && final.now < receipt.expiry, 'CONTEXT_DELIVERY_EXPIRED');
      observations.delete(observation);
      // No await between the final authority/freshness check and dispatch. Never
      // re-sign an arbitrary or cached triple with a new transport timestamp.
      return transport.query(Buffer.from(canonical(observation)), {
        contextRef:input.previewContextRef, sourceHash:r.sourceHash, proposalHash:r.draft.proposalHash,
        expiresAtExclusive:receipt.expiry }, { signal:r.lifetime.signal });
    },
    close() { closed = true; for(const ref of records.keys()) forget(ref, 'CONTEXT_CLOSED'); }
  });
}
