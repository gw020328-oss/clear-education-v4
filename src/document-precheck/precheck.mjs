import { array, exactKeys, freeze, requireRule as check, RuleError } from '../policy/values.mjs';
import { validateContract, digest, same, DOCUMENT_LIMITS } from '../policy/mvp/contract.mjs';
import { requireMvpPolicy } from '../policy/mvp/compiler.mjs';
import { reviewFields } from '../ai-policy/field-review.mjs';
import { invokeMockObservation } from '../ai-policy/model-boundary.mjs';

export const DOCUMENT_OBSERVATION_PROMPT_VERSION = 'clear-document-observe.1';

const identifier = value => check(typeof value === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(value), 'DOCUMENT_IDENTIFIER');
const unique = values => check(new Set(values).size === values.length, 'DOCUMENT_DUPLICATE');
const boundedText = (value, max) => check(typeof value === 'string' && value.length <= max, 'DOCUMENT_TEXT');
const unverified = () => ({ publication: 'UNVERIFIED', author: 'UNVERIFIED', publishedAt: 'UNVERIFIED', modifiedAt: 'UNVERIFIED', publicAvailability: 'UNVERIFIED' });
export const submissionDigest = submission => digest('CLEAR-DOCUMENT-SUBMISSION', submission);
export const reviewPlanDigest = plan => digest('CLEAR-DOCUMENT-REVIEW-PLAN', plan);

function submissionShape(submission) {
  exactKeys(submission, ['submissionId', 'revision', 'routeRevision', 'posts'], 'DOCUMENT_SUBMISSION');
  identifier(submission.submissionId); array(submission.posts, DOCUMENT_LIMITS.maxPosts, 'DOCUMENT_LIMIT');
  unique(submission.posts.map(post => post?.postId));
  for (const post of submission.posts) {
    exactKeys(post, ['postId', 'title', 'text', 'tags', 'links', 'images'], 'DOCUMENT_POST'); identifier(post.postId);
    boundedText(post.title, 240); boundedText(post.text, 32000);
    array(post.tags, 32, 'DOCUMENT_LIMIT'); post.tags.forEach(tag => boundedText(tag, 120));
    array(post.links, 32, 'DOCUMENT_LIMIT'); post.links.forEach(link => boundedText(link, 2048));
    array(post.images, DOCUMENT_LIMITS.maxImagesPerPost, 'DOCUMENT_LIMIT'); unique(post.images.map(image => image?.imageId));
    for (const image of post.images) {
      exactKeys(image, ['imageId', 'byteLength', 'width', 'height'], 'DOCUMENT_IMAGE_METADATA'); identifier(image.imageId);
      check(Number.isSafeInteger(image.byteLength) && image.byteLength > 0 && image.byteLength <= DOCUMENT_LIMITS.maxBytesPerFile
        && Number.isSafeInteger(image.width) && image.width > 0 && image.width <= DOCUMENT_LIMITS.maxPixelsPerImage
        && Number.isSafeInteger(image.height) && image.height > 0 && image.height <= DOCUMENT_LIMITS.maxPixelsPerImage
        && image.width * image.height <= DOCUMENT_LIMITS.maxPixelsPerImage, 'DOCUMENT_LIMIT');
    }
  }
}

function contextFor(compiled, context, submission) {
  const policy = requireMvpPolicy(compiled);
  exactKeys(context, ['binding', 'requirementId', 'ruleId', 'ruleVersion', 'submissionId', 'submissionRevision', 'routeRevision', 'inputHash', 'runId'], 'DOCUMENT_CONTEXT');
  validateContract('Binding', context.binding); submissionShape(submission);
  check(context.binding.policyHash === compiled.policyHash && context.binding.policyVersion === policy.policyVersion
    && context.binding.productId === policy.productId && context.binding.cohortId === policy.cohortId, 'DOCUMENT_BINDING');
  const requirement = policy.requirements.find(item => item.requirementId === context.requirementId);
  const rule = policy.rules.find(item => item.ruleId === context.ruleId && item.requirementId === context.requirementId);
  check(requirement && ['REVIEW', 'BLOG'].includes(requirement.kind) && rule, 'DOCUMENT_REQUIREMENT');
  check(context.submissionId === submission.submissionId && context.submissionRevision === submission.revision
    && context.routeRevision === submission.routeRevision && context.inputHash === submissionDigest(submission), 'DOCUMENT_CONTEXT');
  // Validates all shared IDs/revisions using the real consumer contract.
  validateContract('DocumentPrecheck', makeRecord(context, rule.sourceRefs, 'CODE', 'CHECKED', [], null));
  return { policy, rule, requirement };
}

