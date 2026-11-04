import { createHash } from 'node:crypto';

export const fail = code => { throw new Error(code); };
export const requireRule = (condition, code) => { if (!condition) fail(code); };
export const digest = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const hash = value => digest(canonical(value));
export const integer = value => Number.isSafeInteger(value) && value >= 0;
export const opaque = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
export const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function exact(value, keys) {
  requireRule(value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort()), 'DTO_KEYS');
}
const shapes = {
  start: ['version'],
  startResult: ['version', 'attemptRef', 'expiresAtExclusive'],
  attemptRequest: ['version', 'attemptRef', 'requestRef'],
  attempt: ['version', 'attemptRef', 'requestRef', 'installationRef', 'courseRef', 'audience', 'bindingScopeHash', 'expectedSubjectRef', 'rosterRevision', 'trustEpoch', 'issuerEpoch', 'expiresAtExclusive'],
  confirmationRequest: ['version', 'attemptRef', 'bindingScopeHash', 'issuerEpoch', 'requestRef'],
  confirmation: ['version', 'attemptRef', 'requestRef', 'installationRef', 'courseRef', 'subjectRef', 'accountHint', 'audience', 'bindingScopeHash', 'confirmationRef', 'moodleSessionGeneration', 'enrolmentRevision', 'rosterRevision', 'trustEpoch', 'issuerEpoch', 'confirmedAt', 'observedAt', 'checkedAt', 'expiresAtExclusive'],
  preview: ['version', 'attemptRef'],
  previewResult: ['version', 'attemptRef', 'installationRef', 'courseRef', 'accountHint', 'confirmationDigest', 'expiresAtExclusive'],
  complete: ['version', 'attemptRef', 'confirmationDigest'],
  completeResult: ['version', 'bindingRef', 'status', 'bindingRevision', 'expiresAtExclusive'],
  readPreview: ['version', 'applicationId', 'bindingRef', 'bindingRevision', 'scope', 'sourceStatus', 'enrolmentRevision', 'observedAt', 'expiresAtExclusive', 'observations', 'automaticEligibility', 'paymentAllowed'],
  observationsRequest: ['version', 'requestRef', 'issuerEpoch', 'bindingScopeHash', 'confirmationRef'],
  observations: ['version', 'requestRef', 'installationRef', 'courseRef', 'subjectRef', 'audience', 'issuerEpoch', 'trustEpoch', 'rosterRevision', 'bindingScopeHash', 'confirmationRef', 'moodleSessionGeneration', 'enrolmentRevision', 'scope', 'sourceStatus', 'observedAt', 'checkedAt', 'expiresAtExclusive', 'observations'],
};
export const versions = Object.freeze({ start: 'clear-moodle-start.3', startResult: 'clear-moodle-start.3', attemptRequest: 'clear-moodle-attempt.3', attempt: 'clear-moodle-attempt.3', confirmationRequest: 'clear-moodle-confirmation.3', confirmation: 'clear-moodle-confirmation.3', preview: 'clear-moodle-confirm-preview.3', previewResult: 'clear-moodle-confirm-preview.3', complete: 'clear-moodle-complete.3', completeResult: 'clear-moodle-complete.3', readPreview: 'clear-moodle-read-preview.3', observationsRequest: 'clear-moodle-observations.3', observations: 'clear-moodle-observations.3' });
const numeric = new Set(['bindingRevision', 'rosterRevision', 'trustEpoch', 'enrolmentRevision', 'confirmedAt', 'observedAt', 'checkedAt', 'expiresAtExclusive']);
const hashes = new Set(['bindingScopeHash', 'confirmationDigest']);
export function validateDto(kind, input) {
  requireRule(Object.hasOwn(shapes, kind), 'DTO_KIND');
  exact(input, shapes[kind]);
  requireRule(input.version === versions[kind], 'DTO_VERSION');
  requireRule(Buffer.byteLength(JSON.stringify(input)) <= 16384, 'DTO_SIZE');
  for (const [key, value] of Object.entries(input)) {
    if (key === 'version') continue;
    if (numeric.has(key)) requireRule(integer(value) && value > 0, 'DTO_INTEGER');
    else if (hashes.has(key)) requireRule(hex(value), 'DTO_HASH');
    else if (key === 'accountHint') requireRule(typeof value === 'string' && value.length <= 80 && !/[\x00-\x1f\x7f]/.test(value), 'DTO_HINT');
    else if (key === 'scope') requireRule(value === 'READ_PREVIEW', 'DTO_SCOPE');
    else if (key === 'sourceStatus') requireRule(value === 'OBSERVED_AT', 'DTO_SOURCE');
    else if (key === 'status') requireRule(value === 'OBSERVED_ONLY', 'DTO_STATUS');
    else if (['automaticEligibility', 'paymentAllowed'].includes(key)) requireRule(value === false, 'DTO_AUTHORITY');
    else if (key === 'observations') {
      requireRule(Array.isArray(value) && value.length > 0 && value.length <= 16, 'DTO_OBSERVATIONS');
      const seen = new Set();
      for (const item of value) {
        exact(item, ['targetRef', 'status', 'observedAt']);
        requireRule(opaque(item.targetRef) && !seen.has(item.targetRef), 'DTO_TARGET'); seen.add(item.targetRef);
        requireRule(['COMPLETE', 'INCOMPLETE', 'UNKNOWN', 'INACCESSIBLE'].includes(item.status), 'DTO_STATUS');
        requireRule(item.observedAt === input.observedAt, 'DTO_SNAPSHOT');
      }
    } else requireRule(opaque(value), 'DTO_REF');
  }
  return structuredClone(input);
}
export function stableConfirmation(r) {
  return { bindingScopeHash: r.bindingScopeHash, confirmationRef: r.confirmationRef, subjectRef: r.subjectRef,
    moodleSessionGeneration: r.moodleSessionGeneration, enrolmentRevision: r.enrolmentRevision };
}
export const confirmationDigest = r => hash({ domain: 'CLEAR_READ_PREVIEW_CONFIRMATION_3', ...stableConfirmation(r) });
