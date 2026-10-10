// Read-only evidence audit. Prints JSON; never reruns or rewrites prior experiments.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(resolve(root, p));
const json = p => JSON.parse(read(p));
const sha = b => createHash('sha256').update(b).digest('hex');
const checks = [];
const check = (id, pass, observations) => checks.push({ id, pass: Boolean(pass), observations });
const before = json('stage8/artifacts/prior-file-hashes.json');
const changed = [], missing = [];
for (const [p, h] of Object.entries(before)) {
  if (!existsSync(resolve(root, p))) missing.push(p);
  else if (sha(read(p)) !== h) changed.push(p);
}
check('prior_evidence_unchanged', !changed.length && !missing.length, { files: Object.keys(before).length, changed, missing });
const r = json('stage7/artifacts/comparison-results.json');
const rows = r.results;
check('frozen_protocol_hash', sha(read('stage7/COMPARISON_PROTOCOL.md')) === r.protocolSha256, r.protocolSha256);
const counts = {
  scenarios: rows.length,
  protocolMatches: rows.filter(x => x.central.success === x.expected.central && x.onchain.success === x.expected.onchain).length,
  centralSuccess: rows.filter(x => x.central.success).length,
  onchainSuccess: rows.filter(x => x.onchain.success).length,
  centralFailure: rows.filter(x => !x.central.success).length,
  onchainFailure: rows.filter(x => !x.onchain.success).length,
};
check('historical_summary_recomputed', Object.entries(counts).every(([k, v]) => r.summary[k] === v), counts);
check('historical_expected_outcomes', counts.protocolMatches === 17 && rows.every(x => x.protocolMatch), { matched: counts.protocolMatches, expected: 17 });
const inputFailures = [];
for (const row of rows) {
  const h = sha(JSON.stringify(json('stage7/artifacts/' + row.savedInputs.evidence)));
  if (![row.evidenceSha256, row.central.inputEvidenceSha256, row.onchain.inputEvidenceSha256].every(x => x === h)) inputFailures.push(row.id);
}
check('saved_inputs_match_both_clients', !inputFailures.length, { pairs: rows.length, failed: inputFailures, method: 'SHA256 of JSON.stringify(parsed saved input), same serialization as historical clients' });
const clockFailures = rows.filter(x => x.clockEvidence.centralClockFileSeconds !== x.time || (x.id === 'chain-down' ? x.clockEvidence.chainBlockSeconds !== null || !x.clockEvidence.chainUnavailable : x.clockEvidence.chainBlockSeconds !== x.time)).map(x => x.id);
check('historical_clock_observations', !clockFailures.length, { compared: rows.length, failed: clockFailures, unavailableChainRows: 1 });
const requiredStops = { 'main-down': ['main'], 'issuer-down': ['issuerService'], 'both-down': ['main', 'issuerService'], 'executor-down': ['executor'], 'chain-down': ['chain'], 'ui-down': ['centralUI', 'onchainUI'] };
const stopFailures = [];
for (const [id, names] of Object.entries(requiredStops)) {
  const row = rows.find(x => x.id === id);
  for (const name of names) if (!row.processStops.some(s => s.component === name && Number.isInteger(s.pid) && s.exitCode === 0 && s.reachableAfterExit === false)) stopFailures.push(id + ':' + name);
}
check('historical_process_stop_records', !stopFailures.length, { scenarios: Object.keys(requiredStops).length, requiredStops: Object.values(requiredStops).flat().length, failed: stopFailures, note: 'Re-read historical PID exit and connection observations; no processes stopped in stage8' });
const regress = json('stage7/artifacts/regression-results.json');
check('historical_80_regression_records', regress.results.length === 4 && regress.results.every(x => x.pass === x.expected && x.fail === 0 && x.exitCode === 0 && x.tapSummary.includes('# pass ' + x.pass)) && regress.results.reduce((n, x) => n + x.pass, 0) === 80, regress.results.map(({ stage, pass, fail, exitCode }) => ({ stage, pass, fail, exitCode })));
const tap = read('stage7/artifacts/stage7-tests.tap').toString();
check('historical_21_tap_record', /^# tests 21$/m.test(tap) && /^# pass 21$/m.test(tap) && /^# fail 0$/m.test(tap), { tests: Number(tap.match(/^# tests (\d+)$/m)?.[1]), passed: Number(tap.match(/^# pass (\d+)$/m)?.[1]) });
const verification = json('stage7/artifacts/verification-summary.json');
check('historical_verification_total', verification.totalAutomatedTestsPassed === 101 && verification.existingTestsPassed === 80 && verification.newTestsPassed === 21, { historicalTests: verification.totalAutomatedTestsPassed, rerunInStage8: false });
const f = rows.find(x => x.id === 'false-attestation');
const m = rows.find(x => x.id === 'missing');
check('fact_oracle_limit_in_records', f.actualSubmissionFact === false && f.central.success && f.onchain.success && !m.central.success && !m.onchain.success, { falseAttestation: [f.central.success, f.onchain.success], missing: [m.central.success, m.onchain.success], kind: 'synthetic fixture, not actual learner observations' });
const b = json('stage7/artifacts/browser-checks.json');
check('human_and_wallet_evidence_limits', r.actualUsers === 0 && b.actualUsers === 0 && b.fileChooser.completed === false && b.onchain.walletMethod.includes('no extension wallet'), { actualUsers: b.actualUsers, osFileSelectionCompleted: b.fileChooser.completed, walletMethod: b.onchain.walletMethod });
const misleading = rows.filter(x => x.onchain.approvalEvidence.includes('decision IPC')).map(x => x.id);
const output = {
  auditedAt: new Date().toISOString(), kind: 'read-only historical evidence consistency checks, not rerun security tests',
  checksPassed: checks.filter(x => x.pass).length, checksFailed: checks.filter(x => !x.pass).length, checks,
  warnings: [{ id: 'KNOWN_STAGE7_APPROVAL_METADATA', affectedRows: misleading.length, rows: misleading, correctedInterpretation: 'Central: executor decision and ledger commit. Onchain: contract/receipt/Paid/Transfer/settled verification. The shared decision IPC phrase is not evidence of onchain network requests; source stage7/compare.mjs:23. Old records preserved.' }],
  notExecuted: ['Stage2–7 product test reruns', 'live-chain receipt requery', 'competitor API or contract executions', 'model inference', 'human study'],
};
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
if (output.checksFailed) process.exitCode = 1;
