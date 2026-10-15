import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateMockCases } from './evaluation.mjs';
import { readCatalogueSummary, summarizeCatalogue } from './catalogue.mjs';
import { genericCase, genericResponse, selfCheck } from './self-check.mjs';

const mock = run => ({ mode: 'MOCK', run });
const run = (response, value = genericCase()) => evaluateMockCases([value], mock(() => response));

test('catalogue separates 31 historical, 11 blog and 3 generalization specs from executed gold', () => {
  const report = readCatalogueSummary();
  assert.deepEqual(report.caseSpecCounts, { historicalPolicy: 13, historicalVision: 7, historicalFlow: 11, blogPrecheck: 11, generalization: 3 });
  assert.equal(report.totalCaseSpecs, 45);
  assert.equal(report.executableGoldCases, 0);
  assert.equal(report.actualModelCalls, 0);
  assert.equal(report.modelPerformanceMeasured, false);
  assert.equal(report.productContract, 'NONE');
  const value = JSON.parse(readFileSync(new URL('./case-specs.json', import.meta.url)));
  value.blogCaseSpecs[0].id = value.historical.policyCases[0].id;
  assert.throws(() => summarizeCatalogue(Buffer.from(JSON.stringify(value))), /INVALID_CASE_CATALOGUE/);
});

test('mock matches expected observations without claiming model performance or authority', async () => {
  const report = await run(genericResponse());
  assert.equal(report.matched, 1);
  assert.equal(report.actualModelCalls, 0);
  assert.equal(report.modelPerformanceMeasured, false);
  assert.equal(report.productAuthority, 'NONE');
  assert.equal(report.mockAdapterInvocations, 1);
});

test('extra authority labels and approval fields fail even when observations match', async () => {
  for (const label of ['ELIGIBLE', 'AUTHENTICITY_VERIFIED', 'PAYMENT_APPROVED']) {
    const report = await run({ ...genericResponse(), labels: [...genericResponse().labels, label] });
    assert.equal(report.criticalFailures, 1);
    assert.ok(report.results[0].errors.includes('FORBIDDEN_LABEL:' + label));
  }
  assert.deepEqual((await run({ ...genericResponse(), paymentAllowed: true })).results[0].errors, ['INVALID_OUTPUT']);
  assert.ok((await run({ ...genericResponse(), labels: [...genericResponse().labels, 'SOME_NEW_AUTHORITY'] })).results[0].errors.includes('UNEXPECTED_LABEL'));
});

test('missing questions, null, false and unexpected facts cannot become matching observations', async () => {
  for (const value of [null, false, 750, '745']) {
    const report = await run({ ...genericResponse(), facts: { observedValue: value } });
    assert.ok(report.results[0].errors.includes('FACT_MISMATCH:observedValue'));
  }
  assert.ok((await run({ ...genericResponse(), facts: {} })).results[0].errors.includes('FACT_MISMATCH:observedValue'));
  assert.ok((await run({ ...genericResponse(), facts: { observedValue: 745, invented: true } })).results[0].errors.includes('UNEXPECTED_FACT'));
  assert.ok((await run({ ...genericResponse(), questionIds: [] })).results[0].errors.includes('MISSING_QUESTION:source-verification'));
});

test('malformed output is rejected without coercing JSON or trusting model prose', async () => {
  for (const response of [null, 'PASS', JSON.stringify(genericResponse()), [],
    { ...genericResponse(), labels: new Array(2) },
    { ...genericResponse(), questionIds: ['source-verification', 'source-verification'] },
    { ...genericResponse(), facts: { observedValue: 1.5 } },
    { ...genericResponse(), facts: { observedValue: { claimed: 745 } } },
    { ...genericResponse(), facts: { observedValue: Infinity } }]) {
    assert.deepEqual((await run(response)).results[0].errors, ['INVALID_OUTPUT']);
  }
});

test('invalid or duplicate case specs are rejected before invoking any adapter', async () => {
  let calls = 0;
  const adapter = mock(() => { calls++; return genericResponse(); });
  for (const cases of [[], new Array(1), [genericCase(), genericCase()], [{ ...genericCase(), critical: 'true' }]]) {
    await assert.rejects(evaluateMockCases(cases, adapter), /INVALID_EVALUATION_CASES/);
  }
  assert.equal(calls, 0);
});

test('ACTUAL adapter mode is refused before invocation', async () => {
  let calls = 0;
  await assert.rejects(evaluateMockCases([genericCase()], { mode: 'ACTUAL', run() { calls++; } }), /MOCK_ADAPTER_REQUIRED/);
  assert.equal(calls, 0);
});