function makeRecord(context, sourceRefs, method, reviewStatus, observations, questionId) {
  return { contractVersion: 'clear-mvp.1', ...structuredClone(context), method, execution: 'MOCK', current: true,
    reviewStatus, questionId, sourceRefs: structuredClone(sourceRefs), observations,
    sourceVerification: unverified(), automaticEligibility: false, paymentAllowed: false };
}
const outcome = status => status === 'CHECKED' ? 'PRECHECK_REQUIREMENTS_MET' : status === 'MISSING' ? 'NEEDS_SUPPLEMENT' : 'UNDETERMINED';
function aggregate(statuses) {
  return ['POLICY_OPEN', 'UNREADABLE', 'NEEDS_REVIEW', 'MISSING'].find(status => statuses.includes(status)) ?? 'CHECKED';
}

const optionKeys = {
  CHAR_COUNT: ['minimum', 'unit', 'space', 'normalization'], BYTE_COUNT: ['minimum', 'encoding', 'space', 'normalization'],
  IMAGE_COUNT: ['minimum', 'duplicatePolicy'], LINK: ['url'], TEXT: ['value', 'position'],
  KEYWORDS: ['values', 'minimumDistinct', 'field'],
};
export function validateReviewPlan(plan, pinnedPlanHash, context, policy) {
  exactKeys(plan, ['version', 'requirementId', 'ruleId', 'checks'], 'DOCUMENT_PLAN'); identifier(plan.version);
  check(plan.version === context.ruleVersion && plan.ruleId === context.ruleId && plan.requirementId === context.requirementId
    && reviewPlanDigest(plan) === pinnedPlanHash, 'DOCUMENT_PLAN_PIN');
  array(plan.checks, 32, 'DOCUMENT_PLAN'); check(plan.checks.length > 0, 'DOCUMENT_PLAN');
  unique(plan.checks.map(item => item?.checkId));
  for (const item of plan.checks) {
    exactKeys(item, ['checkId', 'kind', 'scope', 'basis', 'questionId', 'sourceRefs', 'options'], 'DOCUMENT_PLAN'); identifier(item.checkId);
    check(Object.hasOwn(optionKeys, item.kind) && ['POST', 'BUNDLE'].includes(item.scope)
      && (item.scope === 'POST' || item.kind === 'KEYWORDS') && ['SYNTHETIC_ASSUMPTION', 'OPEN'].includes(item.basis), 'DOCUMENT_PLAN');
    exactKeys(item.options, optionKeys[item.kind], 'DOCUMENT_PLAN');
    check(item.questionId === null || policy.questions.some(question => question.questionId === item.questionId), 'DOCUMENT_QUESTION');
    array(item.sourceRefs, 16, 'DOCUMENT_PLAN'); check(item.sourceRefs.length > 0, 'DOCUMENT_PLAN');
    for (const ref of item.sourceRefs) {
      exactKeys(ref, ['sourceId', 'locator'], 'DOCUMENT_PLAN');
      check(policy.sources.some(source => source.sourceId === ref.sourceId && source.locators.includes(ref.locator)), 'DOCUMENT_SOURCE');
    }
    const o = item.options;
    if ('minimum' in o) check(o.minimum === null || (Number.isInteger(o.minimum) && o.minimum >= 0 && o.minimum <= 32000), 'DOCUMENT_PLAN');
    if (['CHAR_COUNT', 'BYTE_COUNT'].includes(item.kind)) {
      check([null, 'INCLUDE', 'EXCLUDE'].includes(o.space) && [null, 'NONE', 'NFC'].includes(o.normalization), 'DOCUMENT_PLAN');
      if (item.kind === 'CHAR_COUNT') check([null, 'CODEPOINTS', 'UTF16'].includes(o.unit), 'DOCUMENT_PLAN');
      else check([null, 'UTF8'].includes(o.encoding), 'DOCUMENT_PLAN');
    }
    if (item.kind === 'IMAGE_COUNT') check(['COUNT_SUBMITTED_FILES', 'OPEN'].includes(o.duplicatePolicy), 'DOCUMENT_PLAN');
    if (item.kind === 'LINK' && o.url !== null) {
      boundedText(o.url, 2048); let parsed;
      try { parsed = new URL(o.url); } catch { throw new RuleError('DOCUMENT_PLAN'); }
      check(['https:', 'http:'].includes(parsed.protocol), 'DOCUMENT_PLAN');
    }
    if (item.kind === 'TEXT') { if (o.value !== null) { boundedText(o.value, 240); check(o.value.length > 0, 'DOCUMENT_PLAN'); }
      check([null, 'ANYWHERE', 'START', 'END'].includes(o.position), 'DOCUMENT_PLAN'); }
    if (item.kind === 'KEYWORDS') {
      array(o.values, 32, 'DOCUMENT_PLAN'); check(o.values.length > 0, 'DOCUMENT_PLAN'); unique(o.values);
      o.values.forEach(value => { boundedText(value, 120); check(value.length > 0, 'DOCUMENT_PLAN'); });
      check(Number.isInteger(o.minimumDistinct) && o.minimumDistinct >= 1 && o.minimumDistinct <= o.values.length
        && ['TITLE', 'TEXT', 'TAGS'].includes(o.field), 'DOCUMENT_PLAN');
    }
  }
}

