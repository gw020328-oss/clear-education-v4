// Private evaluation-only records. No imports from product policy/evidence code.
const id = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, expected) => record(value) && Object.keys(value).length === expected.length
  && expected.every(key => Object.hasOwn(value, key));
const scalar = value => value === null || typeof value === 'boolean'
  || (typeof value === 'number' && Number.isSafeInteger(value))
  || (typeof value === 'string' && value.length <= 128);
const list = value => Array.isArray(value) && value.length <= 64
  && Array.from(value).every(id) && new Set(value).size === value.length;
const facts = value => record(value) && Object.keys(value).length <= 64
  && Object.entries(value).every(([key, value]) => id(key) && scalar(value));

function validSpec(value) {
  return keys(value, ['caseId', 'input', 'critical', 'expected']) && id(value.caseId)
    && typeof value.input === 'string' && value.input.length <= 16384 && typeof value.critical === 'boolean'
    && keys(value.expected, ['facts', 'requiredLabels', 'forbiddenLabels', 'requiredQuestions'])
    && facts(value.expected.facts) && list(value.expected.requiredLabels) && list(value.expected.forbiddenLabels)
    && list(value.expected.requiredQuestions)
    && !value.expected.requiredLabels.some(label => value.expected.forbiddenLabels.includes(label));
}

function compare(expected, actual) {
  if (!keys(actual, ['status', 'facts', 'labels', 'questionIds']) || actual.status !== 'OK'
    || !facts(actual.facts) || !list(actual.labels) || !list(actual.questionIds)) return ['INVALID_OUTPUT'];
  const errors = [];
  for (const [key, value] of Object.entries(expected.facts)) {
    if (!Object.hasOwn(actual.facts, key) || !Object.is(value, actual.facts[key])) errors.push('FACT_MISMATCH:' + key);
  }
  // Unknown fields cannot silently become accepted observations.
  if (Object.keys(actual.facts).some(key => !Object.hasOwn(expected.facts, key))) errors.push('UNEXPECTED_FACT');
  for (const label of expected.requiredLabels) if (!actual.labels.includes(label)) errors.push('MISSING_LABEL:' + label);
  for (const label of expected.forbiddenLabels) if (actual.labels.includes(label)) errors.push('FORBIDDEN_LABEL:' + label);
  if (actual.labels.some(label => !expected.requiredLabels.includes(label) && !expected.forbiddenLabels.includes(label))) errors.push('UNEXPECTED_LABEL');
  for (const question of expected.requiredQuestions) if (!actual.questionIds.includes(question)) errors.push('MISSING_QUESTION:' + question);
  return errors;
}

const TIMEOUT = Symbol('MOCK_TIMEOUT'), CANCELLED = Symbol('MOCK_CANCELLED');
async function observe(adapter, testCase, timeoutMs, signal, onInvoke) {
  const controller = new AbortController();
  let timeout, onAbort;
  const stop = new Promise((resolve, reject) => {
    onAbort = () => { reject(CANCELLED); controller.abort(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => { reject(TIMEOUT); controller.abort(); }, timeoutMs);
  });
  try {
    // The adapter is trusted test code, not arbitrary document executable code.
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw CANCELLED;
        onInvoke();
        return adapter.run({ caseId: testCase.caseId, input: testCase.input, signal: controller.signal });
      }),
      stop,
    ]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function evaluateMockCases(testCases, adapter, { timeoutMs = 100, signal } = {}) {
  if (!adapter || adapter.mode !== 'MOCK' || typeof adapter.run !== 'function') throw new Error('MOCK_ADAPTER_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new Error('INVALID_TIMEOUT');
  if (!Array.isArray(testCases) || !testCases.length || testCases.length > 1000
    || !Array.from(testCases).every(validSpec) || new Set(testCases.map(item => item.caseId)).size !== testCases.length) {
    throw new Error('INVALID_EVALUATION_CASES');
  }
  // Detach caller-owned expectations before asynchronous adapters run.
  const frozenCases = structuredClone(testCases);
  let mockAdapterInvocations = 0;
  const results = [];
  for (const testCase of frozenCases) {
    let errors;
    if (signal?.aborted) errors = ['CANCELLED'];
    else {
      try {
        const output = await observe(adapter, testCase, timeoutMs, signal, () => { mockAdapterInvocations++; });
        errors = keys(output, ['status']) && output.status === 'REFUSED'
          ? ['MODEL_REFUSAL_SIMULATED'] : compare(testCase.expected, output);
      } catch (error) {
        errors = [error === TIMEOUT ? 'MODEL_TIMEOUT_SIMULATED' : error === CANCELLED ? 'CANCELLED' : 'ADAPTER_FAILURE_SIMULATED'];
      }
    }
    results.push({ caseId: testCase.caseId, matched: errors.length === 0, critical: testCase.critical, errors });
  }
  return {
    evaluationVersion: 'ai-vision-evaluation-preparation.1',
    adapterMode: 'MOCK',
    actualModelCalls: 0,
    modelPerformanceMeasured: false,
    productAuthority: 'NONE',
    mockAdapterInvocations,
    caseRuns: results.length,
    matched: results.filter(result => result.matched).length,
    criticalFailures: results.filter(result => result.critical && !result.matched).length,
    results,
  };
}