test('failure and refusal expose only fixed reasons and never raw input or provider errors', async () => {
  const marker = 'SYNTHETIC_RAW_PROVIDER_PRIVATE_MARKER';
  const report = await evaluateMockCases([{ ...genericCase(), input: marker }], mock(() => { throw new Error(marker); }));
  assert.deepEqual(report.results[0].errors, ['ADAPTER_FAILURE_SIMULATED']);
  assert.ok(!JSON.stringify(report).includes(marker));
  assert.deepEqual((await run({ status: 'REFUSED' })).results[0].errors, ['MODEL_REFUSAL_SIMULATED']);
});

test('timeout wins even if an abort listener tries to turn cancellation into success', async () => {
  let aborted = false;
  const report = await evaluateMockCases([genericCase()], mock(({ signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => { aborted = true; resolve(genericResponse()); }, { once: true });
  })), { timeoutMs: 5 });
  assert.equal(aborted, true);
  assert.deepEqual(report.results[0].errors, ['MODEL_TIMEOUT_SIMULATED']);
});

test('late response cannot change a timed-out result or overwrite the next case result', async () => {
  let finishLate;
  const report = await evaluateMockCases([genericCase('old'), genericCase('new')], mock(({ caseId }) =>
    caseId === 'old' ? new Promise(resolve => { finishLate = resolve; }) : genericResponse()), { timeoutMs: 5 });
  const before = structuredClone(report);
  finishLate(genericResponse());
  await Promise.resolve();
  assert.deepEqual(report, before);
  assert.equal(report.results[0].matched, false);
  assert.equal(report.results[1].matched, true);
});

test('pre-cancelled batch invokes nothing and in-flight cancellation reaches adapter', async () => {
  const pre = new AbortController(); pre.abort();
  const skipped = await evaluateMockCases([genericCase()], mock(() => { throw new Error('MUST_NOT_RUN'); }), { signal: pre.signal });
  assert.equal(skipped.mockAdapterInvocations, 0);
  assert.deepEqual(skipped.results[0].errors, ['CANCELLED']);
  const active = new AbortController(); let observedAbort = false;
  const pending = evaluateMockCases([genericCase('first'), genericCase('second')], mock(({ signal }) => {
    signal.addEventListener('abort', () => { observedAbort = true; }, { once: true });
    queueMicrotask(() => active.abort());
    return new Promise(() => {});
  }), { signal: active.signal });
  const cancelled = await pending;
  assert.ok(observedAbort);
  assert.equal(cancelled.mockAdapterInvocations, 1);
  assert.ok(cancelled.results.every(result => result.errors.includes('CANCELLED')));
});

test('caller mutation cannot change detached expectations during an adapter call', async () => {
  const spec = genericCase();
  const report = await evaluateMockCases([spec], mock(() => {
    spec.expected.facts.observedValue = 750;
    return genericResponse();
  }));
  assert.equal(report.matched, 1);
});

test('cancellation after scheduling but before invocation does not call the adapter', async () => {
  const controller = new AbortController(); let calls = 0;
  const pending = evaluateMockCases([genericCase()], mock(() => { calls++; return genericResponse(); }), { signal: controller.signal });
  controller.abort();
  const report = await pending;
  assert.equal(calls, 0);
  assert.equal(report.mockAdapterInvocations, 0);
  assert.deepEqual(report.results[0].errors, ['CANCELLED']);
});

test('evaluator is independent of brand, reimbursement percentage and field vocabulary', async () => {
  const spec = {
    caseId: 'third-profile-tool-only', input: 'SYNTHETIC unrelated provider requirement', critical: true,
    expected: { facts: { completedModuleCount: 3, optionalDetail: null }, requiredLabels: ['QUESTION_REQUIRED'], forbiddenLabels: ['VERIFIED'], requiredQuestions: ['unsupported-source'] },
  };
  const report = await run({ status: 'OK', facts: { completedModuleCount: 3, optionalDetail: null }, labels: ['QUESTION_REQUIRED'], questionIds: ['unsupported-source'] }, spec);
  assert.equal(report.matched, 1);
  assert.equal(report.productAuthority, 'NONE');
});

test('self-check names its own denominator and CLI rejects accidental actual-run arguments', async () => {
  const report = await selfCheck();
  assert.equal(report.status, 'PASS');
  assert.equal(report.selfCheckCount, 9);
  assert.equal(report.catalogueCasesExecuted, 0);
  assert.equal(report.actualModelCalls, 0);
  const cli = fileURLToPath(new URL('./run.mjs', import.meta.url));
  const rejected = spawnSync(process.execPath, [cli, '--actual'], { encoding: 'utf8' });
  assert.equal(rejected.status, 2);
  assert.equal(rejected.stderr.trim(), 'PREPARATION_ARGUMENT_REJECTED');
  const inventory = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(inventory.status, 0);
  assert.equal(JSON.parse(inventory.stdout).catalogue.totalCaseSpecs, 45);
});