const policyOpen = item => item.basis === 'OPEN' || Object.values(item.options).includes(null) || item.options.duplicatePolicy === 'OPEN';
function checkContent(item, posts) {
  const o = item.options;
  if (policyOpen(item)) return { status: 'POLICY_OPEN', value: null };
  let value, met;
  const post = posts[0];
  if (['CHAR_COUNT', 'BYTE_COUNT'].includes(item.kind)) {
    let text = o.normalization === 'NFC' ? post.text.normalize('NFC') : post.text;
    if (o.space === 'EXCLUDE') text = text.replace(/\s/gu, '');
    value = item.kind === 'BYTE_COUNT' ? Buffer.byteLength(text, 'utf8') : o.unit === 'CODEPOINTS' ? [...text].length : text.length;
    met = value >= o.minimum;
  } else if (item.kind === 'IMAGE_COUNT') { value = post.images.length; met = value >= o.minimum; }
  else if (item.kind === 'LINK') { met = post.links.includes(o.url); value = met ? 'PRESENT' : 'ABSENT'; }
  else if (item.kind === 'TEXT') {
    met = o.position === 'START' ? post.text.startsWith(o.value) : o.position === 'END' ? post.text.endsWith(o.value) : post.text.includes(o.value);
    value = met ? 'PRESENT' : 'ABSENT';
  } else {
    const texts = posts.map(post => o.field === 'TITLE' ? post.title : o.field === 'TEXT' ? post.text : post.tags.join('\n'));
    value = o.values.filter(keyword => texts.some(text => text.includes(keyword))).length; met = value >= o.minimumDistinct;
  }
  return { status: met ? 'CHECKED' : 'MISSING', value: String(value) };
}

