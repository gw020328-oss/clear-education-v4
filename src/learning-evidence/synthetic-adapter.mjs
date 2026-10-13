import { freeze, requireRule, RuleError } from '../policy/values.mjs';
import { assessSyntheticLearningEvidence, heldLearningEvidence, inspectLearningManifest,
  learningExpectation, LEARNING_SOURCE_PROFILE } from './synthetic-contract.mjs';

function read(operation, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new RuleError('LEARNING_CANCELLED')); };
    signal.addEventListener('abort', abort, { once: true });
    // Driver failures are untrusted; never expose their text or RuleError code.
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then(value => structuredClone(value)).then(value => {
      signal.removeEventListener('abort', abort); resolve(value);
    }, () => { signal.removeEventListener('abort', abort); reject(new RuleError('LEARNING_SOURCE_UNAVAILABLE')); });
  });
}

// No default HTTP endpoint, credentials, DB writes or product service route.
// The source is a trusted synthetic test driver; close must stop its resources.
export async function collectSyntheticLearningEvidence(compiled, trusted, source, {
  now = () => String(Math.floor(Date.now() / 1000)), signal, timeoutMs = 10000,
} = {}) {
  const cancelled = new AbortController(); let timer, bundle, failure, context, scope;
  try {
    requireRule(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000, 'LEARNING_TIMEOUT_CONFIG');
    context = structuredClone(trusted);
    learningExpectation(compiled, { ...context, now: now() });
    // 'now' belongs only to the server clock, not to the pinned resolver DTO.
    requireRule(!Object.hasOwn(context, 'now'), 'LEARNING_CONTEXT');
    requireRule(source?.profile === LEARNING_SOURCE_PROFILE && source.providerId === context.providerId
      && typeof source.readManifest === 'function' && typeof source.readPage === 'function'
      && typeof source.close === 'function', 'LEARNING_SOURCE_UNSUPPORTED');
    const request = freeze({ applicationId: context.applicationId, learnerId: context.learnerId,
      subjectRef: context.subjectRef, policyHash: compiled.policyHash, snapshotVersion: context.snapshotVersion,
      requiredLectureIdsHash: compiled.requiredLectureIdsHash,
      learningStart: compiled.policy.learningStart, learningEnd: compiled.policy.learningEnd });
    scope = AbortSignal.any([signal, cancelled.signal].filter(Boolean));
    timer = setTimeout(() => cancelled.abort(), timeoutMs);
    // readManifest must return the CURRENT revision (or fail its version
    // precondition), never serve an old revision merely because it was requested.
    const manifest = await read(() => source.readManifest(request, { signal: scope }), scope);
    inspectLearningManifest(compiled, { ...context, now: now() }, manifest);
    bundle = { manifest, pages: [] };
    for (const pin of manifest.pages) {
      bundle.pages.push(await read(() => source.readPage(freeze({ ...request, pageId: pin.pageId }), { signal: scope }), scope));
    }
    // Revisions during pagination require a newly resolved pin, never silently
    // mixing pages or adopting the provider's latest version in this request.
    const latest = await read(() => source.readManifest(request, { signal: scope }), scope);
    inspectLearningManifest(compiled, { ...context, now: now() }, latest);
  } catch (error) {
    failure = signal?.aborted ? 'LEARNING_CANCELLED' : cancelled.signal.aborted ? 'LEARNING_TIMEOUT'
      : error instanceof RuleError ? error.message : 'LEARNING_SOURCE_UNAVAILABLE';
  } finally {
    clearTimeout(timer); cancelled.abort();
    try { await source?.close(); } catch { failure = 'LEARNING_CLEANUP_FAILED'; }
  }
  if (failure) return heldLearningEvidence(failure);
  if (signal?.aborted) return heldLearningEvidence('LEARNING_CANCELLED');
  // Includes the time spent fetching and cleaning up; no stale result escapes.
  return assessSyntheticLearningEvidence(compiled, { ...context, now: now() }, bundle);
}
