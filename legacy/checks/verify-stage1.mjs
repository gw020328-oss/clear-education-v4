import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(resolve(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const sha = s => createHash('sha256').update(s).digest('hex');
const manifest = json('baseline/manifest.json');
for (const [name, expected] of Object.entries(manifest.files)) {
  assert.equal(sha(read(`baseline/${name}`)), expected, `baseline: ${name}`);
  assert.equal(sha(readFileSync(resolve(manifest.originalDirectory, name))), expected, `original: ${name}`);
}
for (const name of ['PROTOCOL.md', 'RefundVault.sol']) {
  assert.equal(read(`reproduction/${name}`), read(`baseline/${name}`));
}
const adaptedRunner = read('baseline/run.mjs')
  .replace('// Reuse installed, pinned tools without modifying the previous experiment.', '// Resolve the isolated dependency copy; experiment logic is unchanged.')
  .replace("new URL('../codeproof-evidence-2026-09-13/escrow/package.json', import.meta.url)", "new URL('../package.json', import.meta.url)");
assert.equal(read('reproduction/run.mjs'), adaptedRunner, 'only dependency path/comment changed');
const baseline = json('baseline/results.json');
const actual = json('reproduction/results.json');
const outcomes = result => result.scenarios.map(s => [s.scenario, s.central.accepted, s.onchain.accepted]);
assert.equal(actual.scenarios.length, 14);
assert.equal(actual.summary.expectedOutcomesMatched, 14);
assert.deepEqual(outcomes(actual), outcomes(baseline));
assert.equal(actual.auxiliary.length, 5);
assert(actual.auxiliary.every(s => s.passed === true));
assert.deepEqual(actual.auxiliary, baseline.auxiliary);
assert.deepEqual(actual.versions, baseline.versions);
assert.deepEqual(actual.compilerSettings, baseline.compilerSettings);
assert.equal(actual.protocolSHA256, manifest.files['PROTOCOL.md']);
assert.equal(actual.sourceSHA256, manifest.files['RefundVault.sol']);
assert.equal(actual.runnerSHA256, sha(adaptedRunner));
assert.deepEqual(actual.summary.differingCases, baseline.summary.differingCases);
assert.equal(actual.conditions.amount, '50000000');
assert.equal(actual.conditions.termsHash, baseline.conditions.termsHash);
assert.equal(actual.conditions.domain.chainId, 31337);
assert.equal(actual.summary.runtimeBytes, baseline.summary.runtimeBytes);
const outputs = ['reproduction/results.json', 'reproduction/run.log'];
for (const file of outputs) {
  assert(!/\b(?:privateKey|secretKey|mnemonic|seedPhrase)\b\s*[=:]/i.test(read(file)), `secret field: ${file}`);
}
const result = {
  checkedAt: new Date().toISOString(),
  originalFilesUnchanged: 5, baselineFilesMatch: 5,
  runnerChanges: ['dependency resolution path', 'associated comment'],
  scenarioOutcomesMatched: 14, auxiliaryPassed: 5,
  versionsMatched: true, compilerSettingsMatched: true,
  artifactSecretFieldScanPassed: true,
  scanLimit: 'Field-name scan and manual code/log review, not a general secret detector.',
  gas: Object.fromEntries(['normalClaimGas', 'deploymentGas', 'enrollmentGas', 'approvalGas'].map(k => [k, {baseline: baseline.summary[k], reproduced: actual.summary[k]}])),
  excludedFromExactComparison: ['timestamps', 'transaction hashes', 'gas (signature bytes can change calldata cost)', 'runner hash (path adaptation)']
};
writeFileSync(resolve(root, 'checks/verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