// Submitted text and image metadata only. No file decode or real publication checks.
export function precheckCode(compiled, context, input, { plan, pinnedPlanHash }) {
  const submission = structuredClone(input), { policy, rule } = contextFor(compiled, context, submission);
  validateReviewPlan(plan, pinnedPlanHash, context, policy);
  const groups = submission.posts.map(post => ({ posts: [post], locator: 'post/' + post.postId,
    checks: plan.checks.filter(item => item.scope === 'POST') }));
  const bundleChecks = plan.checks.filter(item => item.scope === 'BUNDLE');
  if (bundleChecks.length) groups.push({ posts: submission.posts, locator: 'bundle', checks: bundleChecks });
  const details = [], records = [];
  for (const group of groups) {
    if (!group.checks.length) continue;
    const checks = group.checks.map(item => ({ checkId: item.checkId, questionId: item.questionId, ...checkContent(item, group.posts) }));
    details.push({ locator: group.locator, checks });
    const status = aggregate(checks.map(item => item.status));
    const refs = [...new Map(group.checks.flatMap(item => item.sourceRefs).map(ref => [ref.sourceId + ':' + ref.locator, ref])).values()];
    const record = makeRecord(context, refs, 'CODE', status,
      checks.map(item => ({ fieldId: item.checkId, value: item.value, locator: group.locator })), checks.find(item => item.questionId !== null)?.questionId ?? null);
    validateContract('DocumentPrecheck', record); records.push(record);
  }
  if (!submission.posts.length) {
    records.length = 0; details.length = 0;
    records.push(makeRecord(context, rule.sourceRefs, 'CODE', 'MISSING', [], null));
    validateContract('DocumentPrecheck', records[0]);
    const open = plan.checks.filter(policyOpen);
    if (open.length) {
      records.push(makeRecord(context, rule.sourceRefs, 'CODE', 'POLICY_OPEN',
        open.map(item => ({ fieldId: item.checkId, value: null, locator: null })), open.find(item => item.questionId !== null)?.questionId ?? null));
      validateContract('DocumentPrecheck', records[1]);
    }
    details.push({ locator: 'bundle', checks: [{ checkId: 'document-presence', status: 'MISSING', value: null, questionId: null },
      ...open.map(item => ({ checkId: item.checkId, status: 'POLICY_OPEN', value: null, questionId: item.questionId }))] });
  }
  return freeze({ planHash: pinnedPlanHash, records, details, outcome: outcome(aggregate(records.map(record => record.reviewStatus))),
    execution: 'MOCK', automaticEligibility: false, paymentAllowed: false });
}

function validLocator(locator, quote, method, submission) {
  if (typeof locator !== 'string') return false;
  for (const post of submission.posts) {
    if (method === 'VISION' && quote === null && post.images.some(image => locator === 'post/' + post.postId + '/image/' + image.imageId)) return true;
    const prefix = 'post/' + post.postId + '/text/';
    if (method === 'TEXT_AI' && locator.startsWith(prefix)) {
      const parts = locator.slice(prefix.length).split('/');
      if (parts.length !== 2 || !parts.every(part => /^(0|[1-9][0-9]*)$/.test(part))) return false;
      const [start, end] = parts.map(Number);
      if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < end && end <= post.text.length
        && typeof quote === 'string' && quote.length > 0 && post.text.slice(start, end) === quote) return true;
    }
  }
  return false;
}

