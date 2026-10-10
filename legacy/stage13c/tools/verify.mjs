// Read-only Stage 13C audit. Never reads credentials or calls a network.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { auditSchema, encode } from './schema-audit.mjs';
import { buildRequest } from './gemini-runner.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const stage = 'stage13c/';
const read = p => JSON.parse(fs.readFileSync(project + p));
const sha = p => createHash('sha256').update(fs.readFileSync(project + p)).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function require(value) { if (!value) throw new Error('CHECK_FAILED'); }

function inventory() {
  const files = [], symlinks = {};
  function walk(dir = '') {
    for (const entry of fs.readdirSync(project + dir, {withFileTypes: true})) {
      const p = dir + entry.name;
      if (entry.isDirectory()) walk(p + '/');
      else if (entry.isSymbolicLink()) {
        symlinks[p] = fs.readlinkSync(project + p);
        if (fs.statSync(project + p).isFile()) files.push(p);
      } else if (entry.isFile()) files.push(p);
    }
  }
  walk();
  return {files: files.sort(), symlinks};
}

export function verify({withChecksums = false} = {}) {
  const checks = [];
  const check = (name, fn) => {
    try { checks.push({name, passed: true, detail: fn()}); }
    catch { checks.push({name, passed: false, error: 'CHECK_FAILED_NO_ERROR_BODY_LOGGED'}); }
  };
  const prior = read(stage + 'artifacts/prior-files.json');
  const all = inventory();
  const run = read(stage + 'RUN_RECORD.json');
  const plan = read(stage + 'EXECUTION_PLAN.json');
  const transport = read(stage + 'TRANSPORT_LOCK.json');
  const model = read(stage + 'MODEL_LOCK.json');
  const originalCalls = read('stage12/protocol-v3/CALL_PLAN.json');
  const expected = 'BLOCKED_SCHEMA_INCOMPATIBLE';

  check('all-existing-project-files-byte-identical', () => {
    const changed = Object.entries(prior.files).filter(([p, h]) => !fs.existsSync(project + p) || sha(p) !== h).map(([p]) => p);
    require(changed.length === 0);
    return {checked: Object.keys(prior.files).length, changed, includesNodeModulesAndHiddenFiles: true};
  });
  check('existing-symlinks-identical', () => {
    const changed = Object.entries(prior.symlinks).filter(([p, target]) => all.symlinks[p] !== target).map(([p]) => p);
    require(changed.length === 0);
    return {checked: Object.keys(prior.symlinks).length, changed};
  });
  check('all-new-files-confined-to-stage13c', () => {
    const extras = all.files.filter(p => !p.startsWith(stage) && !Object.hasOwn(prior.files, p));
    const links = Object.keys(all.symlinks).filter(p => !p.startsWith(stage) && !Object.hasOwn(prior.symlinks, p));
    require(extras.length === 0 && links.length === 0);
    return {newFilesOutsideStage13c: extras, newLinksOutsideStage13c: links, scope: 'Project only; home Git repository deliberately not used as project scope.'};
  });
  check('prechecks-completed-before-stage13c-creation', () => {
    const summary = read(stage + 'artifacts/precheck/summary.json');
    const commands = read(stage + 'artifacts/precheck/commands.json');
    const b = read(stage + 'artifacts/precheck/stage13b-verify.json');
    const scorer = read(stage + 'artifacts/precheck/stage12-scorer.json');
    const sums = fs.readFileSync(project + stage + 'artifacts/precheck/stage13b-checksums.txt', 'utf8').trim().split('\n');
    require(summary.passed && summary.stage13cDidNotExistDuringChecks && summary.previousFilesPreserved);
    require(commands.length === 3 && commands.every(c => c.exitCode === 0 && c.performedBeforeStage13cCreation));
    require(b.passed === 13 && b.failed === 0 && scorer.passed === 42 && scorer.failed === 0);
    require(sums.length === 23 && sums.every(line => line.endsWith(': OK')));
    require(read('stage13b/RUN_RECORD.json').actualSemanticCalls === 0);
    return {stage13bVerifier: '13/13', stage13bChecksums: '23/23', stage12Scorer: '42/42', stage13bSemanticCalls: 0,
      stage13bVerifierRerunByThisTool: false};
  });
  check('exact-authorization-and-boolean-key-record', () => {
    const auth = read(stage + 'artifacts/authorization.json').authorization;
    const keys = read(stage + 'artifacts/key-presence.json');
    require(auth.approved && auth.provider === 'GOOGLE' && auth.route === 'GEMINI_API_FREE_TIER' && auth.model === 'gemini-3.8-flash');
    require(auth.thinking_level === 'medium' && auth.api_key_environment_variable === 'GEMINI_API_KEY');
    require(auth.allow_free_api && !auth.allow_paid_api && auth.max_cost_usd === 0 && !auth.allow_billing_changes && !auth.allow_model_download);
    require([run, transport, model].every(x => equal(x.authorization, auth)));
    require(keys.GEMINI_API_KEY_present === true && keys.GOOGLE_API_KEY_present === false);
    require(!keys.credentialFileSearchPerformed && !keys.homeCredentialSearchPerformed);
    return {GEMINI_API_KEY: true, GOOGLE_API_KEY: false, credentialSearch: false, authentication: 'NOT_RUN'};
  });
  check('stage12-frozen-inputs-and-manifest-preserved', () => {
    const sources = read(stage + 'artifacts/source-hashes.json').files;
    require(Object.values(sources).every(({path, sha256}) => sha(path) === sha256));
    const manifest = read('stage12/protocol-v3/SHA256_MANIFEST.json');
    require(Object.entries(manifest.files).every(([p, h]) => sha('stage12/' + p) === h));
    require(sha('stage12/protocol-v3/SHA256_MANIFEST.json') === read('stage12/protocol-v3/FREEZE_RECEIPT.json').manifestSha256);
    return {sourceHashEntries: Object.keys(sources).length, stage12ManifestFiles: Object.keys(manifest.files).length};
  });
  check('rejected-schema-and-fixture-mismatches-reproduce', () => {
    const {candidate, report} = auditSchema();
    const saved = read(stage + 'artifacts/schema/compatibility.json');
    require(equal(saved, report));
    require(equal(candidate, read(stage + 'artifacts/schema/gemini-candidate.schema.json')));
    require(sha(stage + 'artifacts/schema/gemini-candidate.schema.json') === report.candidateSchemaSha256);
    require(!report.compatible && report.status === expected && report.fixtureCount === 35 && report.equivalentFixtureCount === 32);
    require(equal(report.mismatches.map(x => x.id), ['duplicate-span-format', 'empty-question-format', 'zero-denominator']));
    require(report.mismatches.every(x => !x.originalAccept && x.candidateAccept));
    return {fixtures: 35, matching: 32, mismatches: 3, aggregateScorerTestsNotSchemaInputs: 7, candidateNeverTransmitted: true};
  });
  check('blocked-transport-record-hashes-match', () => {
    require(transport.status === expected && transport.frozen && !transport.executionEnabled && !transport.validated);
    require(transport.transportCodeSha256 === sha(stage + 'tools/gemini-runner.mjs'));
    require(transport.schemaAuditCodeSha256 === sha(stage + 'tools/schema-audit.mjs'));
    require(transport.transportAddendumSha256 === sha(stage + 'TRANSPORT_ADDENDUM.md'));
    require(transport.schemaCompatibilityDocumentSha256 === sha(stage + 'SCHEMA_COMPATIBILITY.md'));
    require(model.transportLockSha256 === sha(stage + 'TRANSPORT_LOCK.json') && plan.transportLockSha256 === sha(stage + 'TRANSPORT_LOCK.json'));
    return {blockedSpecificationFrozen: true, runnableAdapterValidated: false};
  });
  check('no-fabricated-before-semantic-activation-lock', () => {
    require(model.status === 'NOT_RUN' && !model.locked && !plan.executionPlanFrozen && !plan.modelLockActivated);
    require(model.actualUsedModel === null && model.actualModelVersion === null && model.schemaSha256 === null);
    require(transport.firstModelCallAt === null && transport.appliedTransport === null && transport.geminiSchemaSha256 === null);
    require(!fs.existsSync(project + stage + 'checksums-before-run.sha256'));
    return {firstSemanticCall: 'NOT_RUN', modelAndExecutionActivation: 'NOT_RUN', beforeRunChecksums: 'NOT_CREATED_SMOKE_NOT_RUN'};
  });
  check('original-42-call-order-splits-repeat-identifiers-preserved', () => {
    require(equal(plan.calls, originalCalls) && plan.sourceCallPlanSha256 === sha('stage12/protocol-v3/CALL_PLAN.json'));
    require(originalCalls.length === 42 && originalCalls.filter(c => c.split === 'dev').length === 6 && originalCalls.filter(c => c.split === 'eval').length === 36);
    require(plan.repeatSeedUse === 'IDENTIFIER_ONLY_NOT_SENT_TO_GEMINI');
    return {planned: 42, dev: 6, eval: 36, executionStarted: false};
  });
  check('bc-settings-equality-not-claimed-without-calls', () => {
    require(equal(plan.intendedSettings, transport.intendedSettings));
    require(plan.actualAppliedSettings === null && model.actualSettingsEquality === 'NOT_RUN');
    require(plan.intendedSettings.minimum_interval_seconds === 15 && plan.intendedSettings.parallel_calls === 1);
    require(plan.intendedSettings.model === 'gemini-3.8-flash' && plan.intendedSettings.thinking_level === 'medium');
    return {intendedSettingsCommon: true, actualBCSettingsEquality: 'NOT_RUN'};
  });
  check('zero-requests-retries-repairs-and-model-raw-files', () => {
    require([run.actualModelEndpointRequests, run.actualMetadataRequests, run.actualSmokeCalls, run.actualSemanticCalls,
      run.actualRetries, run.actualJsonRepairs, run.manualCorrections, run.codexResponsesUsedAsEvaluationData, run.replayResponses].every(x => x === 0));
    require(run.plannedSemanticCalls === 42 && run.unstartedPlannedCalls === 42 && run.requests.length === 0 && run.rawResponses.length === 0);
    const raw = all.files.filter(p => p.startsWith(stage + 'raw/') && !p.endsWith('/README.md'));
    require(raw.length === 0);
    return {smoke: 0, semantic: 0, metadata: 0, planned: 42, unstarted: 42, rawModelResponseFiles: 0, retries: 0, jsonRepair: 0, manualCorrection: 0};
  });
  check('runner-stops-before-request-construction', () => {
    let blocked = false;
    try { buildRequest('Neutral non-benchmark input', {}); } catch (error) { blocked = error.message === expected; }
    require(blocked);
    return {blockedBeforeRequestConstruction: true, networkImplementation: 'ABSENT'};
  });
  check('zero-paid-requests-and-no-invented-quota', () => {
    require(run.actualCostUSD === 0 && run.actualModelDownloadGB === 0 && run.billingChanges === 0 && run.actualModelEndpointRequests === 0);
    require(['RPM', 'TPM', 'RPD'].every(k => run.quota[k] === 'UNKNOWN'));
    require(run.freeTier.confirmed === null && run.usage === null && run.paidUsageDetected === false);
    return {apiCostUSD: 0, basis: 'No API requests', accountBillingTier: 'UNKNOWN', RPM: 'UNKNOWN', TPM: 'UNKNOWN', RPD: 'UNKNOWN'};
  });
  check('no-recognizable-recorded-secret-or-auth-header-value', () => {
    const patterns = [/\bAIza[0-9A-Za-z_-]{20,}\b/, /["'](?:x-goog-api-key|authorization)["']\s*:\s*["'][^"']+["']/i];
    const stageFiles = all.files.filter(p => p.startsWith(stage));
    let matches = 0;
    for (const p of stageFiles) {
      const value = fs.readFileSync(project + p, 'utf8');
      if (patterns.some(pattern => pattern.test(value))) matches++;
    }
    require(matches === 0);
    return {scope: 'All stage13c files', matches: 0, actualKeyValueReadByAudit: false,
      basis: 'Recognizable-pattern scan plus boolean-only credential handling and no authentication/network path.',
      limitation: 'Pattern scan is not a proof against every possible secret encoding; shell/conversation logs are assessed from executed commands, not a filesystem search.'};
  });
  check('not-run-metrics-audit-and-exactly-one-verdict', () => {
    require(run.finalVerdict === expected && run.status === 'BLOCKED' && run.metrics.status === 'NOT_RUN');
    require(run.metrics.B === null && run.metrics.C === null && run.metrics.pairedCases === null && run.metrics.repeatConsistency === null);
    const audit = read(stage + 'artifacts/error-audit.json');
    require(audit.categories.length === 9 && audit.categories.every(x => x.status === 'NOT_RUN' && x.count === null && x.cases === null));
    const text = fs.readFileSync(project + stage + 'DECISION.md', 'utf8');
    require(text.split('\n\n')[1] === expected);
    return {finalVerdict: expected, BCPerformance: 'NOT_RUN', aiCorePromotion: 'DEFERRED', semanticConclusionMade: false};
  });
  check('required-nonempty-artifacts', () => {
    const required = ['README.md', 'AUTHORIZATION.md', 'PREFLIGHT.md', 'TRANSPORT_ADDENDUM.md', 'TRANSPORT_LOCK.json',
      'SCHEMA_COMPATIBILITY.md', 'MODEL_LOCK.json', 'EXECUTION_PLAN.json', 'RUN_RECORD.json', 'RESULTS.md', 'ERROR_AUDIT.md', 'DECISION.md',
      'artifacts/prior-files.json', 'tools/gemini-runner.mjs', 'raw/smoke/README.md', 'raw/semantic/README.md'];
    require(required.every(p => fs.statSync(project + stage + p).size > 0));
    return {requiredNonemptyFiles: required.length, finalReportAndChecksums: withChecksums ? 'CHECKED_BELOW' : 'GENERATED_AFTER_THIS_AUDIT'};
  });
  if (withChecksums) check('final-report-and-checksum-integrity-coverage', () => {
    const final = read(stage + 'artifacts/final-verification.json');
    require(final.failed === 0 && final.finalVerdict === expected && final.priorFilesByteIdentical);
    const lines = fs.readFileSync(project + stage + 'checksums.sha256', 'utf8').trim().split('\n');
    const entries = lines.map(line => { const index = line.indexOf('  '); return [line.slice(0, index), line.slice(index + 2)]; });
    const expectedFiles = all.files.filter(p => p.startsWith(stage) && p !== stage + 'checksums.sha256');
    require(entries.length === expectedFiles.length && new Set(entries.map(([, p]) => p)).size === entries.length);
    require(equal(entries.map(([, p]) => p).sort(), expectedFiles));
    require(entries.every(([h, p]) => /^[a-f0-9]{64}$/.test(h) && sha(p) === h));
    return {matchedFiles: entries.length, excludesSelf: true, includesFinalVerification: true};
  });
  return {kind: 'STAGE13C_READ_ONLY_PRESERVATION_AND_BLOCKED_RUN_AUDIT', recordedAt: new Date().toISOString(),
    finalVerdict: expected, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length,
    total: checks.length, priorFilesByteIdentical: checks.find(c => c.name === 'all-existing-project-files-byte-identical').passed,
    checksumMode: withChecksums ? 'VERIFIED' : 'CREATE_MANIFEST_AFTER_RECORDING_THIS_REPORT', checks};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = verify({withChecksums: process.argv.includes('--with-checksums')});
    console.log(encode(result));
    process.exitCode = result.failed ? 1 : 0;
  } catch { console.log(JSON.stringify({status: 'AUDIT_SETUP_FAILURE', detail: 'Error body suppressed'})); process.exitCode = 1; }
}
