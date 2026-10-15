import { array, exactKeys, freeze, requireRule as check, RuleError } from '../policy/values.mjs';
import { same } from '../policy/mvp/contract.mjs';

export const FIELD_REVIEW_VERSION = 'clear-field-review.1';
const identifier = value => check(typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value), 'AI_FIELD_REVIEW');
const text = value => check(typeof value === 'string' && value.length > 0 && value.length <= 240, 'AI_FIELD_REVIEW');
const unique = values => check(new Set(values).size === values.length, 'AI_FIELD_REVIEW');

// No NLP/regex guessing of question meaning. Any unresolved signal holds its
// explicit fields; a legacy string or unknown scope holds the whole observation.
export function reviewFields(input, requestedFieldIds) {
  const raw = structuredClone(input), requested = structuredClone(requestedFieldIds);
  array(requested, 64, 'AI_FIELD_REVIEW'); check(requested.length > 0, 'AI_FIELD_REVIEW');
  requested.forEach(identifier); unique(requested);
  exactKeys(raw, ['fields', 'questions', 'flags'], 'AI_FIELD_REVIEW');
  array(raw.fields, 64, 'AI_FIELD_REVIEW'); array(raw.questions, 32, 'AI_FIELD_REVIEW'); array(raw.flags, 32, 'AI_FIELD_REVIEW');
  for (const field of raw.fields) {
    exactKeys(field, ['fieldId', 'value', 'location'], 'AI_FIELD_REVIEW');
    check(requested.includes(field.fieldId), 'AI_FIELD_REVIEW');
    if (field.value !== null) text(field.value);
    if (field.location !== null) text(field.location);
    check(field.value === null || field.location !== null, 'AI_FIELD_REVIEW');
  }
  unique(raw.fields.map(field => field.fieldId));
  const reasons = new Map(requested.map(id => [id, []]));
  const signal = (item, kind, index) => {
    let scope = null;
    if (typeof item === 'string') text(item);
    else {
      exactKeys(item, kind === 'QUESTION' ? ['questionId', 'fieldIds', 'text'] : ['code', 'fieldIds'], 'AI_FIELD_REVIEW');
      if (kind === 'QUESTION') { identifier(item.questionId); text(item.text); } else identifier(item.code);
      if (item.fieldIds !== null) {
        array(item.fieldIds, 64, 'AI_FIELD_REVIEW'); check(item.fieldIds.length > 0, 'AI_FIELD_REVIEW'); unique(item.fieldIds);
        check(item.fieldIds.every(id => requested.includes(id)), 'AI_FIELD_REVIEW'); scope = item.fieldIds;
      }
    }
    for (const id of scope ?? requested) reasons.get(id).push(`${kind}:${index}`);
  };
  raw.questions.forEach((item, i) => signal(item, 'QUESTION', i));
  raw.flags.forEach((item, i) => signal(item, 'FLAG', i));
  const fields = requested.map(fieldId => {
    const observed = raw.fields.find(field => field.fieldId === fieldId);
    const holds = reasons.get(fieldId), absent = !observed || observed.value === null;
    return { fieldId, value: holds.length || absent ? null : observed.value,
      location: observed?.location ?? null, state: holds.length ? 'HELD' : absent ? 'UNOBSERVED' : 'OBSERVED',
      reasons: holds.length ? holds : absent ? ['NO_VALUE'] : [] };
  });
  return freeze({ version: FIELD_REVIEW_VERSION, fields, questions: raw.questions, flags: raw.flags,
    // Diagnostic observation only; never a second set of accepted policy values.
    provenance: raw.fields.map(({ fieldId, value, location }) => ({ fieldId, observedValue: value, location })),
    status: fields.some(field => field.state !== 'OBSERVED') ? 'NEEDS_REVIEW' : 'OBSERVED_ONLY',
    publishable: false, automaticEligibility: false, paymentAllowed: false });
}

function contextShape(context) {
  exactKeys(context, ['revision', 'inputHash', 'runId'], 'AI_REVIEW_CONTEXT'); identifier(context.runId);
  check(Number.isSafeInteger(context.revision) && context.revision >= 1 && context.revision <= 2147483647
    && typeof context.inputHash === 'string' && /^[a-f0-9]{64}$/.test(context.inputHash), 'AI_REVIEW_CONTEXT');
}

// In-process acceptance only, not persistence/authentication or a DB CAS. The
// caller pins inputHash to its source/submission and begins every retry first.
export function createFieldReviewSession(requestedFieldIds) {
  reviewFields({ fields: [], questions: [], flags: [] }, requestedFieldIds);
  const requested = structuredClone(requestedFieldIds), tickets = new WeakMap(), receipts = new WeakSet(), runs = new Set();
  let latest = null;
  return {
    begin(input) {
      const context = structuredClone(input); contextShape(context);
      check(runs.size < 1024 && !runs.has(context.runId), 'AI_REVIEW_RUN_REUSE');
      check(!latest || context.revision > latest.revision || (context.revision === latest.revision
        && context.inputHash === latest.inputHash), 'AI_REVIEW_REVISION');
      const ticket = freeze(context); tickets.set(ticket, { consumed: false }); runs.add(context.runId); latest = ticket;
      return ticket;
    },
    finish(ticket, observation) {
      const entry = tickets.get(ticket); check(entry && !entry.consumed, 'AI_REVIEW_TICKET'); entry.consumed = true;
      if (ticket !== latest) return freeze({ status: 'STALE', current: false, review: null, reason: 'AI_REVIEW_STALE', paymentAllowed: false });
      try {
        const receipt = freeze({ status: 'CURRENT', current: true, context: ticket, review: reviewFields(observation, requested), reason: null, paymentAllowed: false });
        receipts.add(receipt); return receipt;
      } catch (error) {
        if (!(error instanceof RuleError)) throw error;
        return freeze({ status: 'REJECTED', current: true, context: ticket, review: null, reason: 'AI_REVIEW_OUTPUT_INVALID', paymentAllowed: false });
      }
    },
    isCurrent(receipt) { return receipts.has(receipt) && receipt.status === 'CURRENT' && tickets.has(receipt.context) && same(receipt.context, latest); },
  };
}