export async function precheckObservation(compiled, context, input, { method, fieldIds, adapter, ...options }) {
  check(['TEXT_AI', 'VISION'].includes(method), 'DOCUMENT_METHOD');
  const submission = structuredClone(input), capturedContext = structuredClone(context);
  const { rule } = contextFor(compiled, capturedContext, submission);
  array(fieldIds, 32, 'DOCUMENT_FIELDS'); check(fieldIds.length > 0, 'DOCUMENT_FIELDS'); fieldIds.forEach(identifier); unique(fieldIds);
  const missingInput = method === 'VISION' ? submission.posts.every(post => post.images.length === 0)
    : submission.posts.every(post => post.text.length === 0);
  if (missingInput) {
    const record = makeRecord(capturedContext, rule.sourceRefs, method, 'MISSING', [], null);
    validateContract('DocumentPrecheck', record);
    return freeze({ record, runStatus: 'SKIPPED_MISSING_INPUT', reason: 'MISSING_INPUT', actualModelCall: false, outcome: 'NEEDS_SUPPLEMENT' });
  }
  const requested = [...fieldIds];
  const run = await invokeMockObservation(adapter, { promptVersion: DOCUMENT_OBSERVATION_PROMPT_VERSION, instruction: 'Observe submitted data only. No authenticity, author, completeness or payment authority.',
    method, requestedFields: requested, submission }, options);
  let status = 'NEEDS_REVIEW', observations = [], reason = run.status, fieldReview = null, observationEvidence = null;
  if (run.status === 'SUCCEEDED') {
    try {
      const output = run.output;
      const scoped = Object.hasOwn(output ?? {}, 'questions') || Object.hasOwn(output ?? {}, 'flags');
      exactKeys(output, scoped ? ['reviewStatus', 'observations', 'questions', 'flags'] : ['reviewStatus', 'observations'], 'DOCUMENT_MODEL_OUTPUT');
      check(['CHECKED', 'MISSING', 'NEEDS_REVIEW', 'UNREADABLE'].includes(output.reviewStatus), 'DOCUMENT_MODEL_OUTPUT');
      array(output.observations, 64, 'DOCUMENT_MODEL_OUTPUT'); unique(output.observations.map(item => item?.fieldId));
      for (const observation of output.observations) {
        exactKeys(observation, ['fieldId', 'value', 'locator', 'quote'], 'DOCUMENT_MODEL_OUTPUT');
        check(requested.includes(observation.fieldId), 'DOCUMENT_MODEL_OUTPUT');
        if (observation.value !== null) {
          check(typeof observation.value === 'string' && observation.value.length > 0 && observation.value.length <= 240
            && validLocator(observation.locator, observation.quote, method, submission), 'DOCUMENT_MODEL_OUTPUT');
        } else check(observation.locator === null && observation.quote === null, 'DOCUMENT_MODEL_OUTPUT');
      }
      check(output.reviewStatus !== 'CHECKED' || requested.every(fieldId => output.observations.some(item => item.fieldId === fieldId && item.value !== null)), 'DOCUMENT_MODEL_OUTPUT');
      const reviewInput = { fields: output.observations.map(({ fieldId, value, locator }) => ({ fieldId, value, location: locator })),
        questions: scoped ? output.questions : [], flags: scoped ? output.flags : [] };
      if (output.reviewStatus !== 'CHECKED' && Array.isArray(reviewInput.questions) && Array.isArray(reviewInput.flags)
        && !reviewInput.questions.length && !reviewInput.flags.length) reviewInput.flags = ['REVIEW_STATUS_' + output.reviewStatus];
      fieldReview = reviewFields(reviewInput, requested);
      observations = fieldReview.fields.map(({ fieldId, value, location }) => ({ fieldId, value, locator: location }));
      status = output.reviewStatus === 'CHECKED' && fieldReview.status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : output.reviewStatus;
      observationEvidence = structuredClone(output); reason = null;
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      reason = 'MODEL_OUTPUT_REJECTED';
    }
  }
  const record = makeRecord(capturedContext, rule.sourceRefs, method, status, observations, null);
  validateContract('DocumentPrecheck', record);
  return freeze({ record, fieldReview, observationEvidence, runStatus: run.status, reason, actualModelCall: false, outcome: outcome(status) });
}

// Latest context comes from the caller's resolver. This does not save/accept results.
export function markPrecheckCurrent(record, latestContext) {
  validateContract('DocumentPrecheck', record);
  const keys = ['binding', 'requirementId', 'ruleId', 'ruleVersion', 'submissionId', 'submissionRevision', 'routeRevision', 'inputHash', 'runId'];
  check(keys.every(key => Object.hasOwn(latestContext, key)), 'DOCUMENT_LATEST_CONTEXT');
  const current = record.current && keys.every(key => same(record[key], latestContext[key]));
  const result = { ...structuredClone(record), current };
  if (!current) {
    result.observations = result.observations.map(field => ({ ...field, value: null }));
    result.reviewStatus = 'NEEDS_REVIEW';
  }
  validateContract('DocumentPrecheck', result); return freeze(result);
}
